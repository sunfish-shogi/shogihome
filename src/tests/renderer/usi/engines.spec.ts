import { getUSIEngineOptionCurrentValue, USIEngines } from "@/common/settings/usi.js";
import * as uri from "@/common/uri.js";
import {
  BUILTIN_BASIC_RANDOM_URI,
  BUILTIN_BASIC_RANGING_ROOK_URI,
  BUILTIN_BASIC_STATIC_ROOK_URI,
  BUILTIN_ENGINES,
  defaultBuiltinUSIEngines,
  findBuiltinEngine,
  resolveModuleURL,
} from "@/renderer/usi/engines.js";

describe("usi/engines", () => {
  it("defaultBuiltinUSIEngines", () => {
    const engines = defaultBuiltinUSIEngines();
    expect(engines.map((engine) => engine.uri)).toEqual([
      BUILTIN_BASIC_STATIC_ROOK_URI,
      BUILTIN_BASIC_RANGING_ROOK_URI,
      BUILTIN_BASIC_RANDOM_URI,
    ]);
    for (const engine of engines) {
      // 保存済みの対局設定と対応付けられるように、URI は固定値でなければならない。
      expect(uri.isUSIEngine(engine.uri)).toBeTruthy();
      // validateUSIEngine が path の非空を要求する。
      expect(engine.path).not.toBe("");
      expect(engine.options["Style"]?.type).toBe("combo");
    }
    expect(getUSIEngineOptionCurrentValue(engines[0].options["Style"])).toBe("static_rook");
    expect(getUSIEngineOptionCurrentValue(engines[1].options["Style"])).toBe("ranging_rook");
    expect(getUSIEngineOptionCurrentValue(engines[2].options["Style"])).toBe("random");
  });

  it("stableURIs", () => {
    // URI を変更すると保存済みの対局設定が壊れるため、値そのものを固定する。
    expect(BUILTIN_BASIC_STATIC_ROOK_URI).toBe("es://usi-engine/builtin/basic-static-rook-v1");
    expect(BUILTIN_BASIC_RANGING_ROOK_URI).toBe("es://usi-engine/builtin/basic-ranging-rook-v1");
    expect(BUILTIN_BASIC_RANDOM_URI).toBe("es://usi-engine/builtin/basic-random");
  });

  it("findBuiltinEngine", () => {
    for (const spec of BUILTIN_ENGINES) {
      expect(findBuiltinEngine(spec.path)).toBe(spec);
    }
    expect(findBuiltinEngine("/usr/local/bin/engine")).toBeUndefined();
  });

  it("resolveModuleURL", () => {
    expect(resolveModuleURL(BUILTIN_ENGINES[0])).toBe(
      new URL("engines/basic/basic.js", document.baseURI).href,
    );
  });

  it("USIEngines/serialization", () => {
    // 一覧に組み込んだ後もシリアライズして復元できること。
    const engines = new USIEngines();
    for (const engine of defaultBuiltinUSIEngines()) {
      engines.addEngine(engine);
    }
    const restored = new USIEngines(engines.json);
    expect(restored.engineList).toHaveLength(BUILTIN_ENGINES.length);
    expect(
      getUSIEngineOptionCurrentValue(
        restored.getEngine(BUILTIN_BASIC_STATIC_ROOK_URI)?.options["Style"],
      ),
    ).toBe("static_rook");
  });
});
