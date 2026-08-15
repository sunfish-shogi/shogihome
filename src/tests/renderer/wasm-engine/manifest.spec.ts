import { ENGINE_ABI, parseEngineManifest } from "@/renderer/wasm-engine/manifest.js";

function validManifest(): Record<string, unknown> {
  return {
    abi: ENGINE_ABI,
    module: "engine.js",
    name: "Test Engine",
    author: "Someone",
    options: [
      { name: "USI_Hash", type: "spin", default: 32, min: 1, max: 1024 },
      { name: "Style", type: "combo", default: "a", vars: ["a", "b"] },
    ],
    dataFiles: [{ url: "eval/nn.bin", path: "/eval/nn.bin" }],
    presets: [{ id: "test-v1", displayName: "Test", values: { Style: "b" } }],
  };
}

describe("wasm-engine/manifest", () => {
  it("valid", () => {
    const manifest = parseEngineManifest(validManifest());
    expect(manifest.module).toBe("engine.js");
    expect(manifest.options).toHaveLength(2);
    expect(manifest.dataFiles).toEqual([{ url: "eval/nn.bin", path: "/eval/nn.bin" }]);
    expect(manifest.presets[0].values).toEqual({ Style: "b" });
  });

  it("optionalFields", () => {
    const src = validManifest();
    delete src.options;
    delete src.dataFiles;
    const manifest = parseEngineManifest(src);
    expect(manifest.options).toBeUndefined();
    expect(manifest.dataFiles).toBeUndefined();
    // moduleFormat を省略した場合は esm とみなす。
    expect(manifest.moduleFormat).toBe("esm");
    expect(manifest.exportName).toBeUndefined();
  });

  it("umdModuleFormat", () => {
    const manifest = parseEngineManifest({
      ...validManifest(),
      moduleFormat: "umd",
      exportName: "YaneuraOu_HalfKP",
    });
    expect(manifest.moduleFormat).toBe("umd");
    expect(manifest.exportName).toBe("YaneuraOu_HalfKP");
  });

  it("rejectsUnknownModuleFormat", () => {
    expect(() => parseEngineManifest({ ...validManifest(), moduleFormat: "cjs" })).toThrow(
      /moduleFormat is unknown/,
    );
  });

  it("rejectsUMDWithoutValidExportName", () => {
    // exportName はソースへ埋め込むため、識別子でなければ受け付けない。
    expect(() => parseEngineManifest({ ...validManifest(), moduleFormat: "umd" })).toThrow(
      /exportName/,
    );
    expect(() =>
      parseEngineManifest({
        ...validManifest(),
        moduleFormat: "umd",
        exportName: "x; fetch('https://example.com')",
      }),
    ).toThrow(/exportName must be an identifier/);
  });

  it("rejectsUnsupportedABI", () => {
    expect(() =>
      parseEngineManifest({ ...validManifest(), abi: "shogihome-wasm-engine/999" }),
    ).toThrow(/unsupported abi/);
  });

  it("rejectsMissingFields", () => {
    for (const key of ["module", "name", "author", "presets"]) {
      const src = validManifest();
      delete src[key];
      expect(() => parseEngineManifest(src), key).toThrow();
    }
  });

  it("rejectsPathTraversal", () => {
    expect(() => parseEngineManifest({ ...validManifest(), module: "../../evil.js" })).toThrow();
    expect(() =>
      parseEngineManifest({
        ...validManifest(),
        dataFiles: [{ url: "../../secret", path: "/x" }],
      }),
    ).toThrow();
    expect(() =>
      parseEngineManifest({
        ...validManifest(),
        module: "https://example.com/evil.js",
      }),
    ).toThrow();
  });

  it("rejectsUnknownOptionType", () => {
    expect(() =>
      parseEngineManifest({
        ...validManifest(),
        options: [{ name: "X", type: "unknown" }],
      }),
    ).toThrow(/type is unknown/);
  });

  it("rejectsDuplicatedPresetID", () => {
    expect(() =>
      parseEngineManifest({
        ...validManifest(),
        presets: [
          { id: "a", displayName: "A" },
          { id: "a", displayName: "B" },
        ],
      }),
    ).toThrow(/duplicated preset id/);
  });
});
