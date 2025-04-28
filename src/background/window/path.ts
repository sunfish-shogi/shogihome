import path from "node:path";
import { isProduction } from "@/background/proc/env.js";

export function getPreloadPath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist/packed/preload.js")
    : path.join(import.meta.dirname, "../../../packed/preload.js");
}

export function getPreviewHTMLPath(name: string): string {
  return path.join(import.meta.dirname, "../../../" + name + ".html");
}

export function getProductionHTMLPath(name: string): string {
  return path.join(process.resourcesPath, "app.asar/dist", name + ".html");
}
