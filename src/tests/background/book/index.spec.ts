import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  clearBook,
  closeBookSession,
  getBookFormat,
  importBookMoves,
  openBook,
  openBookAsNewSession,
  removeBookMove,
  saveBook,
  searchBookMoves,
  updateBookMove,
  updateBookMoveOrder,
} from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookImportSettings, PlayerCriteria, SourceType } from "@/common/settings/book.js";
import { createTestAperyBookFile } from "@/tests/mock/book.js";
import { defaultBookSession } from "@/common/book";

const tmpdir = path.join(getTempPathForTesting(), "book");

function sha256File(filePath: string) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

describe("background/book", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir);
  });

  beforeEach(() => {
    clearBook(defaultBookSession);
  });

  it("default book format", () => {
    expect(getBookFormat(defaultBookSession)).toBe("yane2016");
  });

  describe("openBook", () => {
    describe("yaneuraou.db", () => {
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
            const mode = await openBook(defaultBookSession, source, pattern.options);
            expect(mode).toBe(pattern.mode);

            const moves = await searchBookMoves(
              defaultBookSession,
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
              defaultBookSession,
              "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
            );
            expect(moves2).toHaveLength(3);
            const moves3 = await searchBookMoves(
              defaultBookSession,
              "r6nl/l3gbks1/2ns1g1p1/ppppppp1p/7P1/PSPPPPP1P/1P1G2N1L/1KGB1S2R/LN7 w - 1",
            );
            expect(moves3).toHaveLength(0);
            const moves4 = await searchBookMoves(
              defaultBookSession,
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

      it("invalid", async () => {
        await expect(
          openBook(defaultBookSession, "src/tests/testdata/book/yaneuraou-invalid-header.db", {
            onTheFlyThresholdMB: 1,
          }),
        ).rejects.toThrow("Unsupported book header: #YANEURAOU-DB2016 2.00");
      });
    });

    describe("apery.bin", () => {
      const patterns = [
        { options: { onTheFlyThresholdMB: 0.001 }, mode: "in-memory" },
        { options: { onTheFlyThresholdMB: 0.00005 }, mode: "on-the-fly" },
      ];
      for (const pattern of patterns) {
        it(`mode=${pattern.mode}`, async () => {
          const mode = await openBook(
            defaultBookSession,
            "src/tests/testdata/book/apery.bin",
            pattern.options,
          );
          expect(mode).toBe(pattern.mode);

          const moves = await searchBookMoves(
            defaultBookSession,
            "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 4",
          );
          expect(moves).toHaveLength(3);
          expect(moves[0].usi).toBe("4c4d");
          expect(moves[0].score).toBe(-30);
          expect(moves[0].count).toBe(69);
          expect(moves[1].usi).toBe("3d3e");
          expect(moves[1].score).toBe(-50);
          expect(moves[1].count).toBe(23);
          expect(moves[2].usi).toBe("2c2d");
          expect(moves[2].score).toBe(-100);
          expect(moves[2].count).toBe(8);

          const singleMoveCases = [
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2",
            "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL b - 3",
            "lnsgkgsnl/1r5b1/pppppp2p/6pp1/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL b - 5",
            "lnsgkgsnl/1r5b1/pppppp2p/6pp1/9/2P4P1/PP1PPPP1P/1B1K3R1/LNSG1GSNL w - 6",
            "lnsgkgsnl/1r5b1/pppp1p2p/4p1pp1/9/2P4P1/PP1PPPP1P/1B1K3R1/LNSG1GSNL b - 7",
            "lnsgkgsnl/1r5b1/pppp1p2p/4p1pp1/7P1/2P6/PP1PPPP1P/1B1K3R1/LNSG1GSNL w - 8",
            "lnsgkgsnl/1r5b1/pppp1p2p/4p1p2/7p1/2P6/PP1PPPP1P/1B1K3R1/LNSG1GSNL b p 9",
            "lnsgkgsnl/1r5b1/pppp1p2p/4p1p2/7R1/2P6/PP1PPPP1P/1B1K5/LNSG1GSNL w Pp 10",
            "lnsgkgsnl/1r7/pppp1p2p/4p1p2/7R1/2P6/PP1PPPP1P/1+b1K5/LNSG1GSNL b Pbp 11",
            "lnsgkgsnl/1r7/pppp1p2p/4p1p2/7R1/2P6/PP1PPPP1P/1S1K5/LN1G1GSNL w BPbp 12",
            "lnsgkgsnl/7r1/pppp1p2p/4p1p2/7R1/2P6/PP1PPPP1P/1S1K5/LN1G1GSNL b BPbp 13",
            "lnsgkgsnl/7r1/pppp1p1Pp/4p1p2/7R1/2P6/PP1PPPP1P/1S1K5/LN1G1GSNL w Bbp 14",
            "lnsgkgsnl/4r4/pppp1p1Pp/4p1p2/7R1/2P6/PP1PPPP1P/1S1K5/LN1G1GSNL b Bbp 15",
            "lnsgkgsnl/4r4/pppp1p1Pp/4p1p2/7R1/2P6/PP1PPPP1P/1SK6/LN1G1GSNL w Bbp 16",
            "lnsgkgsnl/4r4/pppp1p1Pp/4p1p1b/7R1/2P6/PP1PPPP1P/1SK6/LN1G1GSNL b Bp 17",
            "lnsgkgsnl/4r4/pppp1p1Pp/4p1p1b/5R3/2P6/PP1PPPP1P/1SK6/LN1G1GSNL w Bp 18",
          ];
          for (const sfen of singleMoveCases) {
            const moves = await searchBookMoves(defaultBookSession, sfen);
            expect(moves).toHaveLength(1);
          }

          const notFoundCases = [
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
            "lnsgk1snl/4r1g2/pppp1p1Pp/4p1p1b/5R3/2P6/PP1PPPP1P/1SK6/LN1G1GSNL b Bp 19",
          ];
          for (const sfen of notFoundCases) {
            const moves = await searchBookMoves(defaultBookSession, sfen);
            expect(moves).toHaveLength(0);
          }
        });
      }
    });

    it("newSession", async () => {
      const usedSessions = new Set<number>();
      for (let i = 0; i < 3; i++) {
        const { session } = await openBookAsNewSession("src/tests/testdata/book/yaneuraou.db");
        expect(session).not.toBe(defaultBookSession);
        expect(usedSessions.has(session)).toBe(false);
        usedSessions.add(session);
        const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
        await expect(searchBookMoves(session, sfen)).resolves.toHaveLength(5);
        closeBookSession(session);
        await expect(searchBookMoves(session, sfen)).rejects.toBeInstanceOf(Error);
      }
    });
  });

  it("saveBook", async () => {
    const tempFilePath = path.join(tmpdir, "savetest.db");
    await updateBookMove(
      defaultBookSession,
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      {
        usi: "2g2f",
        usi2: "8c8d",
        score: 42,
        depth: 20,
        count: 123,
        comment: "ibisha\npopular",
      },
    );
    await updateBookMove(
      defaultBookSession,
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      {
        usi: "7g7f",
        usi2: "3c3d",
        comment: "",
      },
    );
    await updateBookMove(
      defaultBookSession,
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P7/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
      {
        usi: "3c3d",
        usi2: "6g6f",
        score: -31.5, // 小数点以下は四捨五入
        comment: "",
      },
    );
    await saveBook(defaultBookSession, tempFilePath);
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

  describe("updateBookMove", () => {
    it("yaneuraou", async () => {
      const sfen = "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL b - 5";
      await updateBookMove(defaultBookSession, sfen, {
        usi: "2f2e",
        usi2: "8d8e",
        score: 42,
        depth: 20,
        count: 123,
        comment: "yokofu",
      });
      await updateBookMove(defaultBookSession, sfen, {
        usi: "6i7h",
        usi2: "4a3b",
        score: -30,
        depth: 19,
        count: 21,
        comment: "",
      });
      const moves = await searchBookMoves(defaultBookSession, sfen);
      expect(moves).toHaveLength(2);
      expect(moves[0]).toEqual({
        usi: "2f2e",
        usi2: "8d8e",
        score: 42,
        depth: 20,
        count: 123,
        comment: "yokofu",
      });
      expect(moves[1]).toEqual({
        usi: "6i7h",
        usi2: "4a3b",
        score: -30,
        depth: 19,
        count: 21,
        comment: "",
      });
    });

    it("apery", async () => {
      await openBook(defaultBookSession, "src/tests/testdata/book/apery.bin");
      const sfen = "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL b - 5";
      await updateBookMove(defaultBookSession, sfen, {
        usi: "2f2e",
        score: 42,
        depth: 20,
        count: 123,
        comment: "",
      });
      await updateBookMove(defaultBookSession, sfen, {
        usi: "6i7h",
        score: -30,
        count: 21,
        comment: "",
      });
      const moves = await searchBookMoves(defaultBookSession, sfen);
      expect(moves).toHaveLength(2);
      expect(moves[0]).toEqual({
        usi: "2f2e",
        score: 42,
        count: 123,
        comment: "",
      });
      expect(moves[1]).toEqual({
        usi: "6i7h",
        score: -30,
        count: 21,
        comment: "",
      });
    });
  });

  describe("copy", () => {
    it("yaneuraou", async () => {
      const copyFilePath = path.join(tmpdir, "copy.db");
      await openBook(defaultBookSession, "src/tests/testdata/book/yaneuraou.db");
      await saveBook(defaultBookSession, copyFilePath);
      const output = fs.readFileSync(copyFilePath, "utf-8");
      const expected = fs.readFileSync("src/tests/testdata/book/yaneuraou-copy.db", "utf-8");
      expect(output).toBe(expected);
    });

    it("apery", async () => {
      const copyFilePath = path.join(tmpdir, "copy.bin");
      await openBook(defaultBookSession, "src/tests/testdata/book/apery.bin");
      await saveBook(defaultBookSession, copyFilePath);
      const output = fs.readFileSync(copyFilePath, "hex");
      const expected = fs.readFileSync("src/tests/testdata/book/apery.bin", "hex");
      expect(output).toBe(expected);
    });

    it("apery large", async () => {
      // チャンクの境界処理をテストするために大きなファイルを作成
      const sourcePath = path.join(tmpdir, "source.bin");
      await createTestAperyBookFile(sourcePath, 1_000_000); // 1MB
      await openBook(defaultBookSession, sourcePath);
      const copyFilePath = path.join(tmpdir, "copy-large.bin");
      await saveBook(defaultBookSession, copyFilePath);
      const output = await sha256File(copyFilePath);
      const expected = await sha256File(sourcePath);
      expect(output).toBe(expected);
    });
  });

  it("updateBookMoveOrder", async () => {
    await openBook(defaultBookSession, "src/tests/testdata/book/yaneuraou.db");
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

    await updateBookMoveOrder(defaultBookSession, sfen, "2g2f", 2);
    await updateBookMoveOrder(defaultBookSession, sfen, "3g3f", 0);

    const moves = await searchBookMoves(defaultBookSession, sfen);
    expect(moves).toHaveLength(5);
    expect(moves[0].usi).toBe("3g3f");
    expect(moves[1].usi).toBe("7g7f");
    expect(moves[2].usi).toBe("5g5f");
    expect(moves[3].usi).toBe("2g2f");
    expect(moves[4].usi).toBe("2h7h");
  });

  it("removeBookMove", async () => {
    await openBook(defaultBookSession, "src/tests/testdata/book/yaneuraou.db");
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

    await removeBookMove(defaultBookSession, sfen, "2g2f");
    await removeBookMove(defaultBookSession, sfen, "2h7h");

    const moves = await searchBookMoves(
      defaultBookSession,
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
          successFileCount: 5,
          errorFileCount: 0,
          skippedFileCount: 0,
          entryCount: 43,
          duplicateCount: 4,
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
          successFileCount: 5,
          errorFileCount: 0,
          skippedFileCount: 0,
          entryCount: 23,
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
          skippedFileCount: 1, // .sfen file is skipped
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
          skippedFileCount: 0,
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
          skippedFileCount: 0,
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
          skippedFileCount: 0,
          entryCount: 5,
          duplicateCount: 0,
        },
        includedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/1S5R1/LN1GKGSNL w - 1"],
        missedSFEN: ["lnsgkgsnl/1r5b1/p1pppp1pp/6p2/1p7/2P4P1/PPBPPPP1P/7R1/LNSGKGSNL b - 1"],
      },
    ];
    for (const pattern of patterns) {
      it(pattern.title, async () => {
        const summary = await importBookMoves(defaultBookSession, {
          ...defaultBookImportSettings(),
          ...pattern.settings,
        });
        expect(summary).toEqual(pattern.summary);
        for (const sfen of pattern.includedSFEN) {
          expect((await searchBookMoves(defaultBookSession, sfen)).length).not.toBe(0);
        }
        for (const sfen of pattern.missedSFEN) {
          expect((await searchBookMoves(defaultBookSession, sfen)).length).toBe(0);
        }
      });
    }
  });

  describe("merge", () => {
    it("yaneuraou", async () => {
      const mode = await openBook(defaultBookSession, "src/tests/testdata/book/yaneuraou.db", {
        onTheFlyThresholdMB: 0.0001,
      });
      expect(mode).toBe("on-the-fly");

      // 先頭へ追加
      await updateBookMove(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL b - 1",
        {
          usi: "2f2e",
          score: 20,
          depth: 19,
          count: 89,
          comment: "patch-1",
        },
      );
      // 途中へ追加
      await updateBookMove(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2PP5/PP2PPPPP/1B5R1/LNSGKGSNL w - 1",
        {
          usi: "8b3b",
          score: 10,
          depth: 23,
          count: 8,
          comment: "patch-2",
        },
      );
      // 末尾へ追加
      await updateBookMove(
        defaultBookSession,
        "lnsgkgsnl/6rb1/pppppp1pp/6p2/9/2PP5/PP2PPPPP/1BS4R1/LN1GKGSNL w - 1",
        {
          usi: "3d3f",
          score: 15,
          depth: 21,
          count: 7,
          comment: "patch-3",
        },
      );
      // 既存の指し手を更新
      await updateBookMove(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/3P5/PPP1PPPPP/1BS4R1/LN1GKGSNL w - 1",
        {
          usi: "8b3b",
          count: 2,
          comment: "patch-4",
        },
      );
      // 既存の指し手の順序を更新
      await updateBookMoveOrder(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/3P5/PPP1PPPPP/1BS4R1/LN1GKGSNL w - 1",
        "3a4b",
        1,
      );
      // 指し手を削除
      await removeBookMove(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
        "3c3d",
      );

      const mergeFilePath = path.join(tmpdir, "mverge.db");
      await saveBook(defaultBookSession, mergeFilePath);
      const output = fs.readFileSync(mergeFilePath, "utf-8");
      const expected = fs.readFileSync("src/tests/testdata/book/yaneuraou-merge.db", "utf-8");
      expect(output).toBe(expected);

      // 2回目の書き込みを検査する
      const mergeFilePath2 = path.join(tmpdir, "mverge2.db");
      await saveBook(defaultBookSession, mergeFilePath2);
      const output2 = fs.readFileSync(mergeFilePath2, "utf-8");
      expect(output2).toBe(expected);
    });

    it("apery", async () => {
      const mode = await openBook(defaultBookSession, "src/tests/testdata/book/apery.bin", {
        onTheFlyThresholdMB: 0.0001,
      });
      expect(mode).toBe("on-the-fly");

      // 指し手を追加
      await updateBookMove(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/pppppp1pp/9/6pP1/2P6/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1",
        {
          usi: "8b3b",
          score: -10,
          count: 7,
          comment: "",
        },
      );
      // 末尾に指し手を追加
      await updateBookMove(
        defaultBookSession,
        "+B2g3nl/l1s2kgs1/p1nppp2p/2p3p2/2r6/P8/1PPPPPP1P/2GK2SR1/LNS2G1NL w b3p 1",
        { usi: "B*8c", score: 0, count: 1, comment: "" },
      );
      // 既存の指し手を更新
      await updateBookMove(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1",
        { usi: "2c2d", score: -120, count: 10, comment: "" },
      );
      // 既存の指し手の順序を更新
      await updateBookMoveOrder(
        defaultBookSession,
        "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1",
        "3d3e",
        0,
      );
      // 指し手を削除
      await removeBookMove(
        defaultBookSession,
        "lnsgkgsnl/4r4/pppp1p1Pp/4p1p1b/5R3/2P6/PP1PPPP1P/1SK6/LN1G1GSNL w Bp 1",
        "4a3b",
      );

      const mergeFilePath = path.join(tmpdir, "merge.bin");
      await saveBook(defaultBookSession, mergeFilePath);
      const output = fs.readFileSync(mergeFilePath, "hex");
      const expected = fs.readFileSync("src/tests/testdata/book/apery-merge.bin", "hex");
      expect(output).toBe(expected);

      // 2回目の書き込みを検査する
      const mergeFilePath2 = path.join(tmpdir, "merge2.bin");
      await saveBook(defaultBookSession, mergeFilePath2);
      const output2 = fs.readFileSync(mergeFilePath2, "hex");
      expect(output2).toBe(expected);
    });

    it("forbidOverwrite", async () => {
      const path = "src/tests/testdata/book/yaneuraou.db";
      const mode = await openBook(defaultBookSession, path, { onTheFlyThresholdMB: 0.0001 });
      expect(mode).toBe("on-the-fly");
      await expect(saveBook(defaultBookSession, path)).rejects.toThrowError(
        "On-the-fly モードで読み込み中の定跡は上書き保存できません。 別のファイル名を指定してください。",
      );
    });
  });
});
