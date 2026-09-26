import {
  ENGINE_INDEX_FORMAT,
  getEnginePackageDirName,
  getEnginePackageSize,
  isEngineManifestPath,
  isValidEnginePackageIdentifier,
  parseEngineIndex,
} from "@/common/wasm-engine/package.js";

const INDEX_URL = "https://example.com/shogihome/webapp/engines/index.json";
const HASH = "0".repeat(64);

const validPackage = () => ({
  id: "example.engine",
  version: "2026-09-01",
  name: "Example Engine",
  author: "Author",
  publisher: "example",
  licenses: ["GPL-3.0-or-later"],
  packageURL: "https://engines.example.com/engine/2026-09-01/",
  files: [
    { path: "engine.json", sha256: HASH, size: 100 },
    { path: "engine.js", sha256: HASH, size: 200 },
    { path: "eval/nn.bin", url: "https://assets.example.com/nn.bin", sha256: HASH, size: 300 },
  ],
});

const validIndex = () => ({ format: ENGINE_INDEX_FORMAT, engines: [validPackage()] });

describe("wasm-engine/package", () => {
  it("parseEngineIndex", () => {
    const index = parseEngineIndex(validIndex(), INDEX_URL);
    expect(index.engines).toHaveLength(1);
    const pkg = index.engines[0];
    expect(pkg.packageURL).toBe("https://engines.example.com/engine/2026-09-01/");
    // url を省略したファイルはパッケージの URL からの相対になる。
    expect(pkg.files[0].url).toBe("https://engines.example.com/engine/2026-09-01/engine.json");
    expect(pkg.files[2].url).toBe("https://assets.example.com/nn.bin");
    expect(getEnginePackageSize(pkg.files)).toBe(600);
  });

  it("parseEngineIndex/relativePackageURL", () => {
    const json = validIndex();
    json.engines[0].packageURL = "sunfish4-lite/";
    const index = parseEngineIndex(json, INDEX_URL);
    expect(index.engines[0].packageURL).toBe(
      "https://example.com/shogihome/webapp/engines/sunfish4-lite/",
    );
    expect(index.engines[0].files[1].url).toBe(
      "https://example.com/shogihome/webapp/engines/sunfish4-lite/engine.js",
    );
  });

  it("parseEngineIndex/localhost", () => {
    const index = parseEngineIndex(
      { format: ENGINE_INDEX_FORMAT, engines: [{ ...validPackage(), packageURL: "e/" }] },
      "http://localhost:5173/engines/index.json",
    );
    expect(index.engines[0].packageURL).toBe("http://localhost:5173/engines/e/");
  });

  const invalidCases: [string, (json: ReturnType<typeof validIndex>) => void][] = [
    ["unknown format", (json) => (json.format = "unknown")],
    ["http", (json) => (json.engines[0].packageURL = "http://engines.example.com/e/")],
    [
      "file scheme",
      (json) =>
        (json.engines[0].files[1] = {
          ...json.engines[0].files[1],
          url: "file:///etc/passwd",
        } as never),
    ],
    ["no trailing slash", (json) => (json.engines[0].packageURL = "https://example.com/e")],
    ["query", (json) => (json.engines[0].packageURL = "https://example.com/e/?a=1")],
    ["path traversal", (json) => (json.engines[0].files[1].path = "../evil.js")],
    ["absolute path", (json) => (json.engines[0].files[1].path = "/evil.js")],
    ["invalid hash", (json) => (json.engines[0].files[1].sha256 = "xyz")],
    ["uppercase hash", (json) => (json.engines[0].files[1].sha256 = "A".repeat(64))],
    ["negative size", (json) => (json.engines[0].files[1].size = -1)],
    ["no manifest", (json) => json.engines[0].files.shift()],
    ["duplicated path", (json) => (json.engines[0].files[1].path = "ENGINE.json")],
    ["invalid id", (json) => (json.engines[0].id = "../x")],
    ["invalid version", (json) => (json.engines[0].version = "1/2")],
    ["no licenses", (json) => (json.engines[0].licenses = [])],
    ["duplicated id", (json) => json.engines.push(validPackage())],
  ];

  it.each(invalidCases)("parseEngineIndex/invalid: %s", (_, modify) => {
    const json = validIndex();
    modify(json);
    expect(() => parseEngineIndex(json, INDEX_URL)).toThrow(/invalid engine index/);
  });

  it("identifier", () => {
    expect(isValidEnginePackageIdentifier("example.engine")).toBeTruthy();
    expect(isValidEnginePackageIdentifier("0123abcdef")).toBeTruthy();
    expect(isValidEnginePackageIdentifier("..")).toBeFalsy();
    expect(isValidEnginePackageIdentifier("a..b")).toBeFalsy();
    expect(isValidEnginePackageIdentifier(".hidden")).toBeFalsy();
    expect(isValidEnginePackageIdentifier("a/b")).toBeFalsy();
    expect(getEnginePackageDirName("a", "1")).toBe("a@1");
  });

  it("isEngineManifestPath", () => {
    expect(isEngineManifestPath("/home/user/engines/a@1/engine.json")).toBeTruthy();
    expect(isEngineManifestPath("C:\\engines\\a@1\\engine.json")).toBeTruthy();
    expect(isEngineManifestPath("engine.json")).toBeTruthy();
    expect(isEngineManifestPath("/home/user/engines/YaneuraOu")).toBeFalsy();
    expect(isEngineManifestPath("/home/user/my-engine.json")).toBeFalsy();
  });
});
