// [移行期間のみ] WebAssembly 版の YBB On-the-fly が JavaScript 版と同じ結果になることを確かめる。
// JavaScript 版を削除する際にはこのファイルも削除する。

import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { Move, Position } from "tsshogi";
import { BookEntry } from "@/background/book/types.js";
import {
  mergeYbbBook,
  openYbbBookOnTheFly,
  searchYbbBookMovesOnTheFly,
  storeYbbBook,
} from "@/background/book/ybb.js";
import { loadSbkBook } from "@/background/book/sbk.js";
import { YbbWasmBook } from "@/background/book/wasm/ybb.js";
import { clearBook, exportBook, openBook, saveBook } from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/ybb-wasm-equivalence");

function random(seed: number) {
  let x = seed;
  const rnd = (m: number) => {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    return x % m;
  };
  const pick = <T>(items: T[]): T => items[rnd(items.length)];
  return { rnd, pick };
}

// 乱数で指して局面と指し手を作る
function generatePositions(seed: number, n: number): { sfen: string; usis: string[] }[] {
  const { rnd } = random(seed);
  const files = "123456789";
  const ranks = "abcdefghi";
  const result = new Map<string, string[]>();
  while (result.size < n) {
    const pos = new Position();
    for (let ply = 0; ply < 40 && result.size < n; ply++) {
      const candidates: Move[] = [];
      for (let i = 0; i < 300 && candidates.length < 1 + rnd(5); i++) {
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
      result.set(
        pos.sfen,
        candidates.map((m) => m.usi),
      );
      pos.doMove(candidates[rnd(candidates.length)]);
    }
  }
  return Array.from(result, ([sfen, usis]) => ({ sfen, usis }));
}

// 乱数で YBB 形式のファイルを作る (探索深さの有無の両方)
async function generateBook(seed: number, filePath: string): Promise<string[]> {
  const { rnd, pick } = random(seed * 3 + 1);
  const withDepth = seed % 2 === 0;
  const entries = new Map<string, BookEntry>();
  for (const { sfen, usis } of generatePositions(seed, 1 + rnd(200))) {
    entries.set(sfen, {
      type: "normal",
      moves: usis.map((usi) => ({
        usi,
        score: rnd(4) ? rnd(2000) - 1000 : pick([32767, -32768, 0]),
        depth: withDepth ? pick([0, 1, 20, 65535]) : undefined,
      })),
      minPly: pick([1, 30, 65535, 70000]),
    });
  }
  await storeYbbBook(entries, filePath);
  return Array.from(entries.keys());
}

// 乱数で編集内容 (in-memory のエントリー) を作る
function generatePatches(seed: number, keys: string[]): Map<string, BookEntry> {
  const { rnd, pick } = random(seed * 7 + 2);
  const others = generatePositions(seed + 1000, 20);
  const entries = new Map<string, BookEntry>();
  for (let i = 0; i < 1 + rnd(20); i++) {
    const key = rnd(2) === 0 && keys.length > 0 ? pick(keys) : pick(others).sfen;
    entries.set(key, {
      type: pick(["normal", "patch"]),
      moves: Array.from({ length: rnd(4) }, () => ({
        usi: pick(["7g7f", "2g2f", "1g1f", "P*5e"]),
        score: pick([undefined, 0, 5, -7, 2.5, -2.5, -0.4, NaN, 32767]),
        depth: pick([undefined, 0, 3, 1.5, NaN]),
      })),
      minPly: pick([undefined, 1, 10, 2.5]),
    });
  }
  return entries;
}

describe("[transition] background/book YBB: WebAssembly equals JavaScript", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  for (let seed = 1; seed <= 30; seed++) {
    it(`on-the-fly: seed=${seed}`, async () => {
      const filePath = path.join(tmpdir, `book${seed}.ybb`);
      const keys = await generateBook(seed, filePath);
      const js = await openYbbBookOnTheFly(filePath);
      const wasm = YbbWasmBook.open(filePath);
      try {
        // 検索
        const notExists = generatePositions(seed + 2000, 5).map((p) => p.sfen);
        for (const key of [...keys, ...notExists]) {
          const expected = await searchYbbBookMovesOnTheFly(key, js.file, js.recordCount, js.flags);
          expect(wasm.search(key), key).toEqual(expected);
        }

        // 書き出し
        const patches = generatePatches(seed, keys);
        const jsPath = path.join(tmpdir, `js${seed}.ybb`);
        await mergeYbbBook(js.file, js.recordCount, js.flags, structuredClone(patches), jsPath);
        const wasmOutput = new PassThrough();
        const chunks: Buffer[] = [];
        wasmOutput.on("data", (chunk: Buffer) => chunks.push(chunk));
        await wasm.store(structuredClone(patches), wasmOutput);
        expect(Buffer.concat(chunks).toString("hex")).toBe(fs.readFileSync(jsPath, "hex"));
      } finally {
        wasm.close();
        await js.file.close();
      }
    });
  }

  // 公開 API を通して両方の実装で同じ操作をした結果を返す
  async function runBoth(
    open: (backend: BookBackend) => Promise<unknown>,
    run: (dir: string) => Promise<string>,
    { positionComment = true }: { positionComment?: boolean } = {},
  ): Promise<Record<BookBackend, string>> {
    const outputs = {} as Record<BookBackend, string>;
    for (const backend of ["wasm", "js"] as BookBackend[]) {
      const dir = path.join(tmpdir, `run-${backend}`);
      fs.mkdirSync(dir, { recursive: true });
      await open(backend);
      try {
        await editBook(defaultBookSession, dir, { positionComment });
        outputs[backend] = await run(dir);
      } finally {
        clearBook(defaultBookSession);
      }
    }
    return outputs;
  }

  const ybbPath = "src/tests/testdata/book/yaneuraou.ybb";
  const openYbb = (backend: BookBackend) =>
    openBook(defaultBookSession, ybbPath, { forceOnTheFly: true, backend });

  it("edit and save", async () => {
    const outputs = await runBoth(
      openYbb,
      async (dir) => {
        const outPath = path.join(dir, "edited.ybb");
        await saveBook(defaultBookSession, outPath);
        return fs.readFileSync(outPath, "hex");
      },
      { positionComment: false },
    );
    expect(outputs.wasm).toBe(outputs.js);
  });

  // 新規作成した定跡を保存した結果
  it("new book", async () => {
    const outputs = await runBoth(
      async (backend) => clearBook(defaultBookSession, "ybb", backend),
      async (dir) => {
        const outPath = path.join(dir, "new.ybb");
        await saveBook(defaultBookSession, outPath);
        return fs.readFileSync(outPath, "hex");
      },
      { positionComment: false },
    );
    expect(outputs.wasm).toBe(outputs.js);
  });

  it("export ybb to yane2016", async () => {
    const outputs = await runBoth(
      openYbb,
      async (dir) => {
        const outPath = path.join(dir, "exported.db");
        await exportBook(defaultBookSession, outPath, "yane2016");
        return fs.readFileSync(outPath, "utf-8");
      },
      { positionComment: false },
    );
    expect(outputs.wasm).toBe(outputs.js);
  });

  // SBK 形式への変換結果は、書き出し方が異なるためバイト列は一致しないが、読み込んだ内容 (State の ID を除く) は一致する
  it("export ybb to sbk", async () => {
    const outputs = await runBoth(
      openYbb,
      async (dir) => {
        const outPath = path.join(dir, "exported.sbk");
        await exportBook(defaultBookSession, outPath, "sbk");
        return outPath;
      },
      { positionComment: false },
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
    expect(await load(outputs.wasm)).toEqual(await load(outputs.js));
  });

  for (const [input, mode] of [
    ["src/tests/testdata/book/yaneuraou.db", "in-memory"],
    ["src/tests/testdata/book/yaneuraou.db", "on-the-fly"],
    ["src/tests/testdata/book/shogigui02.sbk", "on-the-fly"],
  ]) {
    it(`export to ybb: ${input} (${mode})`, async () => {
      const outputs = await runBoth(
        (backend) =>
          openBook(defaultBookSession, input, { forceOnTheFly: mode === "on-the-fly", backend }),
        async (dir) => {
          const outPath = path.join(dir, "exported.ybb");
          await exportBook(defaultBookSession, outPath, "ybb");
          return fs.readFileSync(outPath, "hex");
        },
      );
      expect(outputs.wasm).toBe(outputs.js);
    });
  }
});
