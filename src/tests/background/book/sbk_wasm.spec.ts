import fs from "node:fs";
import { PassThrough } from "node:stream";
import { Position } from "tsshogi";
import { loadSbkBook, storeSbkBook } from "@/background/book/sbk.js";
import { BookEntry } from "@/background/book/types.js";
import { SbkWasmStore } from "@/background/book/wasm/sbk_store.js";

// WebAssembly 版の SBK ストアが JavaScript 版と同じ結果になることを確かめる

async function collect(write: (output: PassThrough) => Promise<void>): Promise<Buffer> {
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk: Buffer) => chunks.push(chunk));
  await write(pass);
  return Buffer.concat(chunks);
}

function loadWasm(data: Uint8Array): SbkWasmStore {
  const store = new SbkWasmStore();
  store.loadSbk(data);
  return store;
}

async function storeJs(entries: Map<string, BookEntry>, author?: string, description?: string) {
  return collect((output) =>
    storeSbkBook(
      { format: "sbk", entries, sbkAuthor: author, sbkDescription: description },
      output,
    ),
  );
}

// 乱数で定跡を作る
function randomEntries(seed: number, games: number, depth: number): Map<string, BookEntry> {
  let s = seed;
  const rnd = (n: number) => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s % n;
  };
  const files = "123456789";
  const ranks = "abcdefghi";
  const entries = new Map<string, BookEntry>();
  for (let g = 0; g < games; g++) {
    const pos = new Position();
    for (let d = 0; d < depth; d++) {
      const candidates = [];
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

describe("background/book/wasm/sbk_store", () => {
  const files = fs
    .readdirSync("src/tests/testdata/book")
    .filter((name) => name.endsWith(".sbk"))
    .sort();

  for (const name of files) {
    it(`load and store: ${name}`, async () => {
      const data = fs.readFileSync(`src/tests/testdata/book/${name}`);
      const js = await loadSbkBook(data);
      const wasm = loadWasm(data);

      // エントリーの内容と順序が一致する
      expect(wasm.size).toBe(js.entries.size);
      expect([...wasm.entries()]).toEqual([...js.entries.entries()]);
      expect(wasm.sbkMeta).toEqual({ author: js.sbkAuthor, description: js.sbkDescription });

      // 書き出した結果が一致する
      const expected = await storeJs(js.entries, js.sbkAuthor, js.sbkDescription);
      const actual = await collect((output) => wasm.storeSbk(output));
      expect(actual.toString("hex")).toBe(expected.toString("hex"));
    });
  }

  it("get and set", () => {
    const store = new SbkWasmStore();
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
    expect(store.get(sfen)).toBeUndefined();
    const entry: BookEntry = {
      type: "normal",
      moves: [
        { usi: "7g7f", count: 3, comment: "", score: 1.5, depth: 10, usi2: "3c3d" },
        { usi: "p*5e", sbkEval: 2, sbkId: -1 },
        { usi: "+P*5e" },
        { usi: "invalid" },
      ],
      minPly: 1,
      comment: "",
      games: 1e20,
      wonBlack: NaN,
      wonWhite: -0,
      sbkEvals: [{ EvaluationValue: -5, Depth: 1, SelDepth: 2, Nodes: -(2n ** 63n) }],
    };
    store.set(sfen, entry);
    expect(store.get(sfen)).toEqual(entry);
    expect(store.size).toBe(1);

    // SFEN は文字列として完全一致した場合だけ同じキーになる
    const sfen2 = sfen.replace(/ 1$/, " 2");
    expect(store.get(sfen2)).toBeUndefined();
    store.set(sfen2, { type: "patch", moves: [] });
    expect(store.get(sfen2)).toEqual({ type: "patch", moves: [] });
    // 不正な SFEN もキーとして使える
    store.set("invalid", { type: "normal", moves: [{ usi: "7g7f" }] });
    expect([...store.entries()].map(([k]) => k)).toEqual([sfen, sfen2, "invalid"]);

    // 既存のキーへの代入は順序を変えない
    store.set(sfen, { type: "normal", moves: [] });
    expect([...store.entries()].map(([k]) => k)).toEqual([sfen, sfen2, "invalid"]);
  });

  for (const [seed, games, depth] of [
    [1, 200, 30],
    [2, 50, 80],
    [3, 500, 10],
  ]) {
    it(`store random book: seed=${seed}`, async () => {
      const entries = randomEntries(seed, games, depth);
      expect(entries.size).toBeGreaterThan(30);
      const wasm = new SbkWasmStore();
      for (const [sfen, entry] of entries) {
        wasm.set(sfen, entry);
      }
      wasm.sbkMeta = { author: "作者", description: "description" };
      const expected = await storeJs(entries, "作者", "description");
      const actual = await collect((output) => wasm.storeSbk(output));
      expect(actual.toString("hex")).toBe(expected.toString("hex"));

      // 読み込み直した結果も一致する
      const js = await loadSbkBook(expected);
      const reloaded = loadWasm(expected);
      expect([...reloaded.entries()]).toEqual([...js.entries.entries()]);
    });
  }
});
