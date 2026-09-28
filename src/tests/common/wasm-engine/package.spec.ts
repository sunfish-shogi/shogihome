import {
  ENGINE_INDEX_FORMAT,
  getEnginePackageDirName,
  getEnginePackageSize,
  isEngineManifestPath,
  isValidEnginePackageIdentifier,
  parseEngineIndex,
  validateManifestLicenses,
} from "@/common/wasm-engine/package.js";
import { EngineManifest } from "@/common/wasm-engine/manifest.js";

const HASH = "0".repeat(64);

const validPackage = () => ({
  id: "example.engine",
  version: "2026-09-01",
  name: "Example Engine",
  author: "Author",
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
    const index = parseEngineIndex(validIndex());
    expect(index.engines).toHaveLength(1);
    const pkg = index.engines[0];
    expect(pkg.packageURL).toBe("https://engines.example.com/engine/2026-09-01/");
    // url を省略したファイルはパッケージの URL からの相対になる。
    expect(pkg.files[0].url).toBe("https://engines.example.com/engine/2026-09-01/engine.json");
    expect(pkg.files[2].url).toBe("https://assets.example.com/nn.bin");
    expect(getEnginePackageSize(pkg.files)).toBe(600);
    expect(index.errors).toEqual([]);
  });

  // packageURL は絶対 URL に限る。相対 URL の基準を持たないため。
  it("parseEngineIndex/relativePackageURL", () => {
    const json = validIndex();
    json.engines[0].packageURL = "engines/example/";
    const index = parseEngineIndex(json);
    expect(index.engines).toEqual([]);
    expect(index.errors[0]).toMatch(/packageURL is not a valid URL/);
  });

  it("parseEngineIndex/localhost", () => {
    const index = parseEngineIndex({
      format: ENGINE_INDEX_FORMAT,
      engines: [{ ...validPackage(), packageURL: "http://localhost:6173/e/" }],
    });
    expect(index.engines[0].packageURL).toBe("http://localhost:6173/e/");
  });

  it("parseEngineIndex/invalidFormat", () => {
    expect(() => parseEngineIndex({ ...validIndex(), format: "unknown" })).toThrow(
      /unsupported format/,
    );
    expect(() => parseEngineIndex({ ...validIndex(), engines: {} })).toThrow(
      /engines must be an array/,
    );
    expect(() => parseEngineIndex(null)).toThrow(/invalid engine index/);
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
    ["uppercase manifest only", (pkg) => (pkg.files[0].path = "ENGINE.JSON")],
    ["file and directory", (pkg) => pkg.files.push({ path: "eval", sha256: HASH, size: 1 })],
    ["file and directory (case)", (pkg) => pkg.files.push({ path: "EVAL", sha256: HASH, size: 1 })],
    ["invalid id", (pkg) => (pkg.id = "../x")],
    ["invalid version", (pkg) => (pkg.version = "1/2")],
    ["no licenses", (pkg) => (pkg.licenses = [])],
    ["windows device name", (pkg) => (pkg.files[1].path = "NUL.js")],
    ["windows device name (case)", (pkg) => (pkg.files[1].path = "con")],
    ["windows device name (directory)", (pkg) => (pkg.files[2].path = "lpt1/nn.bin")],
    ["windows device name (multiple dots)", (pkg) => (pkg.files[1].path = "aux.tar.gz")],
    ["trailing period", (pkg) => (pkg.files[1].path = "engine.js.")],
    ["trailing period (directory)", (pkg) => (pkg.files[2].path = "eval./nn.bin")],
    ["trailing period in version", (pkg) => (pkg.version = "1.0.")],
    ["trailing period in id", (pkg) => (pkg.id = "example.")],
    ["reserved path", (pkg) => (pkg.files[1].path = "install.json")],
    ["reserved path (case)", (pkg) => (pkg.files[1].path = "Install.JSON")],
    ["reserved path as directory", (pkg) => (pkg.files[1].path = "install.json/x.bin")],
  ];

  // 予約名を含むだけの名前や、途中のピリオドは問題ない。
  it("parseEngineIndex/windowsSafeNames", () => {
    const pkg = validPackage();
    pkg.version = "1.0.2";
    pkg.files[1].path = "console.js";
    pkg.files[2].path = "nul-data/com10.bin";
    const index = parseEngineIndex({ format: ENGINE_INDEX_FORMAT, engines: [pkg] });
    expect(index.errors).toEqual([]);
  });

  // インストーラーのメタデータと衝突するのはパッケージの直下だけ。
  it("parseEngineIndex/installJSONInSubdirectory", () => {
    const pkg = validPackage();
    pkg.files[2].path = "eval/install.json";
    const index = parseEngineIndex({ format: ENGINE_INDEX_FORMAT, engines: [pkg] });
    expect(index.errors).toEqual([]);
    expect(index.engines[0].files[2].path).toBe("eval/install.json");
  });

  // 不正な項目だけを除外し、他の項目は使えること。
  it.each(invalidCases)("parseEngineIndex/invalidEntry: %s", (_, modify) => {
    const invalid = validPackage();
    modify(invalid);
    const other = { ...validPackage(), id: "other.engine" };
    const index = parseEngineIndex({ format: ENGINE_INDEX_FORMAT, engines: [invalid, other] });
    expect(index.engines.map((e) => e.id)).toEqual(["other.engine"]);
    expect(index.errors).toHaveLength(1);
    expect(index.errors[0]).toMatch(/^invalid engine index: engines\[0\]/);
  });

  it("parseEngineIndex/duplicatedIDIgnoringCase", () => {
    const second = { ...validPackage(), id: "Example.Engine" };
    const index = parseEngineIndex({
      format: ENGINE_INDEX_FORMAT,
      engines: [validPackage(), second],
    });
    expect(index.engines.map((e) => e.id)).toEqual(["example.engine"]);
    expect(index.errors).toHaveLength(1);
    expect(index.errors[0]).toMatch(/duplicated/);
  });

  it("parseEngineIndex/duplicatedID", () => {
    const second = { ...validPackage(), version: "2" };
    const index = parseEngineIndex({
      format: ENGINE_INDEX_FORMAT,
      engines: [validPackage(), second],
    });
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

  it("validateManifestLicenses", () => {
    const pkg = parseEngineIndex({
      format: ENGINE_INDEX_FORMAT,
      engines: [{ ...validPackage(), licenses: ["MIT", "GPL-3.0-or-later"] }],
    }).engines[0];
    const manifestWith = (spdx: string[]) =>
      ({
        licenses: spdx.map((id) => ({ subject: id, spdx: id, file: `${id}.txt` })),
      }) as unknown as EngineManifest;
    // 順序は問わない。
    expect(() =>
      validateManifestLicenses(manifestWith(["GPL-3.0-or-later", "MIT"]), pkg),
    ).not.toThrow();
    expect(() => validateManifestLicenses(manifestWith(["MIT"]), pkg)).toThrow(/do not match/);
    expect(() =>
      validateManifestLicenses(manifestWith(["MIT", "GPL-3.0-or-later", "Apache-2.0"]), pkg),
    ).toThrow(/do not match/);
    expect(() => validateManifestLicenses(manifestWith([]), pkg)).toThrow(/does not declare/);
    expect(() => validateManifestLicenses({} as EngineManifest, pkg)).toThrow(/does not declare/);
  });
});
