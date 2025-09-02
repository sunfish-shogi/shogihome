import path from "node:path";
import { exists } from "@/background/helpers/file.js";

export async function resolveConflictFilePath(filePath: string): Promise<string> {
  const parsed = path.parse(filePath);
  let suffix = 2;
  while (await exists(filePath)) {
    if (suffix > 1000) {
      throw new Error("Too many files with the same name");
    }
    filePath = path.join(parsed.dir, parsed.name + "-" + suffix + parsed.ext);
    suffix++;
  }
  return filePath;
}
