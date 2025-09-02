import path from "node:path";
import { exists } from "@/background/helpers/file.js";

export async function resolveConflictFilePath(filePath: string): Promise<string> {
  const parsed = path.parse(filePath);
  let suffix = 2;
  while (await exists(filePath)) {
    filePath = path.join(parsed.dir, parsed.name + "-" + suffix + parsed.ext);
    suffix++;
  }
  return filePath;
}
