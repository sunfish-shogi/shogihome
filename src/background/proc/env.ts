import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function isDevelopment(): boolean {
  return process.env.npm_lifecycle_event === "electron:serve" && !isTest();
}

export function isPreview(): boolean {
  return process.env.npm_lifecycle_event === "electron:preview";
}

export function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

export function isProduction(): boolean {
  return !isDevelopment() && !isPreview() && !isTest();
}

export function isPortable(): boolean {
  return process.env.PORTABLE_EXECUTABLE_DIR !== undefined;
}

export function getPortableExeDir(): string | undefined {
  return process.env.PORTABLE_EXECUTABLE_DIR;
}

let tempPathForTesting: string;

export function getTempPathForTesting(): string {
  if (!tempPathForTesting) {
    tempPathForTesting = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-test-"));
  }
  return tempPathForTesting;
}

export function getPreloadPath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist/packed/preload.js")
    : path.join(import.meta.dirname, "../../../packed/preload.js");
}

// WebAssembly エンジンを動かす utility プロセスのエントリ (usi/wasm/host.ts)。
// 本番では webpack でまとめたものを、それ以外では tsc の出力をそのまま使う。
export function getWasmEngineHostPath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist/packed/wasm-engine-host.js")
    : path.join(import.meta.dirname, "../usi/wasm/host.js");
}

// 定跡の WebAssembly モジュール (src/background/book/wasm/book.wasm)。
// - 本番: webpack でまとめた background.js と同じ dist/packed に置き、asar に含める。
// - 開発 (electron:serve)・プレビュー (electron:preview): tsc の出力 (dist/src) をそのまま実行するため、
//   その中の book/wasm/ に置く。
// - 単体テスト: ソース (src) をそのまま実行するため、ソースの book/wasm/ にあるものを使う。
// 開発・プレビュー用の配置は scripts/copy-book-wasm.mjs が electron:compile の中で行う。
export function getBookWasmPath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist/packed/book.wasm")
    : path.join(import.meta.dirname, "../book/wasm/book.wasm");
}

export function getBundlePath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist")
    : path.join(import.meta.dirname, "../../..");
}
