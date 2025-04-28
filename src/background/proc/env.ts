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

export function getAppPath(name: "userData" | "logs" | "exe" | "documents" | "pictures"): string {
  // test
  if (isTest()) {
    const tempPath = path.join(getTempPathForTesting(), name);
    fs.mkdirSync(tempPath, { recursive: true });
    return tempPath;
  }

  // electron app
  const app = getElectron()?.app;
  if (app) {
    return app.getPath(name);
  }

  // command line tool
  switch (name) {
    case "logs":
      return path.join(process.cwd(), "logs");
    case "exe":
      return process.argv[1];
    default:
      return process.cwd();
  }
}

export function getPreloadPath() {
  return isProduction() ? "./preload.js" : "../../../packed/preload.js";
}

export const electronLicensePath = path.join(
  path.dirname(getAppPath("exe")),
  "LICENSE.electron.txt",
);
export const chromiumLicensePath = path.join(
  path.dirname(getAppPath("exe")),
  "LICENSES.chromium.html",
);
