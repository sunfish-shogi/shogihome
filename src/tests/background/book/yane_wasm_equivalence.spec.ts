// [移行期間のみ] WebAssembly 版のやねうら王形式 On-the-fly が JavaScript 版と同じ結果になることを確かめる。
// JavaScript 版を削除する際にはこのファイルも削除する。

import fs from "node:fs";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import {
  mergeYaneuraOuBook,
  searchYaneuraOuBookMovesOnTheFly,
  validateBookPositionOrdering,
} from "@/background/book/yaneuraou.js";
import { YaneWasmBook } from "@/background/book/wasm/yaneuraou.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { clearBook, openBook, saveBook } from "@/background/book/index.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/yane-wasm-equivalence");

function random(seed: number) {
  let x = seed;
  const rnd = (m: number) => {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    return x % m;
  };
  const pick = <T>(items: T[]): T => items[rnd(items.length)];
  return { rnd, pick };
}

// 乱数でやねうら王形式のファイルを作る。局面は整列するが、改行・BOM・ヘッダー・重複・不正な行などを混ぜる。
function generateBook(seed: number): { content: Buffer; keys: string[] } {
  const { rnd, pick } = random(seed);
  const newline = pick(["\n", "\r\n", "\r"]);
  const boards = new Set<string>();
  const n = 1 + rnd(150);
  while (boards.size < n) {
    let board = "";
    for (let i = 0; i < 3 + rnd(20); i++) {
      board += pick(["l", "n", "s", "g", "k", "P", "+P", "1", "9", "/", "r", "B"]);
    }
    boards.add(board);
  }
  const keys: string[] = [];
  const lines: string[] = [];
  if (rnd(4) !== 0) {
    lines.push("#YANEURAOU-DB2016 1.00");
  }
  for (const board of Array.from(boards).sort()) {
    const turn = pick(["b", "w"]);
    const hand = pick(["-", "P", "2P", "Rb"]);
    keys.push(`${board} ${turn} ${hand} 1`);
    // 同じ局面が続く (重複) 場合を混ぜる。
    // 開く時の検査は行が同じ場合も整列されていないとみなすので、手数の部分を昇順に変える。
    const plies = ["", "-3", "0", "1", "35", "x"];
    const firstPly = rnd(plies.length);
    const count = rnd(10) === 0 ? Math.min(2, plies.length - firstPly) : 1;
    for (let dup = 0; dup < count; dup++) {
      const ply = plies[firstPly + dup];
      lines.push(`sfen ${board} ${turn} ${hand}${ply ? " " + ply : ""}`);
      if (rnd(3) === 0) {
        lines.push(
          pick(["#position comment", "//slash comment", "#", "plain line", "", "#日本語"]),
        );
      }
      const moves = rnd(8) === 0 ? 300 + rnd(300) : rnd(5);
      for (let i = 0; i < moves; i++) {
        const usi = pick(["7g7f", "2b8h+", "P*5e", "1a1b", "9i9h+"]);
        const usi2 = pick(["none", "3c3d", "", "P*2d"]);
        const score = pick(["none", "", "12", "-30", "abc", "+5", "1e3"]);
        const depth = pick(["none", "", "20", "0"]);
        const count = pick(["", "1", "999", "x"]);
        let line = `${usi} ${usi2} ${score} ${depth} ${count}`;
        if (rnd(5) === 0) {
          line = `${usi} ${usi2}`; // 列が足りない
        }
        if (rnd(4) === 0) {
          line += pick([" #c", " //c", " text", " #コメント", "  ", " a b c"]);
        }
        lines.push(line);
        if (rnd(4) === 0) {
          lines.push(pick(["#move comment", "", "free text", "#"]));
        }
        if (rnd(30) === 0) {
          lines.push("7g7fx not a move");
        }
      }
    }
  }
  let text = lines.join(newline) + (rnd(3) === 0 ? "" : newline);
  if (rnd(4) === 0) {
    text = "﻿" + text;
  }
  return { content: Buffer.from(text, "utf-8"), keys };
}

// 乱数で編集内容 (in-memory のエントリー) を作る
function generatePatches(seed: number, keys: string[]): Map<string, BookEntry> {
  const { rnd, pick } = random(seed * 7 + 1);
  const entries = new Map<string, BookEntry>();
  for (let i = 0; i < 1 + rnd(20); i++) {
    const key = rnd(2) === 0 && keys.length > 0 ? pick(keys) : `new${rnd(1000)}/9 b - 1`;
    const number = () => pick([undefined, 0, 5, -7, 2.5, -2.5, -0.4, NaN, 1e21, 123456789]);
    entries.set(key, {
      type: pick(["normal", "patch"]),
      comment: pick([undefined, "", "patched", "a\nb"]),
      moves: Array.from({ length: rnd(4) }, () => ({
        usi: pick(["7g7f", "2g2f", "1g1f"]),
        usi2: pick([undefined, "", "8c8d"]),
        score: number(),
        depth: number(),
        count: number(),
        comment: pick([undefined, "", "m", "x\ny"]),
      })),
    });
  }
  return entries;
}

function collect(output: Writable & PassThrough): () => Buffer {
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  return () => Buffer.concat(chunks);
}

describe("[transition] background/book YaneuraOu on-the-fly: WebAssembly equals JavaScript", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  for (let seed = 1; seed <= 40; seed++) {
    it(`seed=${seed}`, async () => {
      const { content, keys } = generateBook(seed);
      const filePath = path.join(tmpdir, `book${seed}.db`);
      fs.writeFileSync(filePath, content);

      const file = await fs.promises.open(filePath, "r");
      try {
        // 開く時の検査
        const ordered = await validateBookPositionOrdering(
          file.createReadStream({ autoClose: false, start: 0 }),
        );
        if (!ordered) {
          expect(() => YaneWasmBook.open(filePath)).toThrow("Book is not ordered by position");
          return;
        }
        const wasm = YaneWasmBook.open(filePath);
        try {
          // 検索
          for (const key of [...keys, "0/9 b - 1", "zzz w - 1", ""]) {
            const expected = await searchYaneuraOuBookMovesOnTheFly(key, file, content.length);
            expect(wasm.search(key), key).toEqual(expected);
          }

          // 書き出し
          const patches = generatePatches(seed, keys);
          const jsOutput = new PassThrough();
          const jsResult = collect(jsOutput);
          let jsError: unknown;
          await mergeYaneuraOuBook(
            file.createReadStream({ encoding: "utf-8", autoClose: false, start: 0 }),
            { format: "yane2016", entries: structuredClone(patches) },
            jsOutput,
          ).catch((e) => {
            jsError = e;
          });
          const wasmOutput = new PassThrough();
          const wasmResult = collect(wasmOutput);
          let wasmError: unknown;
          await wasm.store(structuredClone(patches), wasmOutput).catch((e) => {
            wasmError = e;
          });
          // ヘッダーが不正な場合はどちらもエラーになる
          expect(!!wasmError, String(wasmError)).toBe(!!jsError);
          if (!jsError) {
            expect(wasmResult().toString("utf-8")).toBe(jsResult().toString("utf-8"));
          }
        } finally {
          wasm.close();
        }
      } finally {
        await file.close();
      }
    });
  }

  // yane_wasm_golden.spec.ts の期待値ファイルと同じ操作で、両方の実装の出力が一致する
  for (const input of [
    "src/tests/testdata/book/yaneuraou.db",
    "src/tests/testdata/book/yaneuraou-crlf.db",
    "src/tests/testdata/book/yaneuraou-bom-no-header.db",
  ]) {
    it(`edit and save: ${input}`, async () => {
      const outputs: Record<string, string> = {};
      for (const backend of ["wasm", "js"] as BookBackend[]) {
        const dir = path.join(tmpdir, `edit-${backend}`);
        fs.mkdirSync(dir, { recursive: true });
        await openBook(defaultBookSession, input, { forceOnTheFly: true, backend });
        try {
          await editBook(defaultBookSession, dir);
          const outPath = path.join(dir, "edited.db");
          await saveBook(defaultBookSession, outPath);
          outputs[backend] = fs.readFileSync(outPath, "utf-8");
        } finally {
          clearBook(defaultBookSession);
        }
      }
      expect(outputs.wasm).toBe(outputs.js);
    });
  }
});
