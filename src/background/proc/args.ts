import { InitialRecordFileRequest } from "@/common/file/record.js";
import { getAppLogger } from "@/background/log.js";
import { isSupportedRecordFilePath } from "@/background/file/extensions.js";
import { Headless } from "@/background/headless/command.js";

let initialFilePath = "";

export function setInitialFilePath(path: string): void {
  initialFilePath = path;
}

export function fetchInitialRecordFileRequest(): InitialRecordFileRequest {
  // macOS
  if (isSupportedRecordFilePath(initialFilePath)) {
    getAppLogger().debug(`record path from open-file event: ${initialFilePath}`);
    return { path: initialFilePath };
  }

  let path = null;
  let ply = undefined;
  // Option:
  //   ShogiGUI/KifuExplorer style:
  //     -n <ply>
  //   KifuBase style:
  //     +<ply>
  for (const arg of process.argv) {
    if (isSupportedRecordFilePath(arg)) {
      path = arg;
    } else if (!isNaN(Number(arg))) {
      ply = Number(arg);
    } else if (/^\+\d+$/.test(arg)) {
      ply = Number(arg.substring(1));
    }
  }
  return path ? { path, ply } : null;
}

export function parseHeadlessArgs(): Headless | null | Error {
  for (let i = 0; i < process.argv.length; i++) {
    switch (process.argv[i]) {
      // Add a USI engine
      // --add-engine <path> <name> <timeout>
      case "--add-engine": {
        const usage = "Usage: --add-engine <path> <name> <timeout>";
        if (i + 3 >= process.argv.length) {
          return new Error(usage);
        }
        const path = process.argv[++i];
        if (!path) {
          return new Error("Empty engine path");
        }
        const name = process.argv[++i];
        if (!name) {
          return new Error("Empty engine name");
        }
        const timeout = Number(process.argv[++i]);
        if (isNaN(timeout) || timeout < 0) {
          return new Error("Invalid timeout value");
        }
        return {
          operation: "addEngine",
          path,
          name,
          timeout,
        };
      }
    }
  }
  return null;
}
