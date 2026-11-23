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

    // In-memory モードと同じエントリーが得られる
    const positions = [
      {
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
        lines: [
          "#position comment",
          "8c8d none 10 5 3",
          "#move comment",
          "",
          "3c3d 2g2f 20 5 1 #c",
        ],
      },
      {
        // 8 KB を超える局面
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        lines: Array.from({ length: 600 }, (_, i) => `7g7f none ${i} 5 ${i}`),
      },
      {
        // 指し手の無い局面
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1",
        lines: [],
      },
      {
        // ファイル末尾の局面
        sfen: "lnsgkgsnl/1r7/p1ppp1bpp/1p3pp2/7P1/2P6/PP1PPPP1P/1B3S1R1/LNSGKG1NL b - 1",
        lines: ["2g2f none 30 5 1", "5g5f none 40 5 1"],
      },
    ];
    for (const newline of ["\n", "\r\n", "\r"]) {
      for (const lastNewline of [true, false]) {
        const label = `${JSON.stringify(newline)} lastNewline=${lastNewline}`;
        const content =
          [
            "#YANEURAOU-DB2016 1.00",
            ...positions.flatMap((p) => [`sfen ${p.sfen}`, ...p.lines]),
          ].join(newline) + (lastNewline ? newline : "");
        const sfens = positions.map((p) => p.sfen);

        it(`same entries as in-memory: ${label}`, async () => {
          const inMemory = await loadYaneuraOuBook(Readable.from([content]));
          const results = await searchOnTheFly("entry.db", content, sfens);
          for (let i = 0; i < sfens.length; i++) {
            expect(results[i], sfens[i]).toEqual(inMemory.entries.get(sfens[i]));
          }
          // コメント行は、指し手より前なら局面のコメント、後ろなら直前の指し手のコメントになる
          expect(results[0]?.comment).toBe("position comment");
          expect(results[0]?.moves.map((m) => m.comment)).toEqual(["move comment\n", "c"]);
        });
      }
    }

    // 次の局面の行が、読み込みの単位 (8 KB) の境界をまたぐ場合も、
    // 次の局面の行の手前で読み込みを止める
    it("position line across the read boundary", async () => {
      const sfen1 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
      const sfen2 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1";
      fs.mkdirSync(tmpdir, { recursive: true });
      const filePath = path.join(tmpdir, "boundary.db");
      for (const newline of ["\n", "\r\n"]) {
        for (let padding = 8150; padding <= 8200; padding++) {
          const content = [
            "#YANEURAOU-DB2016 1.00",
            `sfen ${sfen1}`,
            "#" + "x".repeat(padding),
            "7g7f none 1 1 1",
            `sfen ${sfen2}`,
            "3c3d none 2 2 2",
            // 読み込みが止まらなかった場合に分かるように、後ろに大きなコメントを置く
            "#" + "y".repeat(256 * 1024),
            "",
          ].join(newline);
          fs.writeFileSync(filePath, content);
          const label = `${JSON.stringify(newline)} padding=${padding}`;
          const file = await fs.promises.open(filePath, "r");
          try {
            let bytesRead = 0;
            const read = file.read.bind(file);
            file.read = (async (...args: Parameters<typeof read>) => {
              const result = await read(...args);
              // 二分探索の読み込み (1 KB 単位) は除く
              if (result.buffer.byteLength !== 1024) {
                bytesRead += result.bytesRead;
              }
              return result;
            }) as typeof file.read;
            const entry = await searchYaneuraOuBookMovesOnTheFly(sfen1, file, content.length);
            expect(entry?.comment, label).toBe("x".repeat(padding));
            expect(
              entry?.moves.map((m) => m.usi),
              label,
            ).toEqual(["7g7f"]);
            expect(bytesRead, label).toBeLessThan(64 * 1024);
          } finally {
            await file.close();
          }
        }
      }
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
