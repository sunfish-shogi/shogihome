import path from "node:path";
import fs from "node:fs";
import { getTempPathForTesting, isTest } from "./env.js";
import { app } from "electron";

export function getAppPath(name: "userData" | "logs" | "exe" | "documents" | "pictures"): string {
  if (isTest()) {
    const tempPath = path.join(getTempPathForTesting(), name);
    fs.mkdirSync(tempPath, { recursive: true });
    return tempPath;
  }
  return app.getPath(name);
}
