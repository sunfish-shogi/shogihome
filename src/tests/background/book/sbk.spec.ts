import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { loadSbkBook, loadSbkBookOnTheFly, storeSbkBook } from "@/background/book/sbk.js";

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
