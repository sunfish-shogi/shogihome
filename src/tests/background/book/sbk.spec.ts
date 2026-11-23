import fs from "node:fs";
import os from "node:os";
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

describe("background/book/sbk (unreachable state)", () => {
  it("on-the-fly copy keeps a state that has no position and no parent", async () => {
    const base = fs.readFileSync("src/tests/testdata/book/shogigui01-copy-otf.sbk");
    const book0 = await loadSbkBookOnTheFly("src/tests/testdata/book/shogigui01-copy-otf.sbk");
    // Id = rowCount, Games = 1, Comment = "x" で、どこからも参照されない局面を追加する
    const id = book0.sbkIndex!.rowCount;
    expect(id).toBeLessThan(128); // 1 バイトの varint で書けること
    const orphan = Buffer.from([26, 7, 8, id, 32, 1, 66, 1, 0x78]);
    const input = Buffer.concat([base, orphan]);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-sbk-"));
    const tmpPath = path.join(tmpDir, "orphan.sbk");
    try {
      fs.writeFileSync(tmpPath, input);
      const book = await loadSbkBookOnTheFly(tmpPath);

      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on("data", (chunk: Buffer) => chunks.push(chunk));
      const finished = new Promise<void>((resolve) => pass.on("finish", resolve));
      await storeSbkBook(book, pass);
      await finished;

      expect(Buffer.concat(chunks).toString("hex")).toBe(input.toString("hex"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
