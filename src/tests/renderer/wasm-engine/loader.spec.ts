import {
  EngineFS,
  makeParentDirs,
  validateEngineInstance,
  wrapUMDSource,
} from "@/renderer/wasm-engine/loader.js";

// Emscripten の FS のうち、makeParentDirs が使う部分だけを模したもの。
function fakeFS(): EngineFS & { dirs: string[] } {
  const dirs: string[] = [];
  return {
    dirs,
    mkdir(path: string) {
      // 既存のディレクトリに対する mkdir は EEXIST の例外になる。
      if (dirs.includes(path)) {
        throw new Error("FS error");
      }
      dirs.push(path);
    },
    writeFile() {},
  };
}

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
    // FS は dataFiles を使うエンジンだけが公開する任意のメンバー。
    expect(validateEngineInstance(instance({ FS: {} })).FS).toBeTruthy();
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

  it("makeParentDirs", () => {
    const fs = fakeFS();
    makeParentDirs(fs, "/eval/nn.bin");
    expect(fs.dirs).toEqual(["/eval"]);
    makeParentDirs(fs, "/book/standard/book.db");
    expect(fs.dirs).toEqual(["/eval", "/book", "/book/standard"]);
    // 相対パスは cwd を基準にする。
    makeParentDirs(fs, "data/eval.bin");
    expect(fs.dirs).toEqual(["/eval", "/book", "/book/standard", "./data"]);
  });

  it("makeParentDirs/tolerant", () => {
    const fs = fakeFS();
    // 親ディレクトリが無い場合は何もしない。
    makeParentDirs(fs, "/eval.bin");
    makeParentDirs(fs, "eval.bin");
    expect(fs.dirs).toEqual([]);
    // 既存のディレクトリに対する mkdir の失敗は無視する。
    makeParentDirs(fs, "/eval/nn.bin");
    makeParentDirs(fs, "/eval/nn2.bin");
    expect(fs.dirs).toEqual(["/eval"]);
    // 余分な区切りがあっても階層が増えないこと。
    makeParentDirs(fs, "//eval//sub//nn.bin");
    expect(fs.dirs).toEqual(["/eval", "/eval/sub"]);
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
