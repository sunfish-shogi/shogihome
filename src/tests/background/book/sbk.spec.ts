import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { InitialPositionSFEN } from "tsshogi";
import {
  loadSbkBook,
  loadSbkBookOnTheFly,
  searchSbkBookEntryOnTheFly,
  storeSbkBook,
} from "@/background/book/sbk.js";
import { mergeBookEntries, SbkBook } from "@/background/book/types.js";
import { SBook } from "@/background/book/proto/sbk.js";
import { getTempPathForTesting } from "@/background/proc/env.js";

async function storeToBuffer(book: SbkBook): Promise<Buffer> {
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  pass.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve) => pass.on("finish", resolve));
  await storeSbkBook(book, pass);
  await finished;
  return Buffer.concat(chunks);
}

describe("background/book/sbk", () => {
  describe("copy via in-memory", () => {
    const testCases = [
      { input: "shogigui01.sbk", expected: "shogigui01-copy.sbk" },
      { input: "shogigui02.sbk", expected: "shogigui02-copy.sbk" },
      { input: "shogigui01-copy.sbk", expected: "shogigui01-copy.sbk" },
      { input: "shogigui02-copy.sbk", expected: "shogigui02-copy.sbk" },
    ];
    for (const { input, expected } of testCases) {
      it(`${input} → ${expected}`, async () => {
        const book = await loadSbkBook(fs.readFileSync(`src/tests/testdata/book/${input}`));

        const pass = new PassThrough();
        const chunks: Buffer[] = [];
        pass.on("data", (chunk: Buffer) => chunks.push(chunk));
        const finished = new Promise<void>((resolve) => pass.on("finish", resolve));

        await storeSbkBook(book, pass);
        await finished;

        const outputHex = Buffer.concat(chunks).toString("hex");
        const expectedHex = fs.readFileSync(`src/tests/testdata/book/${expected}`).toString("hex");
        expect(outputHex).toBe(expectedHex);
      });
    }
  });

  describe("copy via on-the-fly", () => {
    const testCases = [
      { input: "shogigui01.sbk", expected: "shogigui01-copy-otf.sbk" },
      { input: "shogigui02.sbk", expected: "shogigui02-copy-otf.sbk" },
      { input: "shogigui01-copy-otf.sbk", expected: "shogigui01-copy-otf.sbk" },
      { input: "shogigui02-copy-otf.sbk", expected: "shogigui02-copy-otf.sbk" },
    ];
    for (const { input, expected } of testCases) {
      it(`${input} → ${expected}`, async () => {
        const book = await loadSbkBookOnTheFly(`src/tests/testdata/book/${input}`);

        const pass = new PassThrough();
        const chunks: Buffer[] = [];
        pass.on("data", (chunk: Buffer) => chunks.push(chunk));
        const finished = new Promise<void>((resolve) => pass.on("finish", resolve));

        await storeSbkBook(book, pass);
        await finished;

        const outputHex = Buffer.concat(chunks).toString("hex");
        const expectedHex = fs.readFileSync(`src/tests/testdata/book/${expected}`).toString("hex");
        expect(outputHex).toBe(expectedHex);
      });
    }
  });

  describe("remove move via on-the-fly", () => {
    it("keeps the destination of the removed move reachable", async () => {
      const initial = InitialPositionSFEN.STANDARD;
      const after76 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
      const source: SbkBook = {
        format: "sbk",
        entries: new Map([
          [initial, { type: "normal", moves: [{ usi: "7g7f", count: 1 }] }],
          [after76, { type: "normal", moves: [{ usi: "3c3d", count: 1 }], comment: "child" }],
        ]),
      };
      const tempDir = path.join(getTempPathForTesting(), "sbk-remove-move");
      fs.mkdirSync(tempDir, { recursive: true });
      const sourcePath = path.join(tempDir, "source.sbk");
      fs.writeFileSync(sourcePath, await storeToBuffer(source));

      // 遷移先の局面は編集せずに、遷移元の局面から指し手を削除する
      const book = await loadSbkBookOnTheFly(sourcePath);
      const base = await searchSbkBookEntryOnTheFly(initial, book.rawData!, book.sbkIndex!);
      const entry = mergeBookEntries(base, undefined)!;
      entry.moves = [];
      book.entries.set(initial, entry);
      const output = await storeToBuffer(book);

      expect(SBook.decode(output).BookStates.map((state) => state.Position)).toContain(after76);
      const reloaded = await loadSbkBook(output);
      // 指し手を全て削除した局面は情報を持たないため読み込まれない
      expect(reloaded.entries.get(initial)).toBeUndefined();
      expect(reloaded.entries.get(after76)?.comment).toBe("child");
      expect(reloaded.entries.get(after76)?.moves.map((m) => m.usi)).toEqual(["3c3d"]);
    });

    it("does not treat moves missing from a patch as removed", async () => {
      const initial = InitialPositionSFEN.STANDARD;
      const after76 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
      const source: SbkBook = {
        format: "sbk",
        entries: new Map([
          [initial, { type: "normal", moves: [{ usi: "7g7f", count: 1 }] }],
          [after76, { type: "normal", moves: [{ usi: "3c3d", count: 1 }], comment: "child" }],
        ]),
      };
      const tempDir = path.join(getTempPathForTesting(), "sbk-remove-move");
      fs.mkdirSync(tempDir, { recursive: true });
      const sourcePath = path.join(tempDir, "source-patch.sbk");
      fs.writeFileSync(sourcePath, await storeToBuffer(source));

      // 棋譜の取り込みなどで作られるパッチは、元の SBK の指し手を含まない
      const book = await loadSbkBookOnTheFly(sourcePath);
      book.entries.set(initial, { type: "patch", moves: [{ usi: "2g2f", count: 1 }] });
      const output = await storeToBuffer(book);

      // 元の指し手は削除されていないため、編集していない遷移先に Position を書き出さない
      expect(SBook.decode(output).BookStates.map((state) => state.Position)).not.toContain(after76);
      const reloaded = await loadSbkBook(output);
      // 元の指し手は残り、パッチの指し手が追加される
      const moves = reloaded.entries.get(initial)?.moves.map((m) => m.usi);
      expect(moves?.sort()).toEqual(["2g2f", "7g7f"]);
      expect(reloaded.entries.get(after76)?.comment).toBe("child");
      expect(reloaded.entries.get(after76)?.moves.map((m) => m.usi)).toEqual(["3c3d"]);
    });
  });

  describe("edit root state via on-the-fly", () => {
    // 平手以外の局面から始まる定跡と、先頭以外に配置される平手のルート局面を含む定跡
    const handicapRoot = InitialPositionSFEN.HANDICAP_ROOK;
    const standardRoot = InitialPositionSFEN.STANDARD;

    it("keeps Position of root states", async () => {
      const source: SbkBook = {
        format: "sbk",
        entries: new Map([
          [handicapRoot, { type: "normal", moves: [{ usi: "4a3b", count: 1 }] }],
          [standardRoot, { type: "normal", moves: [{ usi: "7g7f", count: 1 }] }],
        ]),
      };
      const tempDir = path.join(getTempPathForTesting(), "sbk-edit-root");
      fs.mkdirSync(tempDir, { recursive: true });
      const sourcePath = path.join(tempDir, "source.sbk");
      fs.writeFileSync(sourcePath, await storeToBuffer(source));

      const book = await loadSbkBookOnTheFly(sourcePath);
      for (const root of [handicapRoot, standardRoot]) {
        // ルート局面を編集する (updateBookPositionComment などと同じく normal 型のエントリーになる)
        const base = await searchSbkBookEntryOnTheFly(root, book.rawData!, book.sbkIndex!);
        const entry = mergeBookEntries(base, undefined)!;
        expect(entry.type).toBe("normal");
        entry.comment = "edited";
        book.entries.set(root, entry);
      }
      const output = await storeToBuffer(book);

      const states = SBook.decode(output).BookStates;
      const positions = states.map((state) => state.Position);
      expect(positions).toContain(handicapRoot);
      expect(positions).toContain(standardRoot);

      const reloaded = await loadSbkBook(output);
      expect(reloaded.entries.get(handicapRoot)?.comment).toBe("edited");
      expect(reloaded.entries.get(handicapRoot)?.moves.map((m) => m.usi)).toEqual(["4a3b"]);
      expect(reloaded.entries.get(standardRoot)?.comment).toBe("edited");
      expect(reloaded.entries.get(standardRoot)?.moves.map((m) => m.usi)).toEqual(["7g7f"]);
    });
  });
});
