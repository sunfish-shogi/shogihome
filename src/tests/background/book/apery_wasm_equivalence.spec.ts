// [移行期間のみ] WebAssembly 版の Apery On-the-fly が JavaScript 版と同じ結果になることを確かめる。
// JavaScript 版を削除する際にはこのファイルも削除する。

import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { Move, Position } from "tsshogi";
import { BookEntry } from "@/background/book/types.js";
import {
  mergeAperyBook,
  searchAperyBookMovesOnTheFly,
  storeAperyBook,
} from "@/background/book/apery.js";
import { hash } from "@/background/book/apery_zobrist.js";
import { AperyWasmBook } from "@/background/book/wasm/apery.js";
import { clearBook, exportBook, openBook, saveBook } from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/apery-wasm-equivalence");

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

function collect(output: PassThrough): () => Buffer {
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  return () => Buffer.concat(chunks);
}

// 乱数で Apery 形式のファイルを作る (同じ局面の中で同じ指し手が重複する場合を含む)
async function generateBook(seed: number, filePath: string): Promise<string[]> {
  const { rnd, pick } = random(seed * 3 + 1);
  const entries = new Map<bigint, BookEntry>();
  const positions = generatePositions(seed, 1 + rnd(200));
  for (const { sfen, usis } of positions) {
    const moves = usis.map((usi) => ({
      usi,
      count: pick([0, 1, 100, 65535]),
      score: rnd(4) ? rnd(2000) - 1000 : pick([2147483647, -2147483648]),
    }));
    if (rnd(8) === 0) {
      moves.push({ ...moves[0], count: 7 });
    }
    entries.set(hash(sfen), { type: "normal", moves });
  }
  const output = fs.createWriteStream(filePath);
  await storeAperyBook({ format: "apery", entries }, output);
  return positions.map((p) => p.sfen);
}

// 乱数で編集内容 (in-memory のエントリー) を作る
function generatePatches(seed: number, sfens: string[]): Map<bigint, BookEntry> {
  const { rnd, pick } = random(seed * 7 + 2);
  const others = generatePositions(seed + 1000, 20).map((p) => p.sfen);
  const entries = new Map<bigint, BookEntry>();
  for (let i = 0; i < 1 + rnd(20); i++) {
    const sfen = rnd(2) === 0 ? pick(sfens) : pick(others);
    entries.set(hash(sfen), {
      type: pick(["normal", "patch"]),
      moves: Array.from({ length: rnd(4) }, () => ({
        usi: pick(["7g7f", "2g2f", "1g1f", "P*5e"]),
        count: pick([undefined, 0, 3, 2.5, NaN, 65535]),
        score: pick([undefined, 0, 5, -7, 2.5, -2.5, -0.4, NaN]),
      })),
    });
  }
  return entries;
}

describe("[transition] background/book Apery: WebAssembly equals JavaScript", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  for (let seed = 1; seed <= 30; seed++) {
    it(`on-the-fly: seed=${seed}`, async () => {
      const filePath = path.join(tmpdir, `book${seed}.bin`);
      const sfens = await generateBook(seed, filePath);
      const size = fs.statSync(filePath).size;
      const file = await fs.promises.open(filePath, "r");
      const wasm = AperyWasmBook.open(filePath);
      try {
        // 検索
        const notExists = generatePositions(seed + 2000, 5).map((p) => p.sfen);
        for (const sfen of [...sfens, ...notExists]) {
          const expected = await searchAperyBookMovesOnTheFly(sfen, file, size);
          expect(wasm.search(sfen), sfen).toEqual(expected);
        }

        // 書き出し
        const patches = generatePatches(seed, sfens);
        const jsOutput = new PassThrough();
        const jsResult = collect(jsOutput);
        await mergeAperyBook(
          file.createReadStream({ autoClose: false, start: 0, highWaterMark: 128 * 1024 }),
          { format: "apery", entries: structuredClone(patches) },
          jsOutput,
        );
        const wasmOutput = new PassThrough();
        const wasmResult = collect(wasmOutput);
        await wasm.store(structuredClone(patches), wasmOutput);
        expect(wasmResult().toString("hex")).toBe(jsResult().toString("hex"));
      } finally {
        wasm.close();
        await file.close();
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

  const save = async (dir: string) => {
    const outPath = path.join(dir, "saved.bin");
    await saveBook(defaultBookSession, outPath);
    return fs.readFileSync(outPath, "hex");
  };

  it("edit and save", async () => {
    const outputs = await runBoth(
      (backend) =>
        openBook(defaultBookSession, "src/tests/testdata/book/apery.bin", {
          forceOnTheFly: true,
          backend,
        }),
      save,
      { positionComment: false },
    );
    expect(outputs.wasm).toBe(outputs.js);
  });

  it("new book", async () => {
    const outputs = await runBoth(
      async (backend) => clearBook(defaultBookSession, "apery", backend),
      save,
      { positionComment: false },
    );
    expect(outputs.wasm).toBe(outputs.js);
  });

  // 他の形式から Apery 形式への変換結果が一致する (局面のハッシュ値の計算も一致する)
  for (const [input, mode] of [
    ["src/tests/testdata/book/yaneuraou.db", "in-memory"],
    ["src/tests/testdata/book/yaneuraou.db", "on-the-fly"],
    ["src/tests/testdata/book/shogigui02.sbk", "on-the-fly"],
    ["src/tests/testdata/book/yaneuraou.ybb", "on-the-fly"],
  ]) {
    it(`export to apery: ${input} (${mode})`, async () => {
      const outputs = await runBoth(
        (backend) =>
          openBook(defaultBookSession, input, { forceOnTheFly: mode === "on-the-fly", backend }),
        async (dir) => {
          const outPath = path.join(dir, "exported.bin");
          await exportBook(defaultBookSession, outPath, "apery");
          return fs.readFileSync(outPath, "hex");
        },
        { positionComment: !input.endsWith(".ybb") },
      );
      expect(outputs.wasm.length).toBeGreaterThan(0);
      expect(outputs.wasm).toBe(outputs.js);
    });
  }
});
