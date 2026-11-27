#!/usr/bin/env node

// Apery 形式のハッシュ値に使う乱数表を、TypeScript の定義 (src/background/book/apery_zobrist.ts) から
// Rust のソース (wasm/book/src/apery_zobrist.rs) に変換する。
//
// 使い方:
//   node scripts/generate-apery-zobrist.mjs           生成する
//   node scripts/generate-apery-zobrist.mjs --verify  生成結果が commit 済みのファイルと一致するか検証する

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/background/book/apery_zobrist.ts");
const outputPath = path.join(root, "wasm/book/src/apery_zobrist.rs");
const source = fs.readFileSync(sourcePath, "utf-8");

function table(name) {
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);
  if (!match) {
    throw new Error(`${name} is not found`);
  }
  return match[1].match(/0x[0-9a-f]+n/g).map((v) => v.slice(0, -1));
}

const pieceTable = table("pieceTable");
const handTable = table("handTable");
const turn = /const turn = (0x[0-9a-f]+)n;/.exec(source)[1];

const format = (name, values) =>
  `pub const ${name}: [u64; ${values.length}] = [\n${values.map((v) => `    ${v},`).join("\n")}\n];\n`;

const output =
  "//! Apery 形式のハッシュ値に使う乱数表。\n" +
  "//! scripts/generate-apery-zobrist.mjs で src/background/book/apery_zobrist.ts から生成している。編集しないこと。\n\n" +
  format("PIECE_TABLE", pieceTable) +
  "\n" +
  format("HAND_TABLE", handTable) +
  `\npub const TURN: u64 = ${turn};\n`;

if (process.argv.includes("--verify")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf-8") !== output) {
    process.stderr.write(
      `${path.relative(root, outputPath)} is out of date. Run "node scripts/generate-apery-zobrist.mjs".\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`Verified: ${path.relative(root, outputPath)}\n`);
} else {
  fs.writeFileSync(outputPath, output);
  process.stdout.write(
    `Generated: ${path.relative(root, outputPath)} (piece: ${pieceTable.length}, hand: ${handTable.length})\n`,
  );
}
