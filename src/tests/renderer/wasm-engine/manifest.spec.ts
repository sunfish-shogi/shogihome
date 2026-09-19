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

  // ライセンスは表示に使うため、全文のファイルを同梱した形でしか受け付けない。
  it("licenses", () => {
    const manifest = parseEngineManifest({
      ...validManifest(),
      licenses: [
        { spdx: "MIT", file: "LICENSE.txt", source: "https://example.com/engine" },
        { subject: "評価関数パラメータ", spdx: "CC0-1.0", file: "eval/LICENSE.txt" },
      ],
    });
    expect(manifest.licenses).toEqual([
      { spdx: "MIT", file: "LICENSE.txt", source: "https://example.com/engine" },
      { subject: "評価関数パラメータ", spdx: "CC0-1.0", file: "eval/LICENSE.txt" },
    ]);
    // 省略は許す (適合性テストが public/engines/ 配下のエンジンに対して要求する)。
    expect(parseEngineManifest(validManifest()).licenses).toBeUndefined();
  });

  it("rejectsInvalidLicenses", () => {
    // 宣言するなら中身が要る。
    expect(() => parseEngineManifest({ ...validManifest(), licenses: [] })).toThrow(
      /must be a non-empty array/,
    );
    // 全文の同梱が前提なので file は省略できない。
    expect(() => parseEngineManifest({ ...validManifest(), licenses: [{ spdx: "MIT" }] })).toThrow(
      /licenses\[0\].file/,
    );
    expect(() =>
      parseEngineManifest({ ...validManifest(), licenses: [{ file: "LICENSE.txt" }] }),
    ).toThrow(/licenses\[0\].spdx/);
    // ディレクトリ traversal や任意の URL を許可しない。
    expect(() =>
      parseEngineManifest({
        ...validManifest(),
        licenses: [{ spdx: "MIT", file: "../../secret" }],
      }),
    ).toThrow();
    // source はそのままブラウザへ渡すため、URL として成立していることまで確かめる。
    const withSource = (source: string) => ({
      ...validManifest(),
      licenses: [{ spdx: "MIT", file: "LICENSE.txt", source }],
    });
    expect(() => parseEngineManifest(withSource("javascript:alert(1)"))).toThrow(
      /must be an https URL/,
    );
    expect(() => parseEngineManifest(withSource("http://example.com/engine"))).toThrow(
      /must be an https URL/,
    );
    // スキームだけの文字列や URL として壊れているものを通さない。
    expect(() => parseEngineManifest(withSource("https://"))).toThrow(/must be a valid URL/);
    expect(() => parseEngineManifest(withSource("example.com/engine"))).toThrow(
      /must be a valid URL/,
    );
    // ホストがあれば通す。
    expect(parseEngineManifest(withSource("https://example.com/engine")).licenses?.[0].source).toBe(
      "https://example.com/engine",
    );
  });

  // wasm と評価パラメータを外部のオリジンから配信する場合の取得先。
  it("assetBaseURL", () => {
    const withBase = (assetBaseURL: string) => ({ ...validManifest(), assetBaseURL });
    expect(parseEngineManifest(validManifest()).assetBaseURL).toBeUndefined();
    expect(parseEngineManifest(withBase("https://assets.example.com/v1/")).assetBaseURL).toBe(
      "https://assets.example.com/v1/",
    );
    // ホストを持つ https の URL であること (licenses[].source と同じ規則)。
    expect(() => parseEngineManifest(withBase("http://assets.example.com/v1/"))).toThrow(
      /must be an https URL/,
    );
    expect(() => parseEngineManifest(withBase("https://"))).toThrow(/must be a valid URL/);
    // 末尾が "/" でないと最後の要素が捨てられ、別の場所を指してしまう。
    expect(() => parseEngineManifest(withBase("https://assets.example.com/v1"))).toThrow(
      /must end with/,
    );
    // クエリとフラグメントは解決の際に捨てられるので受け付けない。
    expect(() => parseEngineManifest(withBase("https://assets.example.com/v1/?v=2"))).toThrow(
      /must not have a query or fragment/,
    );
    expect(() => parseEngineManifest(withBase("https://assets.example.com/v1/#a"))).toThrow(
      /must not have a query or fragment/,
    );
  });

  // スレッドを使うエンジンは isolation を宣言する。
  // 宣言が無ければ既定は false で、単一スレッドのエンジンは影響を受けない。
  it("requiresCrossOriginIsolation", () => {
    expect(parseEngineManifest(validManifest()).requiresCrossOriginIsolation).toBeUndefined();
    expect(
      parseEngineManifest({ ...validManifest(), requiresCrossOriginIsolation: true })
        .requiresCrossOriginIsolation,
    ).toBe(true);
    expect(
      parseEngineManifest({ ...validManifest(), requiresCrossOriginIsolation: false })
        .requiresCrossOriginIsolation,
    ).toBe(false);
    expect(() =>
      parseEngineManifest({ ...validManifest(), requiresCrossOriginIsolation: "yes" }),
    ).toThrow(/must be a boolean/);
  });
});
