import url from "node:url";
import { getAppLogger } from "@/background/log.js";

export function fileURLToPath(fileURL: string, defaultPath: string): string {
  if (fileURL) {
    try {
      return url.fileURLToPath(fileURL);
    } catch {
      getAppLogger().warn(`invalid file URL: ${fileURL}`);
    }
  }
  return defaultPath;
}
