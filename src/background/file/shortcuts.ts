import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { getAppPath } from "@/background/proc/path-electron.js";
import { shell } from "electron";

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
  const shortcutPath = path.join(dirname, `${name}.lnk`);
  const safeArgs = args.map(escapeShellArg).join(" ");
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
  const scriptPath = path.join(dirname, `${name}.applescript`);
  const safeArgs = args.map(escapeAppleScriptArg).join(" ");
  if (safeArgs.lastIndexOf('"') !== -1) {
    throw new Error("AppleScript does not support double quotes in arguments.");
  }
  const script = `do shell script "${process.execPath} ${safeArgs}"`;
  await fs.promises.writeFile(scriptPath, script, "utf8");
  const compiledPath = path.join(dirname, `${name}.app`);
  await new Promise<void>((resolve, reject) => {
    child_process.exec(
      `osacompile -o ${escapeShellArg(compiledPath)} ${escapeShellArg(scriptPath)}`,
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
  const desktopFilePath = path.join(dirname, `${name}.desktop`);
  const safeArgs = args.map(escapeShellArg).join(" ");
  const content = `[Desktop Entry]
Type=Application
Name=${name}
Exec=${execPath} ${safeArgs}
Terminal=false
`;
  await fs.promises.writeFile(desktopFilePath, content, "utf8");
  await fs.promises.chmod(desktopFilePath, 0o755);
}

function escapeShellArg(arg: string): string {
  return `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeAppleScriptArg(arg: string): string {
  return arg.replace(/\\/g, "\\\\").replace(/ /g, "\\ ");
}
