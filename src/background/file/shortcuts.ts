import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { getAppPath } from "@/background/proc/path-electron.js";
import { shell } from "electron";
import { escapePosixArg, escapeWinArg, escapeLinuxDesktopToken } from "./escape.js";
import { resolveConflictFilePath } from "./filename.js";

export async function createDesktopShortcut(name: string, args: string[]) {
  const desktopPath = getAppPath("desktop");

  switch (process.platform) {
    case "win32":
      await createWindowsShortcut(desktopPath, name, args);
      break;
    case "darwin":
      await createAppleScript(desktopPath, name, args);
      break;
    case "linux":
      await createLinuxDesktop(desktopPath, name, args);
      break;
    default:
      throw new Error("Unsupported platform");
  }
}

async function createWindowsShortcut(dirname: string, name: string, args: string[]) {
  const shortcutPath = await resolveConflictFilePath(path.join(dirname, `${name}.lnk`));
  const safeArgs = args.map(escapeWinArg).join(" ");
  const ok = shell.writeShortcutLink(shortcutPath, {
    target: process.execPath,
    args: safeArgs,
    cwd: process.cwd(),
    description: "Start ShogiHome with custom options",
  });
  if (!ok) {
    throw new Error(`Failed to create shortcut: ${shortcutPath}`);
  }
}

async function createAppleScript(dirname: string, name: string, args: string[]) {
  if (args.some((arg) => arg.includes('"'))) {
    throw new Error("AppleScript does not support double quotes in arguments.");
  }
  const scriptPath = await resolveConflictFilePath(path.join(dirname, `${name}.applescript`));
  const execPath = process.execPath;
  const safeArgs = [execPath, ...args]
    .map((arg) => arg.replace(/\\/g, "\\\\").replace(/ /g, "\\ "))
    .join(" ");
  const script = `do shell script "${safeArgs}"`;
  await fs.promises.writeFile(scriptPath, script, "utf8");
  const compiledPath = await resolveConflictFilePath(path.join(dirname, `${name}.app`));
  await new Promise<void>((resolve, reject) => {
    child_process.exec(
      `osacompile -o ${escapePosixArg(compiledPath)} ${escapePosixArg(scriptPath)}`,
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });
  await fs.promises.unlink(scriptPath);
}

async function createLinuxDesktop(dirname: string, name: string, args: string[]) {
  const execPath = process.env.APPIMAGE || process.execPath;
  const desktopFilePath = await resolveConflictFilePath(path.join(dirname, `${name}.desktop`));
  const execTokens = [execPath, ...args].map(escapeLinuxDesktopToken).join(" ");
  const content = `[Desktop Entry]
Type=Application
Name=${name}
Exec=${execTokens}
Terminal=false
`;
  await fs.promises.writeFile(desktopFilePath, content, "utf8");
  await fs.promises.chmod(desktopFilePath, 0o755);
}
