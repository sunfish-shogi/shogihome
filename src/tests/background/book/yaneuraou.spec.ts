import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  loadYaneuraOuBook,
  searchYaneuraOuBookMovesOnTheFly,
  validateBookPositionOrdering,
} from "@/background/book/yaneuraou.js";
import { BookEntry } from "@/background/book/types.js";
import { getTempPathForTesting } from "@/background/proc/env.js";

const tmpdir = path.join(getTempPathForTesting(), "book/yaneuraou");

// 内容を一時ファイルに書き出して On-the-fly モードで検索する
async function searchOnTheFly(
  name: string,
  content: string,
  sfens: string[],
): Promise<(BookEntry | undefined)[]> {
  fs.mkdirSync(tmpdir, { recursive: true });
  const filePath = path.join(tmpdir, name);
  fs.writeFileSync(filePath, content);
  const file = await fs.promises.open(filePath, "r");
  try {
    const size = (await file.stat()).size;
    const results: (BookEntry | undefined)[] = [];
    for (const sfen of sfens) {
      results.push(await searchYaneuraOuBookMovesOnTheFly(sfen, file, size));
    }
    return results;
  } finally {
    await file.close();
  }
}

describe("background/book/yaneuraou", () => {
  describe("loadYaneuraOuBook", () => {
    it("ok", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 1.00\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
      ]);
      const book = await loadYaneuraOuBook(input);
      expect(Object.fromEntries(book.entries.entries())).toEqual({
        "+P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 1": {
          type: "normal",
          comment: "",
          moves: [
            { usi: "4e4f", usi2: "9c9d", score: 120, depth: 40, count: 2, comment: "" },
            { usi: "6e6f", usi2: "6g6h", score: -32, depth: 32, count: 0, comment: "" },
          ],
          minPly: 78,
        },
        "lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 1": {
          type: "normal",
          comment: "",
          moves: [
            { usi: "4e7h+", usi2: undefined, score: 540, depth: 38, count: 1, comment: "" },
            { usi: "2d8d", usi2: undefined, score: 140, depth: 36, count: 1, comment: "" },
          ],
          minPly: 64,
        },
        "+B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p 1": {
          type: "normal",
          comment: "",
          moves: [{ usi: "9f9e", usi2: "8g7g", score: 0, depth: 32, count: 1, comment: "" }],
          minPly: 0,
        },
      });
    });

    it("invalid header", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 2.00\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
      ]);
      await expect(loadYaneuraOuBook(input)).rejects.toThrow(
        "Unsupported book header: #YANEURAOU-DB2016 2.00",
      );
    });
  });

  describe("validateBookPositionOrdering", () => {
    it("ordered", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 1.00\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
      ]);
      expect(await validateBookPositionOrdering(input)).toBeTruthy();
    });

    it("not ordered", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 1.00\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
      ]);
      expect(await validateBookPositionOrdering(input)).toBeFalsy();
    });
  });

  describe("searchYaneuraOuBookMovesOnTheFly", () => {
    it("single position", async () => {
      const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
      const content = [
        "#YANEURAOU-DB2016 1.00",
        `sfen ${sfen}`,
        "7g7f none 10 5 3",
        "2g2f none 20 5 1",
        "",
      ].join("\n");
      const [entry] = await searchOnTheFly("single.db", content, [sfen]);
      expect(entry?.moves[0].usi).toBe("7g7f");
    });

    // 局面ごとの大きさを大きく変えて、二分探索の範囲の後半に局面の行が無い場合や、
    // 範囲の中央がちょうど局面の行頭になる場合を作る
    for (let seed = 1; seed <= 20; seed++) {
      it(`find every position: seed=${seed}`, async () => {
        let x = seed;
        const rnd = (m: number) => {
          x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
          return x % m;
        };
        const sfens: string[] = [];
        // ファイルの先頭は、ヘッダーの有無と BOM の有無の組み合わせを試す
        const bom = seed % 2 === 0 ? "\uFEFF" : "";
        const lines = seed % 4 < 2 ? [bom + "#YANEURAOU-DB2016 1.00"] : [];
        const n = 1 + rnd(40);
        for (let i = 0; i < n; i++) {
          const sfen = `9/9/9/9/9/9/9/9/9 b ${String(1000 + i)}P 1`;
          sfens.push(sfen);
          lines.push((lines.length === 0 ? bom : "") + `sfen ${sfen}`);
          const moves = rnd(4) === 0 ? 1 + rnd(200) : 1 + rnd(3);
          for (let j = 0; j < moves; j++) {
            lines.push(`7g7f none ${i} ${j} 1`);
          }
        }
        // 末尾の局面 (検索しない)
        lines.push("sfen 9/9/9/9/9/9/9/9/9 b 9999P 1", "7g7f none 0 0 1");
        const content = lines.join("\n") + "\n";
        const notExists = "9/9/9/9/9/9/9/9/9 b 0999P 1";
        const results = await searchOnTheFly(`seed${seed}.db`, content, [...sfens, notExists]);
        for (let i = 0; i < n; i++) {
          expect(results[i]?.moves[0].score, sfens[i]).toBe(i);
        }
        expect(results[n]).toBeUndefined();
      });
    }
  });
});
