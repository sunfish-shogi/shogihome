import fs from "node:fs";
import { PassThrough } from "node:stream";
import { loadSbkBook, loadSbkBookOnTheFly, storeSbkBook } from "@/background/book/sbk.js";

describe("background/book/sbk", () => {
  const testCases = [
    { input: "shogigui01.sbk", expected: "shogihome01.sbk" },
    { input: "shogigui02.sbk", expected: "shogihome02.sbk" },
    { input: "shogihome01.sbk", expected: "shogihome01.sbk" },
    { input: "shogihome02.sbk", expected: "shogihome02.sbk" },
  ];
  for (const { input, expected } of testCases) {
    it(`in-memory: ${input} → ${expected}`, async () => {
      const book = loadSbkBook(fs.readFileSync(`src/tests/testdata/book/${input}`));

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

    /*
    it(`on-the-fly: ${input} → ${expected}`, async () => {
      const rawData = await fs.promises.readFile(`src/tests/testdata/book/${input}`);
      const book = loadSbkBookOnTheFly(rawData);

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
    */
  }
});
