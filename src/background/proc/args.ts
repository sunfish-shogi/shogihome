import { isSupportedRecordFilePath } from "@/background/file/extensions.js";
import { HeadlessModeOperation } from "@/background/headless/command.js";
import { ProcessArgs as GUIArgs } from "@/common/ipc/process.js";
import { LayoutProfile } from "@/common/settings/layout.js";
import { loadLayoutProfileListSync } from "@/background/settings.js";

type ProcessArgs = ({ type: "headless" } & HeadlessModeOperation) | ({ type: "gui" } & GUIArgs);

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
  let layoutProfile: LayoutProfile | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (isSupportedRecordFilePath(arg)) {
      path = arg;
    } else if (arg === "-n" && !isNaN(Number(nextArg))) {
      ply = Number(nextArg);
      i++;
    } else if (/^\+\d+$/.test(arg)) {
      ply = Number(arg.substring(1));
    } else if (arg === "--layout-profile" && nextArg) {
      const layoutProfileList = loadLayoutProfileListSync();
      layoutProfile = layoutProfileList.profiles.find((profile) => profile.uri === nextArg);
    } else if (arg === "--add-engine") {
      const usage = "Usage: --add-engine <path> <name> <timeout>";
      if (args.length < i + 4) {
        return new Error(usage);
      }
      const path = args[++i];
      if (!path) {
        return new Error("Empty engine path");
      }
      const name = args[++i];
      if (!name) {
        return new Error("Empty engine name");
      }
      const timeout = Number(args[++i]);
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
