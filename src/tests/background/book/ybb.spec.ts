import path from "node:path";
import fs from "node:fs";
import { loadYbbBook, storeYbbBook } from "@/background/book/ybb.js";

const testdataDir = path.resolve("src/tests/testdata/book");
const ybbPath = path.join(testdataDir, "yaneuraou.ybb");

describe("background/book/ybb", () => {
  it("round-trips yaneuraou.ybb to identical binary", async () => {
    const ybbBook = await loadYbbBook(ybbPath);

    const tmpPath = path.join(testdataDir, "yaneuraou-roundtrip-test.ybb");
    try {
      await storeYbbBook(ybbBook.entries, tmpPath);
      const expected = await fs.promises.readFile(ybbPath);
      const actual = await fs.promises.readFile(tmpPath);
      expect(Buffer.compare(actual, expected)).toBe(0);
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  });
});
