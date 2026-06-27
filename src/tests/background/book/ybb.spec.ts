import path from "node:path";
import fs from "node:fs";
import { loadYbbBook, storeYbbBook } from "@/background/book/ybb.js";
import { getTempPathForTesting } from "@/background/proc/env.js";

const ybbPath = path.resolve("src/tests/testdata/book/yaneuraou.ybb");
const tmpdir = path.join(getTempPathForTesting(), "ybb");

describe("background/book/ybb", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  it("round-trips yaneuraou.ybb to identical binary", async () => {
    const ybbBook = await loadYbbBook(ybbPath);
    const tmpPath = path.join(tmpdir, "roundtrip.ybb");
    await storeYbbBook(ybbBook.entries, tmpPath);
    const expected = await fs.promises.readFile(ybbPath);
    const actual = await fs.promises.readFile(tmpPath);
    expect(Buffer.compare(actual, expected)).toBe(0);
  });
});
