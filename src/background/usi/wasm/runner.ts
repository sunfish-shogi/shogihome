// ダウンロード済みの WebAssembly エンジンを Node 上で起動する。
//
// Web 版の Worker (src/renderer/wasm-engine/engine.worker.ts) と同じ手順を、fetch の代わりに
// ローカルのファイルで行う。utility プロセスのエントリ (host.ts) から使うほか、
// Electron に依存しないため単体テストからも直接呼べる。
//
// インストール先では全てのファイルが engine.json からの相対位置に置かれている
// (specs/wasm-engine-desktop.md)。assetBaseURL はダウンロード時にだけ意味を持ち、
// ここでは参照しない。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { EngineManifest, parseEngineManifest } from "@/common/wasm-engine/manifest.js";
import {
  EngineFactory,
  EngineInstance,
  makeParentDirs,
  validateEngineInstance,
} from "@/common/wasm-engine/loader.js";

export type WasmEngineRunnerHandlers = {
  // エンジンの標準出力 (USI の 1 行)。
  onReceive(line: string): void;
  // USI のやり取りに含まれない診断情報。
  onLog(message: string): void;
};

export function readEngineManifest(manifestPath: string): EngineManifest {
  return parseEngineManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
}

// UMD の成果物を CommonJS として評価する。
//
// Worker では末尾に export 文を足して Blob URL から import() するが、Node で同じことを
// すると ES モジュールとして評価され、Emscripten の Node 向けの経路が壊れる
// (require や __dirname が無いため ReferenceError になる)。
function evaluateUMD(modulePath: string, exportName: string): EngineFactory {
  const source = fs.readFileSync(modulePath, "utf8");
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {${source}\nreturn ${exportName};\n})`,
    { filename: modulePath },
  ) as (
    exports: unknown,
    require: unknown,
    module: unknown,
    filename: string,
    dirname: string,
  ) => EngineFactory;
  const module = { exports: {} };
  return wrapper(
    module.exports,
    createRequire(modulePath),
    module,
    modulePath,
    path.dirname(modulePath),
  );
}

async function importFactory(manifest: EngineManifest, modulePath: string): Promise<EngineFactory> {
  if (manifest.moduleFormat === "umd") {
    return evaluateUMD(modulePath, manifest.exportName as string);
  }
  // バンドラーに解決させない。読み込むのは実行時に決まるダウンロード済みのファイルである。
  const url = pathToFileURL(modulePath).href;
  return (await import(/* webpackIgnore: true */ url)).default as EngineFactory;
}

// エンジンを起動する。評価パラメータの読み込みまで済ませてから返す。
export async function launchWasmEngine(
  manifestPath: string,
  handlers: WasmEngineRunnerHandlers,
): Promise<EngineInstance> {
  const engineDir = path.dirname(manifestPath);
  const manifest = readEngineManifest(manifestPath);
  // module と dataFiles[].url はマニフェストの検証で安全な相対パスであることが保証されている。
  const modulePath = path.join(engineDir, manifest.module);
  const factory = await importFactory(manifest, modulePath);
  const instance = validateEngineInstance(
    await factory({
      printErr: (line: string) => handlers.onLog(`stderr: ${line}`),
      // Emscripten が渡すのはファイル名だけで、.wasm や .data はグルーコードの隣にある。
      // Node の Worker は file:// の文字列を受け付けないため、URL ではなくパスを返す。
      locateFile: (file: string) => path.join(path.dirname(modulePath), file),
      mainScriptUrlOrBlob: modulePath,
    }),
  );
  instance.addMessageListener((line) => handlers.onReceive(line));

  const dataFiles = manifest.dataFiles || [];
  if (dataFiles.length !== 0 && !instance.FS) {
    instance.terminate();
    throw new Error(
      "engine does not expose FS: add FS to -sEXPORTED_RUNTIME_METHODS to use dataFiles",
    );
  }
  for (const file of dataFiles) {
    const data = await fs.promises.readFile(path.join(engineDir, file.url));
    makeParentDirs(instance.FS!, file.path);
    instance.FS!.writeFile(file.path, new Uint8Array(data));
    handlers.onLog(`loaded data file: ${file.path} (${data.byteLength} bytes)`);
  }
  return instance;
}
