import path from "node:path";
import fs from "node:fs";
import {
  clearBook,
  importBookMoves,
  openBook,
  removeBookMove,
  saveBook,
  searchBookMoves,
  updateBookMove,
  updateBookMoveOrder,
} from "@/background/book";
import { getTempPathForTesting } from "@/background/proc/env";
import { defaultBookImportSettings, PlayerCriteria, SourceType } from "@/common/settings/book";

const tmpdir = path.join(getTempPathForTesting(), "book");

describe("background/book", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir);
  });

  beforeEach(() => {
    clearBook();
  });

  describe("openBook", () => {
    const sources = [
      "src/tests/testdata/book/yaneuraou.db",
      "src/tests/testdata/book/yaneuraou-crlf.db",
      "src/tests/testdata/book/yaneuraou-bom-crlf.db",
      "src/tests/testdata/book/yaneuraou-no-header.db",
      "src/tests/testdata/book/yaneuraou-bom-no-header.db",
    ];
    const patterns = [
      { options: { onTheFlyThresholdMB: 0.001 }, mode: "in-memory" },
      { options: { onTheFlyThresholdMB: 0.0005 }, mode: "on-the-fly" },
    ];
    for (const pattern of patterns) {
      for (const source of sources) {
        it(`mode=${pattern.mode} source=${source}`, async () => {
          const mode = await openBook(source, pattern.options);
          expect(mode).toBe(pattern.mode);

          const moves = await searchBookMoves(
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
          );
          expect(moves).toHaveLength(5);
          expect(moves[0].usi).toBe("2g2f");
          expect(moves[0].usi2).toBe("3c3d");
          expect(moves[0].score).toBe(63);
          expect(moves[0].depth).toBe(27);
          expect(moves[1].usi).toBe("7g7f");
          expect(moves[1].usi2).toBeUndefined();
          expect(moves[1].score).toBe(20);
          expect(moves[1].depth).toBe(25);
          expect(moves[2].usi).toBe("5g5f");
          expect(moves[3].usi).toBe("2h7h");
          expect(moves[4].usi).toBe("3g3f");
          const moves2 = await searchBookMoves(
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
          );
          expect(moves2).toHaveLength(3);
          const moves3 = await searchBookMoves(
            "r6nl/l3gbks1/2ns1g1p1/ppppppp1p/7P1/PSPPPPP1P/1P1G2N1L/1KGB1S2R/LN7 w - 1",
          );
          expect(moves3).toHaveLength(0);
          const moves4 = await searchBookMoves(
            "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1",
          );
          expect(moves4).toHaveLength(3);

          // comments
          expect(moves[0].comment).toBe(
            // In on-the-fly mode, comment-only lines will be ignored.
            pattern.mode === "in-memory" ? "multi line comment 1\nmulti line comment 2" : "",
          );
          expect(moves[1].comment).toBe("single line comment");
          expect(moves[2].comment).toBe("");
        });
      }
    }
  });

  it("saveBook", async () => {
    const tempFilePath = path.join(tmpdir, "savetest.db");
    updateBookMove("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1", {
      usi: "2g2f",
      usi2: "8c8d",
      score: 42,
      depth: 20,
      count: 123,
      comment: "ibisha\npopular",
    });
    updateBookMove("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1", {
      usi: "7g7f",
      usi2: "3c3d",
      comment: "",
    });
    updateBookMove("lnsgkgsnl/1r5b1/ppppppppp/9/9/2P7/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1", {
      usi: "3c3d",
      usi2: "6g6f",
      score: -31.5, // 小数点以下は四捨五入
      comment: "",
    });
    await saveBook(tempFilePath);
    const output = fs.readFileSync(tempFilePath, "utf-8");
    expect(output).toBe(`#YANEURAOU-DB2016 1.00
sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/2P7/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1
3c3d 6g6f -32 none 
sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1
2g2f 8c8d 42 20 123
#ibisha
#popular
7g7f 3c3d none none 
`);
  });

  it("copy", async () => {
    const copyFilePath = path.join(tmpdir, "copy.db");
    await openBook("src/tests/testdata/book/yaneuraou.db");
    await saveBook(copyFilePath);
    const output = fs.readFileSync(copyFilePath, "utf-8");
    const expected = fs.readFileSync("src/tests/testdata/book/yaneuraou-copy.db", "utf-8");
    expect(output).toBe(expected);
  });

  it("updateBookMoveOrder", async () => {
    await openBook("src/tests/testdata/book/yaneuraou.db");
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

    updateBookMoveOrder(sfen, "2g2f", 2);
    updateBookMoveOrder(sfen, "3g3f", 0);

    const moves = await searchBookMoves(sfen);
    expect(moves).toHaveLength(5);
    expect(moves[0].usi).toBe("3g3f");
    expect(moves[1].usi).toBe("7g7f");
    expect(moves[2].usi).toBe("5g5f");
    expect(moves[3].usi).toBe("2g2f");
    expect(moves[4].usi).toBe("2h7h");
  });

  it("removeBookMove", async () => {
    await openBook("src/tests/testdata/book/yaneuraou.db");
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

    removeBookMove(sfen, "2g2f");
    removeBookMove(sfen, "2h7h");

    const moves = await searchBookMoves(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
    expect(moves).toHaveLength(3);
    expect(moves[0].usi).toBe("7g7f");
    expect(moves[1].usi).toBe("5g5f");
    expect(moves[2].usi).toBe("3g3f");
  });

  describe("importBookMoves", async () => {
    const patterns = [
      {
        title: "directory",
        settings: {
          sourceType: SourceType.DIRECTORY,
          sourceDirectory: "src/tests/testdata/book/source",
        },
        summary: {
          successFileCount: 4,
          errorFileCount: 0,
          entryCount: 34,
          duplicateCount: 2,
        },
        includedSFEN: [
          "ln1gk1snl/1rs3gb1/p1ppppppp/9/1p5P1/P8/1PPPPPP1P/1BG3SR1/LNS1KG1NL w - 1",
          "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P1P4/PP1P1PPPP/1B2R4/LNSGKGSNL w - 1",
        ],
        missedSFEN: ["ln1gk1snl/1rs3gb1/2ppppppp/p8/1p5P1/P8/1PPPPPP1P/1BG3SR1/LNS1KG1NL b - 1"],
      },
      {
        title: "directory with ply",
        settings: {
          sourceType: SourceType.DIRECTORY,
          sourceDirectory: "src/tests/testdata/book/source",
          minPly: 2,
          maxPly: 5,
        },
        summary: {
          successFileCount: 4,
          errorFileCount: 0,
          entryCount: 15,
          duplicateCount: 1,
        },
        includedSFEN: ["lnsgkgsnl/1r5b1/p1ppppppp/9/1p5P1/9/PPPPPPP1P/1B5R1/LNSGKGSNL b - 1"],
        missedSFEN: [
          "lnsgkgsnl/1r5b1/p1ppppppp/9/1p5P1/9/PPPPPPP1P/1BG4R1/LNS1KGSNL w - 1",
          "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P1P4/PP1P1PPPP/1B2R4/LNSGKGSNL w - 1",
        ],
      },
      {
        title: "directory with player name",
        settings: {
          sourceType: SourceType.DIRECTORY,
          sourceDirectory: "src/tests/testdata/book/source",
          playerCriteria: PlayerCriteria.FILTER_BY_NAME,
          playerName: "藤井",
        },
        summary: {
          successFileCount: 4,
          errorFileCount: 0,
          entryCount: 10,
          duplicateCount: 0,
        },
        includedSFEN: ["lnsgkgsnl/1r5b1/p1ppppppp/9/1p5P1/9/PPPPPPP1P/1BG4R1/LNS1KGSNL w - 1"],
        missedSFEN: [
          "lnsgkgsnl/1r5b1/p1ppppppp/9/1p5P1/9/PPPPPPP1P/1B5R1/LNSGKGSNL b - 1",
          "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P1P4/PP1P1PPPP/1B2R4/LNSGKGSNL w - 1",
        ],
      },
      {
        title: "single file",
        settings: {
          sourceType: SourceType.FILE,
          sourceRecordFile: "src/tests/testdata/book/source/src01.ki2",
        },
        summary: {
          successFileCount: 1,
          errorFileCount: 0,
          entryCount: 10,
          duplicateCount: 0,
        },
        includedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/7R1/LNSGKGSNL b - 1"],
        missedSFEN: ["lnsgk1snl/1r4gb1/p1ppppppp/9/1p5P1/9/PPPPPPP1P/1BG4R1/LNS1KGSNL b - 1"],
      },
      {
        title: "single file black",
        settings: {
          sourceType: SourceType.FILE,
          sourceRecordFile: "src/tests/testdata/book/source/src01.ki2",
          playerCriteria: PlayerCriteria.BLACK,
        },
        summary: {
          successFileCount: 1,
          errorFileCount: 0,
          entryCount: 5,
          duplicateCount: 0,
        },
        includedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/7R1/LNSGKGSNL b - 1"],
        missedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/1S5R1/LN1GKGSNL w - 1"],
      },
      {
        title: "single file white",
        settings: {
          sourceType: SourceType.FILE,
          sourceRecordFile: "src/tests/testdata/book/source/src01.ki2",
          playerCriteria: PlayerCriteria.WHITE,
        },
        summary: {
          successFileCount: 1,
          errorFileCount: 0,
          entryCount: 5,
          duplicateCount: 0,
        },
        includedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/1S5R1/LN1GKGSNL w - 1"],
        missedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/7R1/LNSGKGSNL b - 1"],
      },
    ];
    for (const pattern of patterns) {
      it(pattern.title, async () => {
        const summary = await importBookMoves({
          ...defaultBookImportSettings(),
          ...pattern.settings,
        });
        expect(summary).toEqual(pattern.summary);
        for (const sfen of pattern.includedSFEN) {
          expect((await searchBookMoves(sfen)).length).not.toBe(0);
        }
        for (const sfen of pattern.missedSFEN) {
          expect((await searchBookMoves(sfen)).length).toBe(0);
        }
      });
    }
  });
});
