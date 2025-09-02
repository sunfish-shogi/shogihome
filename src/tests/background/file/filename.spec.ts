import path from "node:path";
import fs from "node:fs";
import { resolveConflictFilePath } from "@/background/file/filename";
import { getTempPathForTesting } from "@/background/proc/env";

describe("filename", () => {
  it("should resolve conflict file paths", async () => {
    const tempDir = getTempPathForTesting();
    const filePath = path.join(tempDir, "test.txt");

    for (const expected of [
      path.join(tempDir, "test.txt"),
      path.join(tempDir, "test-2.txt"),
      path.join(tempDir, "test-3.txt"),
      path.join(tempDir, "test-4.txt"),
    ]) {
      expect(await resolveConflictFilePath(filePath)).toBe(expected);
      fs.writeFileSync(expected, "data");
    }
  });
});
