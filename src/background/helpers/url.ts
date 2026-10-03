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

/**
 * 外部ブラウザで開いてよい URL (http:// または https://) かどうかを判定する。
 */
export function isWebURL(target: string): boolean {
  try {
    const parsed = new URL(target);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 外部ブラウザで開いてよい URL でなければ例外を投げる。
 */
export function validateWebURL(target: string): void {
  if (!isWebURL(target)) {
    throw new Error("Invalid URL: External links must start with http:// or https://");
  }
}
