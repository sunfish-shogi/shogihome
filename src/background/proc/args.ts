import { isSupportedRecordFilePath } from "@/background/file/extensions.js";
import { Headless } from "@/background/headless/command.js";

type ProcessArgs =
  | ({ type: "headless" } & Headless)
  | { type: "gui"; path?: string; ply?: number; layoutProfile?: string };

export function parseProcessArgs(args: string[]): ProcessArgs | Error {
  // GUI mode option:
  //   /path/to/record.<extension>
  //       path to record file
  //
  //   -n <ply>
  //       ShogiGUI/KifuExplorer style ply
  //
  //   +<ply>
  //     KifuBase style ply
  //
  //   --layout-profile <profile>
  //     layout profile
  //
  // Headless mode option:
  //   --add-engine <path> <name> <timeout>
  //     add USI engine
  //
  let path;
  let ply;
  let layoutProfile;
  for (let i = 0; i < args.length; i++) {
    const arg = process.argv[i];
    const nextArg = process.argv[i + 1];
    if (isSupportedRecordFilePath(arg)) {
      path = arg;
    } else if (arg === "-n" && !isNaN(Number(nextArg))) {
      ply = Number(nextArg);
      i++;
    } else if (/^\+\d+$/.test(arg)) {
      ply = Number(arg.substring(1));
    } else if (arg === "--layout-profile" && nextArg) {
      layoutProfile = nextArg;
    } else if (arg === "--add-engine" && nextArg) {
      const usage = "Usage: --add-engine <path> <name> <timeout>";
      if (process.argv.length < i + 4) {
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
        type: "headless",
        operation: "addEngine",
        path,
        name,
        timeout,
      };
    }
  }
  return {
    type: "gui",
    path,
    ply,
    layoutProfile,
  };
}
