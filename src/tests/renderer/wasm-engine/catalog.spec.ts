import {
  getUSIEngineOptionCurrentValue,
  mergeUSIEngine,
  USIEngine,
  USIEngines,
} from "@/common/settings/usi.js";
import { t } from "@/common/i18n/index.js";
import * as uri from "@/common/uri.js";
import {
  BUILTIN_ENGINE_DIRS,
  builtinEngineURI,
  buildUSIEngines,
  enginePathOf,
  isBuiltinEnginePath,
  describeEngineLoadError,
  isNetworkError,
  loadBuiltinEngineLicenses,
  loadBuiltinUSIEngines,
  loadMobileGamePlayers,
  resolveEngineDirURL,
  resolveEngineFileURL,
} from "@/renderer/wasm-engine/catalog.js";
import { builtinEngineRoots, listBuiltinEngines } from "@plugins/builtin_engines.js";
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
  licenses: [
    {
      spdx: "MIT",
      file: "LICENSE.txt",
      source: "https://github.com/sunfish-shogi/sunfish4/tree/v0.1.3-lite",
    },
  ],
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
      mobileGame: { label: "Sunfish Lv.2" },
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
      // 既定の名前はプリセットごとに異なる。表示名をリセットしたときに
      // 全てのプリセットが同じ名前にならないようにするため。
      expect(engine.defaultName).toBe(engine.name);
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

  // 一覧はエンジンの置き場所からビルド時に作られる (plugins/builtin_engines.ts)。
  // エンジンを追加するのにソースを編集しなくてよいことを、この経路で担保している。
  it("BUILTIN_ENGINE_DIRS", () => {
    const expected = listBuiltinEngines(builtinEngineRoots()).map((engine) => engine.name);
    expect(expected).toContain("sunfish4-lite");
    expect(BUILTIN_ENGINE_DIRS).toEqual(expected);
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

  // プリセットの値は、そのプリセットにとっての「エンジンの既定値」として入らなければ
  // ならない。オプション画面の「エンジンの既定値に戻す」が戻す先が default であり、
  // value に入れているとリセットで素のエンジンの既定値 (ここでは 64) に戻ってしまう。
  it("buildUSIEngines/presetValuesAreDefaults", () => {
    const engines = buildUSIEngines("sunfish4-lite", manifest);
    const option = engines[0].options["MaxDepth"];
    expect(option?.type === "spin" && option.default).toBe(1);
    // ユーザーが編集したかどうかの区別を保つため、value は空のままにする。
    expect(option?.type === "spin" && option.value).toBeUndefined();
    // プリセットが触れていないオプションはマニフェストの申告どおり。
    const threads = engines[0].options["Threads"];
    expect(threads?.type === "spin" && threads.default).toBe(1);
  });

  // 保存済みの設定を引き継ぐときに、ユーザーが編集していないオプションの
  // プリセット値が消えてはならない (mergeUSIEngine は value だけを引き継ぐ)。
  it("buildUSIEngines/mergeKeepsPresetDefaults", () => {
    const engines = buildUSIEngines("sunfish4-lite", manifest);
    const local: USIEngine = JSON.parse(JSON.stringify(engines[0]));
    local.name = "編集した名前";
    mergeUSIEngine(engines[0], local);
    expect(getUSIEngineOptionCurrentValue(engines[0].options["MaxDepth"])).toBe(1);
    expect(engines[0].name).toBe("編集した名前");
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

  // 組み込むエンジンはビルドプロファイルで増えるため、件数は一覧から決める。
  it("loadBuiltinUSIEngines", async () => {
    const manifestURLs = BUILTIN_ENGINE_DIRS.map(
      (dir) => new URL(`engines/${dir}/engine.json`, document.baseURI).href,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(manifestURLs).toContain(url);
        return { ok: true, json: async () => manifest } as Response;
      }),
    );
    const engines = await loadBuiltinUSIEngines();
    expect(engines).toHaveLength(manifest.presets.length * BUILTIN_ENGINE_DIRS.length);
    // 2 回目はキャッシュから返るため fetch は増えない。
    await loadBuiltinUSIEngines();
    expect(fetch).toHaveBeenCalledTimes(BUILTIN_ENGINE_DIRS.length);
  });

  // モバイルの対局メニューに並べるプリセットはマニフェストが宣言する。
  // 何を出すかを engine.json だけで決められることを、この経路で担保している。
  // (マニフェストは上のテストでキャッシュ済みのため、ここでの fetch は呼ばれない。)
  it("loadMobileGamePlayers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => manifest }) as Response),
    );
    // 宣言の無いプリセット (d1) は並ばない。
    expect(await loadMobileGamePlayers()).toEqual(
      BUILTIN_ENGINE_DIRS.map((dir) => ({
        uri: builtinEngineURI("sunfish4-lite-wasm-v1-d5"),
        dir,
        label: "Sunfish Lv.2",
      })),
    );
  });

  // 配布物に含まれるエンジンのライセンスは、同梱した全文へのリンクとして表示する。
  it("loadBuiltinEngineLicenses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => manifest }) as Response),
    );
    expect(await loadBuiltinEngineLicenses()).toEqual(
      BUILTIN_ENGINE_DIRS.map((dir) => ({
        subject: "Sunfish4 Lite",
        spdx: "MIT",
        url: new URL(`engines/${dir}/LICENSE.txt`, document.baseURI).href,
        source: "https://github.com/sunfish-shogi/sunfish4/tree/v0.1.3-lite",
      })),
    );
  });

  it("resolveEngineFileURL", () => {
    expect(resolveEngineFileURL("sunfish4-lite", "LICENSE.txt")).toBe(
      new URL("engines/sunfish4-lite/LICENSE.txt", document.baseURI).href,
    );
    // ディレクトリ traversal や任意の URL を許可しない。
    expect(() => resolveEngineFileURL("sunfish4-lite", "../../secret")).toThrow();
    expect(() => resolveEngineFileURL("sunfish4-lite", "https://example.com/evil")).toThrow();
    expect(() => resolveEngineFileURL("../secret", "LICENSE.txt")).toThrow();
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
