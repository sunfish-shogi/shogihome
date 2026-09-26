import {
  ENGINE_INDEX_FORMAT,
  getEnginePackageDirName,
  getEnginePackageSize,
  isEngineManifestPath,
  isValidEnginePackageIdentifier,
  parseEngineIndex,
} from "@/common/wasm-engine/package.js";

const INDEX_URL = "https://example.com/shogihome/engine-index.json";
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
    expect(index.errors).toEqual([]);
  });

  it("parseEngineIndex/relativePackageURL", () => {
    const json = validIndex();
    json.engines[0].packageURL = "webapp/engines/sunfish4-lite/";
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
      "http://localhost:6173/engine-index.json",
    );
    expect(index.engines[0].packageURL).toBe("http://localhost:6173/e/");
  });

  it("parseEngineIndex/invalidFormat", () => {
    expect(() => parseEngineIndex({ ...validIndex(), format: "unknown" }, INDEX_URL)).toThrow(
      /unsupported format/,
    );
    expect(() => parseEngineIndex({ ...validIndex(), engines: {} }, INDEX_URL)).toThrow(
      /engines must be an array/,
    );
    expect(() => parseEngineIndex(null, INDEX_URL)).toThrow(/invalid engine index/);
  });

  const invalidCases: [string, (pkg: ReturnType<typeof validPackage>) => void][] = [
    ["http", (pkg) => (pkg.packageURL = "http://engines.example.com/e/")],
    [
      "file scheme",
      (pkg) => (pkg.files[1] = { ...pkg.files[1], url: "file:///etc/passwd" } as never),
    ],
    ["no trailing slash", (pkg) => (pkg.packageURL = "https://example.com/e")],
    ["query", (pkg) => (pkg.packageURL = "https://example.com/e/?a=1")],
    ["path traversal", (pkg) => (pkg.files[1].path = "../evil.js")],
    ["absolute path", (pkg) => (pkg.files[1].path = "/evil.js")],
    ["invalid hash", (pkg) => (pkg.files[1].sha256 = "xyz")],
    ["uppercase hash", (pkg) => (pkg.files[1].sha256 = "A".repeat(64))],
    ["negative size", (pkg) => (pkg.files[1].size = -1)],
    ["no manifest", (pkg) => pkg.files.shift()],
    ["duplicated path", (pkg) => (pkg.files[1].path = "ENGINE.json")],
    ["invalid id", (pkg) => (pkg.id = "../x")],
    ["invalid version", (pkg) => (pkg.version = "1/2")],
    ["no licenses", (pkg) => (pkg.licenses = [])],
  ];

  // 不正な項目だけを除外し、他の項目は使えること。
  it.each(invalidCases)("parseEngineIndex/invalidEntry: %s", (_, modify) => {
    const invalid = validPackage();
    modify(invalid);
    const other = { ...validPackage(), id: "other.engine" };
    const index = parseEngineIndex(
      { format: ENGINE_INDEX_FORMAT, engines: [invalid, other] },
      INDEX_URL,
    );
    expect(index.engines.map((e) => e.id)).toEqual(["other.engine"]);
    expect(index.errors).toHaveLength(1);
    expect(index.errors[0]).toMatch(/^invalid engine index: engines\[0\]/);
  });

  it("parseEngineIndex/duplicatedID", () => {
    const second = { ...validPackage(), version: "2" };
    const index = parseEngineIndex(
      { format: ENGINE_INDEX_FORMAT, engines: [validPackage(), second] },
      INDEX_URL,
    );
    // 先のものを採る。
    expect(index.engines.map((e) => e.version)).toEqual(["2026-09-01"]);
    expect(index.errors).toHaveLength(1);
    expect(index.errors[0]).toMatch(/duplicated/);
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
