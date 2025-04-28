import path from "node:path";
import { getPortableExeDir } from "@/background/proc/env.js";

export function resolveEnginePath(enginePath: string): string {
  const portableExeDir = getPortableExeDir();
  if (portableExeDir) {
    return path.resolve(portableExeDir, enginePath);
  }
  return enginePath;
}

export function getRelativeEnginePath(enginePath: string): string {
  const portableExeDir = getPortableExeDir();
  if (portableExeDir) {
    const relative = path.relative(portableExeDir, enginePath);
    if (!relative.startsWith("..")) {
      return relative;
    }
  }
  return enginePath;
}
