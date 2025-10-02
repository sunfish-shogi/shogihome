import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function isDevelopment(): boolean {
  return process.env.npm_lifecycle_event === "electron:serve" && !isTest();
}

export function isPreview(): boolean {
  return process.env.npm_lifecycle_event === "electron:preview";
}

export function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

export function isProduction(): boolean {
  return !isDevelopment() && !isPreview() && !isTest();
}

export function isPortable(): boolean {
  return process.env.PORTABLE_EXECUTABLE_DIR !== undefined;
}

export function getPortableExeDir(): string | undefined {
  return process.env.PORTABLE_EXECUTABLE_DIR;
}

let tempPathForTesting: string;

export function getTempPathForTesting(): string {
  if (!tempPathForTesting) {
    tempPathForTesting = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-test-"));
  }
  return tempPathForTesting;
}

export function getPreloadPath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist/packed/preload.js")
    : path.join(import.meta.dirname, "../../../packed/preload.js");
}

export function getBundlePath(): string {
  return isProduction()
    ? path.join(process.resourcesPath, "app.asar/dist")
    : path.join(import.meta.dirname, "../../..");
}
