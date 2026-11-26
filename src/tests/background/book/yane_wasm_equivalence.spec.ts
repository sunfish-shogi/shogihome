// [移行期間のみ] WebAssembly 版のやねうら王形式 On-the-fly が JavaScript 版と同じ結果になることを確かめる。
// JavaScript 版を削除する際にはこのファイルも削除する。

import fs from "node:fs";
import { Move, Position } from "tsshogi";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { BookEntry, mergeBookEntries } from "@/background/book/types.js";
import {
  loadYaneuraOuBook,
  mergeYaneuraOuBook,
  searchYaneuraOuBookMovesOnTheFly,
  storeYaneuraOuBook,
  validateBookPositionOrdering,
} from "@/background/book/yaneuraou.js";
import { loadSbkBook } from "@/background/book/sbk.js";
import { YaneWasmBook } from "@/background/book/wasm/yaneuraou.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { clearBook, exportBook, openBook, saveBook } from "@/background/book/index.js";
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
function generateBook(seed: number, shuffle = false): { content: Buffer; keys: string[] } {
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
  const blocks: string[][] = [];
  for (const board of Array.from(boards).sort()) {
    let block: string[] = [];
    blocks.push(block);
    const turn = pick(["b", "w"]);
    const hand = pick(["-", "P", "2P", "Rb"]);
    keys.push(`${board} ${turn} ${hand} 1`);
    // 同じ局面が続く (重複) 場合を混ぜる。
    // 開く時の検査は行が同じ場合も整列されていないとみなすので、手数の部分を昇順に変える。
    // 整列しない場合は、同じ手数の重複や離れた位置の重複も混ぜる。
    const plies = ["", "-3", "0", "1", "35", "x"];
    const firstPly = rnd(plies.length);
    const count = shuffle
      ? rnd(5) === 0
        ? 2 + rnd(2)
        : 1
      : rnd(10) === 0
        ? Math.min(2, plies.length - firstPly)
        : 1;
    for (let dup = 0; dup < count; dup++) {
      const ply = shuffle ? pick(["", "1", "1", "5", "x"]) : plies[firstPly + dup];
      if (shuffle && dup > 0) {
        block = [];
        blocks.push(block);
      }
      block.push(`sfen ${board} ${turn} ${hand}${ply ? " " + ply : ""}`);
      if (rnd(3) === 0) {
        block.push(
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
        block.push(line);
        if (rnd(4) === 0) {
          block.push(pick(["#move comment", "", "free text", "#"]));
        }
        if (rnd(30) === 0) {
          block.push("7g7fx not a move");
        }
      }
    }
  }
  // 局面の順序を入れ替える (in-memory モードでは整列されていないファイルも開ける)
  if (shuffle) {
    for (let i = blocks.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }
  }
  lines.push(...blocks.flat());
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

describe("[transition] background/book YaneuraOu: WebAssembly equals JavaScript", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  for (let seed = 1; seed <= 40; seed++) {
    it(`on-the-fly: seed=${seed}`, async () => {
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

  for (let seed = 1; seed <= 40; seed++) {
    it(`in-memory: seed=${seed}`, async () => {
      const { content, keys } = generateBook(seed, seed % 2 === 0);
      const filePath = path.join(tmpdir, `in-memory${seed}.db`);
      fs.writeFileSync(filePath, content);

      let js: Map<string, BookEntry>;
      try {
        js = (await loadYaneuraOuBook(fs.createReadStream(filePath, "utf-8"))).entries;
      } catch (e) {
        // ヘッダーが不正な場合はどちらも開けない
        await expect(YaneWasmBook.load(filePath)).rejects.toThrow(String((e as Error).message));
        return;
      }
      const wasm = await YaneWasmBook.load(filePath);
      // 検索
      expect(wasm.entryCount).toBe(js.size);
      for (const key of [...keys, "0/9 b - 1", "zzz w - 1", ""]) {
        expect(wasm.search(key), key).toEqual(js.get(key));
      }
      // 書き出し
      const patches = generatePatches(seed, keys);
      for (const [key, patch] of structuredClone(patches)) {
        const merged = mergeBookEntries(js.get(key), patch);
        if (merged) {
          js.set(key, merged);
        }
      }
      const jsOutput = new PassThrough();
      const jsResult = collect(jsOutput);
      await storeYaneuraOuBook({ format: "yane2016", entries: js }, jsOutput);
      const wasmOutput = new PassThrough();
      const wasmResult = collect(wasmOutput);
      await wasm.store(structuredClone(patches), wasmOutput);
      expect(wasmResult().toString("utf-8")).toBe(jsResult().toString("utf-8"));
    });
  }

  // 公開 API を通して両方の実装で同じ操作をした結果を返す
  async function runBoth(
    open: (backend: BookBackend) => Promise<unknown>,
    run: (dir: string) => Promise<string>,
  ): Promise<Record<BookBackend, string>> {
    const outputs = {} as Record<BookBackend, string>;
    for (const backend of ["wasm", "js"] as BookBackend[]) {
      const dir = path.join(tmpdir, `run-${backend}`);
      fs.mkdirSync(dir, { recursive: true });
      await open(backend);
      try {
        await editBook(defaultBookSession, dir);
        outputs[backend] = await run(dir);
      } finally {
        clearBook(defaultBookSession);
      }
    }
    return outputs;
  }

  // in-memory モードで編集して保存した結果 (棋譜の取り込みを含む) が一致する
  for (const input of [
    "src/tests/testdata/book/yaneuraou.db",
    "src/tests/testdata/book/yaneuraou-crlf.db",
  ]) {
    it(`in-memory: edit and save: ${input}`, async () => {
      const outputs = await runBoth(
        (backend) => openBook(defaultBookSession, input, { backend }),
        async (dir) => {
          const outPath = path.join(dir, "edited-in-memory.db");
          await saveBook(defaultBookSession, outPath);
          return fs.readFileSync(outPath, "utf-8");
        },
      );
      expect(outputs.wasm).toBe(outputs.js);
    });
  }

  // SBK 形式からやねうら王形式への変換結果が一致する
  for (const input of [
    "src/tests/testdata/book/shogigui01.sbk",
    "src/tests/testdata/book/shogigui02.sbk",
    "src/tests/testdata/book/sbk-merge.sbk",
    "src/tests/testdata/book/two-roots.sbk",
  ]) {
    it(`export sbk to yane2016: ${input}`, async () => {
      const outputs = await runBoth(
        (backend) => openBook(defaultBookSession, input, { forceOnTheFly: true, backend }),
        async (dir) => {
          const outPath = path.join(dir, "exported.db");
          await exportBook(defaultBookSession, outPath, "yane2016");
          return fs.readFileSync(outPath, "utf-8");
        },
      );
      expect(outputs.wasm).toBe(outputs.js);
    });
  }

  // 途中の局面から始まり、元の局面に戻る循環だけからなる定跡 (循環の外に局面が無い)。
  // 互いにつながらない 2 つの循環を含む (先頭の State 以外の循環にもルート局面が必要になる)
  function writeLoopBook(): { filePath: string; moves: [string, string][] } {
    const starts = [
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 1",
    ];
    const usis = ["8b7b", "2h3h", "7b8b", "3h2h"];
    const lines: [string, string][] = [];
    for (const start of starts) {
      const pos = Position.newBySFEN(start) as Position;
      for (const usi of usis) {
        lines.push([pos.sfen, usi]);
        pos.doMove(pos.createMoveByUSI(usi) as Move);
      }
      expect(pos.sfen).toBe(start);
    }
    lines.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const filePath = path.join(tmpdir, "loop.db");
    fs.writeFileSync(
      filePath,
      [
        "#YANEURAOU-DB2016 1.00",
        ...lines.map(([sfen, usi]) => `sfen ${sfen}\n${usi} none none none 1`),
        "",
      ].join("\n"),
    );
    return { filePath, moves: lines };
  }

  // やねうら王形式から SBK 形式への変換結果は、書き出し方が異なるためバイト列は一致しないが、
  // 読み込んだ内容 (State の ID を除く) は一致する
  for (const [mode, input] of [
    ["in-memory", "yaneuraou.db"],
    ["on-the-fly", "yaneuraou.db"],
    ["in-memory", "loop.db"],
    ["on-the-fly", "loop.db"],
  ]) {
    it(`export yane2016 to sbk (${mode}): ${input}`, async () => {
      const loop = input === "loop.db" ? writeLoopBook() : undefined;
      const inputPath = loop?.filePath ?? `src/tests/testdata/book/${input}`;
      const outputs = await runBoth(
        (backend) =>
          openBook(defaultBookSession, inputPath, {
            forceOnTheFly: mode === "on-the-fly",
            backend,
          }),
        async (dir) => {
          const outPath = path.join(dir, "exported.sbk");
          await exportBook(defaultBookSession, outPath, "sbk");
          return outPath;
        },
      );
      const load = async (filePath: string) => {
        const book = await loadSbkBook(filePath);
        return Array.from(book.entries)
          .map(([sfen, entry]) => ({
            sfen,
            ...entry,
            moves: entry.moves.map((m) => ({ ...m, sbkId: undefined })),
          }))
          .sort((a, b) => (a.sfen < b.sfen ? -1 : a.sfen > b.sfen ? 1 : 0));
      };
      const wasm = await load(outputs.wasm);
      expect(wasm).toEqual(await load(outputs.js));
      // 循環の局面も失われない
      for (const [sfen, usi] of loop?.moves ?? []) {
        expect(wasm.find((e) => e.sfen === sfen)?.moves.map((m) => m.usi)).toContain(usi);
      }
    });
  }

  // 編集せずに変換する (循環が他の局面とつながらない) 場合も、循環の局面は失われない
  for (const mode of ["in-memory", "on-the-fly"]) {
    it(`export a loop to sbk without edits (${mode})`, async () => {
      const loop = writeLoopBook();
      const outputs = {} as Record<BookBackend, Map<string, BookEntry>>;
      for (const backend of ["wasm", "js"] as BookBackend[]) {
        await openBook(defaultBookSession, loop.filePath, {
          forceOnTheFly: mode === "on-the-fly",
          backend,
        });
        try {
          const outPath = path.join(tmpdir, `loop-${backend}.sbk`);
          await exportBook(defaultBookSession, outPath, "sbk");
          outputs[backend] = (await loadSbkBook(outPath)).entries;
        } finally {
          clearBook(defaultBookSession);
        }
      }
      for (const [sfen, usi] of loop.moves) {
        expect(
          outputs.wasm.get(sfen)?.moves.map((m) => m.usi),
          sfen,
        ).toEqual([usi]);
        expect(
          outputs.js.get(sfen)?.moves.map((m) => m.usi),
          sfen,
        ).toEqual([usi]);
      }
      expect(outputs.wasm.size).toBe(loop.moves.length);
      expect(outputs.js.size).toBe(loop.moves.length);
    });
  }
});
