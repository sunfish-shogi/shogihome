import { getUSIEngineOptionCurrentValue, USIEngines } from "@/common/settings/usi.js";
import { t } from "@/common/i18n/index.js";
import * as uri from "@/common/uri.js";
import {
  builtinEngineURI,
  buildUSIEngines,
  enginePathOf,
  isBuiltinEnginePath,
  describeEngineLoadError,
  isNetworkError,
  loadBuiltinUSIEngines,
  resolveEngineDirURL,
} from "@/renderer/wasm-engine/catalog.js";
import {
  CROSS_ORIGIN_ISOLATION_REQUIRED,
  EngineManifest,
  ENGINE_ABI,
} from "@/renderer/wasm-engine/manifest.js";

const manifest: EngineManifest = {
  abi: ENGINE_ABI,
  module: "sunfish4.js",
  moduleFormat: "esm",
  name: "Sunfish4 Lite",
  author: "Kubo, Ryosuke",
  options: [
    { name: "Threads", type: "spin", default: 1, min: 1, max: 4 },
    { name: "MaxDepth", type: "spin", default: 64, min: 1, max: 64 },
  ],
  presets: [
    {
      id: "sunfish4-lite-wasm-v1-d1",
      displayName: "Sunfish Lv. 1",
      values: { MaxDepth: 1 },
    },
    {
      id: "sunfish4-lite-wasm-v1-d5",
      displayName: "Sunfish Lv. 2",
      values: { MaxDepth: 5 },
    },
  ],
};

describe("wasm-engine/catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildUSIEngines", () => {
    const engines = buildUSIEngines("sunfish4-lite", manifest);
    expect(engines).toHaveLength(2);
    for (const engine of engines) {
      expect(uri.isUSIEngine(engine.uri)).toBeTruthy();
      // validateUSIEngine が path の非空を要求する。
      expect(engine.path).toBe("engines/sunfish4-lite/");
      expect(engine.defaultName).toBe("Sunfish4 Lite");
      expect(engine.author).toBe("Kubo, Ryosuke");
      // エンジンが宣言していない予約オプションは補完される。
      expect(engine.options["USI_Hash"]?.type).toBe("spin");
      expect(engine.options["USI_Ponder"]?.type).toBe("check");
    }
    expect(getUSIEngineOptionCurrentValue(engines[0].options["MaxDepth"])).toBe(1);
    expect(getUSIEngineOptionCurrentValue(engines[1].options["MaxDepth"])).toBe(5);
    expect(engines[0].name).toBe("Sunfish Lv. 1");
    expect(engines[1].name).toBe("Sunfish Lv. 2");
  });

  it("stableURIs", () => {
    // URI を変更すると保存済みの対局設定が壊れるため、値そのものを固定する。
    expect(builtinEngineURI("sunfish4-lite-wasm-v1")).toBe(
      "es://usi-engine/builtin/sunfish4-lite-wasm-v1",
    );
    expect(builtinEngineURI("sunfish4-lite-wasm-v1-d1")).toBe(
      "es://usi-engine/builtin/sunfish4-lite-wasm-v1-d1",
    );
    expect(builtinEngineURI("sunfish4-lite-wasm-v1-d5")).toBe(
      "es://usi-engine/builtin/sunfish4-lite-wasm-v1-d5",
    );
    expect(builtinEngineURI("sunfish4-lite-wasm-v1-d9")).toBe(
      "es://usi-engine/builtin/sunfish4-lite-wasm-v1-d9",
    );
  });

  // プリセットの値がオプションの初期値として入らないと、レベルの違いが出ない。
  it("buildUSIEngines/presetValues", () => {
    const engines = buildUSIEngines("sunfish4-lite", {
      ...manifest,
      presets: [
        { id: "sunfish4-lite-wasm-v1-d1", displayName: "level1", values: { MaxDepth: 1 } },
        { id: "sunfish4-lite-wasm-v1-d9", displayName: "level3", values: { MaxDepth: 9 } },
      ],
    });
    expect(getUSIEngineOptionCurrentValue(engines[0].options["MaxDepth"])).toBe(1);
    expect(getUSIEngineOptionCurrentValue(engines[1].options["MaxDepth"])).toBe(9);
    expect(engines[1].name).toBe("level3");
  });

  it("enginePath", () => {
    expect(enginePathOf("sunfish4-lite")).toBe("engines/sunfish4-lite/");
    expect(isBuiltinEnginePath("engines/sunfish4-lite/")).toBeTruthy();
    // 任意の URL やディレクトリ traversal を許可しない。
    expect(isBuiltinEnginePath("engines/sunfish4-lite")).toBeFalsy();
    expect(isBuiltinEnginePath("engines/../secret/")).toBeFalsy();
    expect(isBuiltinEnginePath("engines/../")).toBeFalsy();
    expect(isBuiltinEnginePath("engines/./")).toBeFalsy();
    expect(isBuiltinEnginePath("https://example.com/evil/")).toBeFalsy();
    expect(isBuiltinEnginePath("/usr/local/bin/engine")).toBeFalsy();
    expect(() => resolveEngineDirURL("https://example.com/evil/")).toThrow();
    expect(resolveEngineDirURL("engines/sunfish4-lite/")).toBe(
      new URL("engines/sunfish4-lite/", document.baseURI).href,
    );
  });

  it("loadBuiltinUSIEngines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe(new URL("engines/sunfish4-lite/engine.json", document.baseURI).href);
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
    for (const engine of buildUSIEngines("sunfish4-lite", manifest)) {
      engines.addEngine(engine);
    }
    const restored = new USIEngines(engines.json);
    expect(restored.engineList).toHaveLength(2);
    expect(
      getUSIEngineOptionCurrentValue(
        restored.getEngine(builtinEngineURI("sunfish4-lite-wasm-v1-d1"))?.options["MaxDepth"],
      ),
    ).toBe(1);
  });

  // エンジンの成果物は事前キャッシュされないため、オフラインでは読み込めない。
  // 内部エラーをそのまま見せず、対処の分かる文言にする。
  describe("describeEngineLoadError", () => {
    const onLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

    const setOnLine = (value: boolean) => {
      Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
    };

    // jsdom は crossOriginIsolated を持たないため、既定の isolated 扱いで揃える。
    const setIsolated = (value: boolean) => {
      Object.defineProperty(globalThis, "crossOriginIsolated", { value, configurable: true });
    };

    beforeEach(() => {
      setIsolated(true);
    });

    afterEach(() => {
      if (onLine) {
        Object.defineProperty(window.navigator, "onLine", onLine);
      } else {
        setOnLine(true);
      }
      setIsolated(true);
    });

    it("オフラインならネットワーク起因として扱うこと", () => {
      setOnLine(false);
      expect(isNetworkError(new Error("failed to load foo: 404"))).toBeTruthy();
      expect(describeEngineLoadError(new Error("failed to load foo: 404"))).toBe(
        `${t.failedToLoadEngine} ${t.engineRequiresOnline}`,
      );
    });

    // fetch はネットワークに到達できない場合に TypeError を投げる。
    it("fetch の TypeError をネットワーク起因として扱うこと", () => {
      setOnLine(true);
      expect(isNetworkError(new TypeError("Failed to fetch"))).toBeTruthy();
      expect(describeEngineLoadError(new TypeError("Failed to fetch"))).toBe(
        `${t.failedToLoadEngine} ${t.engineRequiresOnline}`,
      );
    });

    // Worker が起動前の確認で断った場合だけ、再読み込みを促す文言にする。
    it("isolation が必要と分かっている場合は再読み込みを促すこと", () => {
      setOnLine(true);
      expect(describeEngineLoadError(new Error(CROSS_ORIGIN_ISOLATION_REQUIRED))).toBe(
        `${t.failedToLoadEngine} ${t.engineRequiresReload}`,
      );
    });

    // isolated でないことを根拠に言い換えてはならない。
    // 起動タイムアウトのように、それ自体が対処を示している文言を潰してしまう。
    it("isolated でなくても原因が別なら内容をそのまま添えること", () => {
      setOnLine(true);
      setIsolated(false);
      expect(describeEngineLoadError(new Error("エンジンから応答がありません"))).toBe(
        `${t.failedToLoadEngine} エンジンから応答がありません`,
      );
    });

    it("それ以外は内容を添えること", () => {
      setOnLine(true);
      expect(isNetworkError(new Error("failed to load foo: 404"))).toBeFalsy();
      expect(describeEngineLoadError(new Error("failed to load foo: 404"))).toBe(
        `${t.failedToLoadEngine} failed to load foo: 404`,
      );
    });
  });
});
