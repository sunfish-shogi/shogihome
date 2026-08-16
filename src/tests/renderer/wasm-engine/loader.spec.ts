import { validateEngineInstance, wrapUMDSource } from "@/renderer/wasm-engine/loader.js";

function instance(overrides: Record<string, unknown> = {}) {
  return {
    postMessage: () => {},
    addMessageListener: () => {},
    removeMessageListener: () => {},
    terminate: () => {},
    ...overrides,
  };
}

describe("wasm-engine/loader", () => {
  it("validateEngineInstance", () => {
    expect(validateEngineInstance(instance())).toBeTruthy();
    // poll は単一スレッドのエンジンだけが公開する任意のメソッド。
    expect(validateEngineInstance(instance({ poll: () => {} })).poll).toBeTruthy();
  });

  it("validateEngineInstance/rejectsIncomplete", () => {
    expect(() => validateEngineInstance(null)).toThrow(/did not return an object/);
    for (const method of [
      "postMessage",
      "addMessageListener",
      "removeMessageListener",
      "terminate",
    ]) {
      const value = instance();
      delete (value as Record<string, unknown>)[method];
      expect(() => validateEngineInstance(value), method).toThrow(
        new RegExp(`does not expose ${method}`),
      );
    }
  });

  it("wrapUMDSource/rejectsInvalidExportName", () => {
    for (const name of ["", "1abc", "a-b", "a b", "x;evil()", "a.b"]) {
      expect(() => wrapUMDSource("var x = 1;", name), name).toThrow(/invalid exportName/);
    }
  });

  // Emscripten の -sEXPORT_ES6 無しの出力と同じ形のソースを、動的 import() で読めること。
  it("wrapUMDSource/importable", async () => {
    const source = [
      "var TestEngine = (() => { return () => Promise.resolve({ ok: true }); })();",
      'if (typeof exports === "object" && typeof module === "object") { module.exports = TestEngine; }',
      'else if (typeof define === "function" && define["amd"]) { define([], () => TestEngine); }',
    ].join("\n");
    const wrapped = wrapUMDSource(source, "TestEngine");
    const url = `data:text/javascript;base64,${Buffer.from(wrapped, "utf8").toString("base64")}`;
    const factory = (await import(/* @vite-ignore */ url)).default;
    expect(await factory()).toEqual({ ok: true });
  });
});
