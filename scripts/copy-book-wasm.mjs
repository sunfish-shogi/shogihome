#!/usr/bin/env node

// 定跡の WebAssembly モジュール (src/background/book/wasm/book.wasm) を Electron 版の出力先にコピーする。
// tsc は .wasm を出力先にコピーしないため、electron:compile と electron:compile:serve の中で実行する。
//
// - dist/src/background/book/wasm/book.wasm: 開発 (electron:serve) とプレビュー (electron:preview) で使う。
//   tsc の出力をそのまま実行するため、JavaScript と同じ場所に置く。
// - dist/packed/book.wasm: 本番 (electron:build) で使う。webpack でまとめた background.js と同じ場所に置き、
//   electron-builder が asar に含める。
//
// 実行時のパスの解決は src/background/proc/env.ts の getBookWasmPath を参照。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = path.resolve(root, "src/background/book/wasm/book.wasm");
const destinations = [
  path.resolve(root, "dist/src/background/book/wasm/book.wasm"),
  path.resolve(root, "dist/packed/book.wasm"),
];

for (const destination of destinations) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  process.stdout.write(`Copied: ${path.relative(root, destination)}\n`);
}
