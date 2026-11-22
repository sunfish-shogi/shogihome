// [移行期間のみ] WebAssembly 版の SBK On-the-fly が JavaScript 版と同じ結果になることを確かめる。
// JavaScript 版を削除する際にはこのファイルも削除する。
// WebAssembly 版の出力そのものは sbk_wasm_golden.spec.ts で期待値ファイルと比較して固定している。

import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { Move, Position } from "tsshogi";
import {
  loadSbkBook,
  loadSbkBookOnTheFly,
  searchSbkBookEntryOnTheFly,
  storeSbkBook,
} from "@/background/book/sbk.js";
import { BookEntry, SbkBook } from "@/background/book/types.js";
import { SbkWasmOnTheFly } from "@/background/book/wasm/sbk_onthefly.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { clearBook, openBook, saveBook } from "@/background/book/index.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { editBook, snapshotBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/sbk-onthefly-wasm");

async function collect(write: (output: PassThrough) => Promise<void>): Promise<string> {
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk: Buffer) => chunks.push(chunk));
  await write(pass);
  return Buffer.concat(chunks).toString("hex");
}

function random(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s % n;
  };
}

// 乱数で定跡を作る
function randomEntries(seed: number, games: number, depth: number): Map<string, BookEntry> {
  const rnd = random(seed);
  const files = "123456789";
  const ranks = "abcdefghi";
  const entries = new Map<string, BookEntry>();
  for (let g = 0; g < games; g++) {
    const pos = new Position();
    for (let d = 0; d < depth; d++) {
      const candidates: Move[] = [];
      for (let i = 0; i < 300 && candidates.length < 3; i++) {
        const usi =
          files[rnd(9)] + ranks[rnd(9)] + files[rnd(9)] + ranks[rnd(9)] + (rnd(4) ? "" : "+");
        const move = pos.createMoveByUSI(usi);
        if (move && pos.isValidMove(move)) {
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
        if (rnd(5) === 0) {
          entry.comment = `comment ${g} ${d} あいう`;
        }
        if (rnd(3) === 0) {
          entry.games = rnd(10);
          entry.wonBlack = rnd(5);
          entry.wonWhite = rnd(5);
        }
        if (rnd(7) === 0) {
          entry.sbkEvals = [
            {
              EvaluationValue: rnd(2000) - 1000,
              Depth: rnd(30),
              SelDepth: rnd(40),
              Nodes: BigInt(rnd(1000000)) * 1000n,
              Variation: rnd(2) ? "7g7f 3c3d" : undefined,
              EngineName: rnd(2) ? "engine" : undefined,
            },
          ];
        }
        entries.set(sfen, entry);
      }
      if (!entry.moves.some((m) => m.usi === move.usi)) {
        entry.moves.push({
          usi: move.usi,
          count: rnd(3) ? rnd(100) : undefined,
          sbkEval: rnd(4) ? undefined : rnd(5),
        });
      }
      pos.doMove(move);
    }
  }
  return entries;
}

// 定跡の局面に対する編集内容を乱数で作る (On-the-fly モードの in-memory のエントリーに相当する)
function randomPatches(seed: number, sfens: string[]): Map<string, BookEntry> {
  const rnd = random(seed);
  const patches = new Map<string, BookEntry>();
  const moves = ["7g7f", "2g2f", "3c3d", "8c8d", "5g5f", "P*5e", "9g9f", "1c1d"];
  for (let i = 0; i < Math.min(40, sfens.length); i++) {
    const sfen = sfens[rnd(sfens.length)];
    const entry: BookEntry = {
      type: rnd(2) ? "patch" : "normal",
      moves: [],
    };
    for (let j = rnd(4); j > 0; j--) {
      entry.moves.push({
        usi: moves[rnd(moves.length)],
        count: rnd(3) ? rnd(10) : undefined,
        sbkEval: rnd(3) ? undefined : rnd(5),
        comment: rnd(4) ? undefined : "c",
      });
    }
    if (rnd(3) === 0) {
      entry.comment = rnd(2) ? "patched" : "";
    }
    if (rnd(4) === 0) {
      entry.games = rnd(5);
      entry.wonBlack = rnd(3);
    }
    patches.set(sfen, entry);
  }
  // 元の定跡に無い局面
  const pos = new Position();
  patches.set(pos.sfen, { type: "normal", moves: [{ usi: "7g7f", count: 1 }] });
  pos.doMove(pos.createMoveByUSI("7g7f")!);
  patches.set(pos.sfen, { type: "patch", moves: [{ usi: "3c3d", count: 2 }] });
  return patches;
}

async function compare(filePath: string, patchSeed: number) {
  const js = await loadSbkBookOnTheFly(filePath);
  const wasm = await SbkWasmOnTheFly.open(filePath);
  expect(wasm.author).toBe(js.sbkAuthor);
  expect(wasm.description).toBe(js.sbkDescription);
  expect(wasm.stateCount).toBe(js.sbkIndex?.rowCount);

  // 検索結果が一致する
  const data = fs.readFileSync(filePath);
  const full = data.length > 0 ? await loadSbkBook(data) : undefined;
  const sfens = [
    ...(full ? full.entries.keys() : []),
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 5",
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL  b  -  1",
    "invalid",
  ];
  for (const sfen of sfens) {
    const expected = await searchSbkBookEntryOnTheFly(sfen, js.rawData!, js.sbkIndex!);
    expect(wasm.search(sfen)).toEqual(expected);
  }

  // 編集内容を統合して書き出した結果が一致する
  const patches = randomPatches(patchSeed, sfens.slice(0, -1));
  const expected = await collect((output) =>
    storeSbkBook({ ...js, entries: patches } as SbkBook, output),
  );
  const actual = await collect((output) => wasm.store(patches, output));
  expect(actual).toBe(expected);

  // 書き出した後も検索結果が変わらない
  for (const sfen of sfens.slice(0, 20)) {
    const expected = await searchSbkBookEntryOnTheFly(sfen, js.rawData!, js.sbkIndex!);
    expect(wasm.search(sfen)).toEqual(expected);
  }
}

describe("[transition] background/book/wasm/sbk_onthefly equals JavaScript version", () => {
  beforeAll(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  const files = fs
    .readdirSync("src/tests/testdata/book")
    .filter((name) => name.endsWith(".sbk"))
    .sort();
  for (const [i, name] of files.entries()) {
    it(`fixture: ${name}`, async () => {
      await compare(`src/tests/testdata/book/${name}`, i + 1);
    });
  }

  it("empty file", async () => {
    const filePath = path.join(tmpdir, "empty.sbk");
    fs.writeFileSync(filePath, Buffer.alloc(0));
    await compare(filePath, 100);
  });

  for (const [seed, games, depth] of [
    [1, 200, 30],
    [2, 60, 80],
    [3, 500, 10],
  ]) {
    it(`random book: seed=${seed}`, async () => {
      const entries = randomEntries(seed, games, depth);
      expect(entries.size).toBeGreaterThan(30);
      const filePath = path.join(tmpdir, `random-${seed}.sbk`);
      await storeSbkBook(
        { format: "sbk", entries, sbkAuthor: "作者", sbkDescription: "説明" },
        fs.createWriteStream(filePath),
      );
      await compare(filePath, seed * 10);
    });
  }
});

describe("[transition] background/book SBK on-the-fly: WebAssembly equals JavaScript", () => {
  const dir = path.join(tmpdir, "api");

  beforeAll(() => {
    fs.mkdirSync(dir, { recursive: true });
    // 新規作成した定跡は、空のファイルを On-the-fly モードで開いた場合と同じになる
    fs.writeFileSync(path.join(dir, "empty.sbk"), Buffer.alloc(0));
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  async function run(input: string | undefined, backend: BookBackend) {
    if (input) {
      await openBook(defaultBookSession, input, { backend, forceOnTheFly: true });
    } else if (backend === "wasm") {
      clearBook(defaultBookSession, "sbk", "wasm");
    } else {
      await openBook(defaultBookSession, path.join(dir, "empty.sbk"), {
        backend,
        forceOnTheFly: true,
      });
    }
    await editBook(defaultBookSession, dir);
    const snapshot = await snapshotBook(defaultBookSession);
    const outPath = path.join(dir, `out-${backend}.sbk`);
    await saveBook(defaultBookSession, outPath);
    return { snapshot, saved: fs.readFileSync(outPath).toString("hex") };
  }

  for (const input of [
    "src/tests/testdata/book/shogigui01.sbk",
    "src/tests/testdata/book/shogigui02.sbk",
    "src/tests/testdata/book/sbk-merge.sbk",
    undefined,
  ]) {
    it(`edit and save: ${input ?? "new book"}`, async () => {
      const wasm = await run(input, "wasm");
      const js = await run(input, "js");
      expect(wasm).toEqual(js);
    });
  }
});
