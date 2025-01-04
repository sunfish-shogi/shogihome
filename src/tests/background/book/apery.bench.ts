import fs from "node:fs";
import path from "node:path";
import { bench } from "vitest";
import { loadAperyBook } from "@/background/book/apery";
import { createTestAperyBookFile } from "@/tests/mock/book";
import { getTempPathForTesting } from "@/background/proc/env";

const tmpdir = path.join(getTempPathForTesting(), "book/apery");

describe("background/book/apery", async () => {
  const book10mPath = path.join(tmpdir, "book10m.bin");
  await fs.promises.mkdir(tmpdir, { recursive: true });
  await createTestAperyBookFile(book10mPath, 10_000_000);

  bench("loadAperyBook", async () => {
    const file = fs.createReadStream(book10mPath);
    try {
      const book = await loadAperyBook(file);
      expect(book.aperyEntries.get(BigInt(0))).not.toBeUndefined();
    } finally {
      file.close();
    }
  });
});
