import path from "node:path";
import { getPortableExeDir } from "@/background/proc/env.js";
import { openPath } from "@/background/helpers/electron.js";
import { getAppPath } from "@/background/proc/path-electron.js";

const userDataRoot = getPortableExeDir() || getAppPath("userData");
export const imageCacheDir = path.join(userDataRoot, "image_cache");

export function openCacheDirectory(): Promise<void> {
  return openPath(imageCacheDir);
}
