// 定跡の On-the-fly モードのベンチマーク。
// 乱数で作った定跡を 4 形式で書き出し (一時ディレクトリにキャッシュする)、
// 開く・検索・保存 (元ファイルとの統合)・他の形式への変換の時間を測る。
//
// 局面数は環境変数 BOOK_BENCH_POSITIONS で変更できる (既定値は 30000)。
//   BOOK_BENCH_POSITIONS=200000 npm run bench -- onthefly

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Move, Position } from "tsshogi";
import {
  clearBook,
  exportBook,
  openBook,
  saveBook,
  searchBookEntry,
  updateBookMove,
} from "@/background/book/index.js";
import { BookEntry } from "@/background/book/types.js";
import { storeYaneuraOuBook } from "@/background/book/yaneuraou.js";
import { storeSbkBook } from "@/background/book/sbk.js";
import { storeYbbBook } from "@/background/book/ybb.js";
import { storeAperyBook } from "@/background/book/apery.js";
import { hash as aperyHash } from "@/background/book/apery_zobrist.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { BookBackend, BookFormat, defaultBookSession } from "@/common/book.js";

const positions = Number(process.env.BOOK_BENCH_POSITIONS || 30000);
// 定跡の生成に時間がかかるため、テスト用の一時ディレクトリではなく固定のディレクトリにキャッシュする
const cacheDir = path.join(os.tmpdir(), "shogihome-book-bench", String(positions));
const tmpdir = path.join(getTempPathForTesting(), "book/onthefly-bench");

const extensions: { [K in BookFormat]: string } = {
  yane2016: ".db",
  apery: ".bin",
  sbk: ".sbk",
  ybb: ".ybb",
};

// 乱数で定跡を作る (同じ局面数なら毎回同じ定跡になる)
function generateEntries(n: number): Map<string, BookEntry> {
  let seed = 12345;
  const rnd = (m: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed % m;
  };
  const files = "123456789";
  const ranks = "abcdefghi";
  const entries = new Map<string, BookEntry>();
  while (entries.size < n) {
    const pos = new Position();
    for (let ply = 0; ply < 60 && entries.size < n; ply++) {
      const candidates: Move[] = [];
      for (let i = 0; i < 400 && candidates.length < 3 + (ply >> 2); i++) {
        const usi =
          files[rnd(9)] + ranks[rnd(9)] + files[rnd(9)] + ranks[rnd(9)] + (rnd(4) ? "" : "+");
        const move = pos.createMoveByUSI(usi);
        if (move && pos.isValidMove(move) && !candidates.some((c) => c.usi === move.usi)) {
          candidates.push(move);
        }
      }
      if (candidates.length === 0) {
        break;
      }
      const move = candidates[rnd(candidates.length)];
      const sfen = pos.sfen;
      let entry = entries.get(sfen);
      if (!entry) {
        entry = { type: "normal", moves: [] };
        entries.set(sfen, entry);
      }
      if (!entry.moves.some((m) => m.usi === move.usi)) {
        entry.moves.push({ usi: move.usi, score: rnd(200) - 100, depth: 20, count: rnd(50) + 1 });
      }
      pos.doMove(move);
    }
  }
  return entries;
}

async function prepareBooks(): Promise<{ sfens: string[] }> {
  const sfensPath = path.join(cacheDir, "sfens.json");
  if (fs.existsSync(sfensPath)) {
    return { sfens: JSON.parse(fs.readFileSync(sfensPath, "utf-8")) };
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const entries = generateEntries(positions);
  await storeYaneuraOuBook(
    { format: "yane2016", entries },
    fs.createWriteStream(path.join(cacheDir, "book.db")),
  );
  await storeSbkBook(
    { format: "sbk", entries },
    fs.createWriteStream(path.join(cacheDir, "book.sbk")),
  );
  await storeYbbBook(entries, path.join(cacheDir, "book.ybb"));
  const aperyEntries = new Map<bigint, BookEntry>();
  for (const [sfen, entry] of entries) {
    aperyEntries.set(aperyHash(sfen), entry);
  }
  await storeAperyBook(
    { format: "apery", entries: aperyEntries },
    fs.createWriteStream(path.join(cacheDir, "book.bin")),
  );
  // 検索に使う局面 (定跡に含まれる局面)
  const all = Array.from(entries.keys());
  const sfens: string[] = [];
  for (let i = 0; i < 1000; i++) {
    sfens.push(all[Math.floor((i * all.length) / 1000)]);
  }
  fs.writeFileSync(sfensPath, JSON.stringify(sfens));
  return { sfens };
}

// 1 回の処理に時間がかかるため回数を固定する
const benchOptions = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 };
const timeout = 30 * 60 * 1000;

describe("background/book on-the-fly", async () => {
  const { sfens } = await prepareBooks();
  fs.mkdirSync(tmpdir, { recursive: true });

  // WebAssembly 版が実装済みの形式は両方の実装で測る
  const targets: { format: BookFormat; backend: BookBackend }[] = [
    { format: "yane2016", backend: "js" },
    { format: "yane2016", backend: "wasm" },
    { format: "apery", backend: "js" },
    { format: "sbk", backend: "js" },
    { format: "sbk", backend: "wasm" },
    { format: "ybb", backend: "js" },
  ];
  for (const { format, backend } of targets) {
    const bookPath = path.join(cacheDir, "book" + extensions[format]);
    const size = (fs.statSync(bookPath).size / 1024 / 1024).toFixed(1);
    const label = `${format}/${backend} (${positions} positions, ${size} MB)`;
    const exportFormat: BookFormat = format === "yane2016" ? "sbk" : "yane2016";
    const open = () => openBook(defaultBookSession, bookPath, { forceOnTheFly: true, backend });

    const cases: { name: string; setup?: () => Promise<void>; fn: () => Promise<void> }[] = [
      { name: "open", fn: async () => void (await open()) },
      {
        name: `search x${sfens.length}`,
        setup: async () => void (await open()),
        fn: async () => {
          for (const sfen of sfens) {
            await searchBookEntry(defaultBookSession, sfen);
          }
        },
      },
      {
        name: "save (merge)",
        setup: async () => {
          await open();
          await updateBookMove(defaultBookSession, sfens[0], { usi: "1g1f", count: 1 });
        },
        fn: () => saveBook(defaultBookSession, path.join(tmpdir, "out" + extensions[format])),
      },
    ];
    // Apery 形式は他の形式に変換できない。WebAssembly 版は形式間の変換に未対応
    if (format !== "apery" && backend !== "wasm") {
      cases.push({
        name: `export to ${exportFormat}`,
        setup: async () => void (await open()),
        fn: () =>
          exportBook(
            defaultBookSession,
            path.join(tmpdir, "export" + extensions[exportFormat]),
            exportFormat,
          ),
      });
    }

    for (const c of cases) {
      test(
        `${c.name}: ${label}`,
        async ({ bench }) => {
          await c.setup?.();
          // 非同期関数であることを明示する (判定のための呼び出しが別の呼び出しと重ならないようにする)
          await bench(`${c.name}: ${label}`, { async: true }, c.fn).run(benchOptions);
          clearBook(defaultBookSession);
        },
        timeout,
      );
    }
  }
});
