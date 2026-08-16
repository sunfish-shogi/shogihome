import { getUSIEngineOptionCurrentValue, USIEngines } from "@/common/settings/usi.js";
import { t } from "@/common/i18n/index.js";
import * as uri from "@/common/uri.js";
import {
  builtinEngineURI,
  buildUSIEngines,
  enginePathOf,
  isBuiltinEnginePath,
  loadBuiltinUSIEngines,
  resolveEngineDirURL,
} from "@/renderer/wasm-engine/catalog.js";
import { EngineManifest, ENGINE_ABI } from "@/renderer/wasm-engine/manifest.js";

const manifest: EngineManifest = {
  abi: ENGINE_ABI,
  module: "basic.js",
  moduleFormat: "esm",
  name: "ShogiHome Basic Engine",
  author: "Kubo, Ryosuke",
  options: [
    {
      name: "Style",
      type: "combo",
      default: "static_rook",
      vars: ["static_rook", "ranging_rook", "random"],
    },
    { name: "MinimumThinkingTime", type: "spin", default: 500, min: 0, max: 60000 },
  ],
  presets: [
    {
      id: "basic-level2-static-rook-v1",
      displayName: "ShogiHome Level 2 (Static Rook)",
      values: { Style: "static_rook" },
    },
    {
      id: "basic-level2-ranging-rook-v1",
      displayName: "ShogiHome Level 2 (Ranging Rook)",
      values: { Style: "ranging_rook" },
    },
  ],
};

describe("wasm-engine/catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildUSIEngines", () => {
    const engines = buildUSIEngines("basic", manifest);
    expect(engines).toHaveLength(2);
    for (const engine of engines) {
      expect(uri.isUSIEngine(engine.uri)).toBeTruthy();
      // validateUSIEngine が path の非空を要求する。
      expect(engine.path).toBe("engines/basic/");
      expect(engine.defaultName).toBe("ShogiHome Basic Engine");
      expect(engine.author).toBe("Kubo, Ryosuke");
      // エンジンが宣言していない予約オプションは補完される。
      expect(engine.options["USI_Hash"]?.type).toBe("spin");
      expect(engine.options["USI_Ponder"]?.type).toBe("check");
    }
    expect(getUSIEngineOptionCurrentValue(engines[0].options["Style"])).toBe("static_rook");
    expect(getUSIEngineOptionCurrentValue(engines[1].options["Style"])).toBe("ranging_rook");
    // TypeScript 実装の簡易エンジンと区別できる名前になっていること。
    expect(engines[0].name).toBe(`ShogiHome Lv. 2 (${t.staticRook})`);
    expect(engines[1].name).toBe(`ShogiHome Lv. 2 (${t.rangingRook})`);
    expect(engines[0].name).not.toBe(uri.basicEngineName(uri.ES_BASIC_ENGINE_STATIC_ROOK_V1));
  });

  it("stableURIs", () => {
    // URI を変更すると保存済みの対局設定が壊れるため、値そのものを固定する。
    expect(builtinEngineURI("basic-level2-static-rook-v1")).toBe(
      "es://usi-engine/builtin/basic-level2-static-rook-v1",
    );
    expect(builtinEngineURI("basic-level2-ranging-rook-v1")).toBe(
      "es://usi-engine/builtin/basic-level2-ranging-rook-v1",
    );
    expect(builtinEngineURI("basic-level3-static-rook-v1")).toBe(
      "es://usi-engine/builtin/basic-level3-static-rook-v1",
    );
    expect(builtinEngineURI("basic-level3-ranging-rook-v1")).toBe(
      "es://usi-engine/builtin/basic-level3-ranging-rook-v1",
    );
  });

  // 深さ違いは同じ wasm から別のプリセットとして見せている。
  // プリセットの値がオプションの初期値として入らないと、レベルの違いが出ない。
  it("buildUSIEngines/presetValues", () => {
    const engines = buildUSIEngines("basic", {
      ...manifest,
      options: [
        ...(manifest.options || []),
        { name: "Depth", type: "spin", default: 3, min: 1, max: 5 },
      ],
      presets: [
        { id: "basic-level2-static-rook-v1", displayName: "level2", values: { Depth: 3 } },
        { id: "basic-level3-static-rook-v1", displayName: "level3", values: { Depth: 5 } },
      ],
    });
    expect(getUSIEngineOptionCurrentValue(engines[0].options["Depth"])).toBe(3);
    expect(getUSIEngineOptionCurrentValue(engines[1].options["Depth"])).toBe(5);
    expect(engines[1].name).toBe(`ShogiHome Lv. 3 (${t.staticRook})`);
  });

  it("enginePath", () => {
    expect(enginePathOf("basic")).toBe("engines/basic/");
    expect(isBuiltinEnginePath("engines/basic/")).toBeTruthy();
    // 任意の URL やディレクトリ traversal を許可しない。
    expect(isBuiltinEnginePath("engines/basic")).toBeFalsy();
    expect(isBuiltinEnginePath("engines/../secret/")).toBeFalsy();
    expect(isBuiltinEnginePath("engines/../")).toBeFalsy();
    expect(isBuiltinEnginePath("engines/./")).toBeFalsy();
    expect(isBuiltinEnginePath("https://example.com/evil/")).toBeFalsy();
    expect(isBuiltinEnginePath("/usr/local/bin/engine")).toBeFalsy();
    expect(() => resolveEngineDirURL("https://example.com/evil/")).toThrow();
    expect(resolveEngineDirURL("engines/basic/")).toBe(
      new URL("engines/basic/", document.baseURI).href,
    );
  });

  it("loadBuiltinUSIEngines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe(new URL("engines/basic/engine.json", document.baseURI).href);
        return { ok: true, json: async () => manifest } as Response;
      }),
    );
    const engines = await loadBuiltinUSIEngines();
    expect(engines).toHaveLength(2);
    // 2 回目はキャッシュから返るため fetch は増えない。
    await loadBuiltinUSIEngines();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("USIEngines/serialization", () => {
    // 一覧に組み込んだ後もシリアライズして復元できること。
    const engines = new USIEngines();
    for (const engine of buildUSIEngines("basic", manifest)) {
      engines.addEngine(engine);
    }
    const restored = new USIEngines(engines.json);
    expect(restored.engineList).toHaveLength(2);
    expect(
      getUSIEngineOptionCurrentValue(
        restored.getEngine(builtinEngineURI("basic-level2-static-rook-v1"))?.options["Style"],
      ),
    ).toBe("static_rook");
  });
});
