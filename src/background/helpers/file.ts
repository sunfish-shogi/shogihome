import { promises as fs } from "node:fs";
import path from "node:path";

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 指定したディレクトリ以下のファイル名を再帰的に列挙する。
 * @param dir 検索を開始するディレクトリのパス。
 * @param maxDepth 再帰する深さ。0の場合は直下のファイルのみを返す。
 */
export async function listFiles(dir: string, maxDepth: number): Promise<string[]> {
  const files: string[] = [];
  const fdir = await fs.readdir(dir);
  for (const file of fdir) {
    const fullPath = path.join(dir, file);
    // NOTE:
    //   lstatSync (statSync ではなく) を使わないとシンボリックリンクも対象になっていしまい危険。
    //   Windows のショートカットは ".lnk" が付いたファイルとして扱われる。
    const stat = await fs.lstat(fullPath);
    if (stat.isFile()) {
      files.push(fullPath);
    } else if (maxDepth > 0 && stat.isDirectory()) {
      files.push(...(await listFiles(fullPath, maxDepth - 1)));
    }
  }
  return files;
}

const SHELLSCRIPT_EXTENSIONS = [
  ".bat", // Windows Batch File (DOS)
  ".cmd", // Windows Batch File (NT)
  ".ps1", // PowerShell
  ".sh", // Shell Script
];
const EXECUTABLE_EXTENSIONS = [".exe"];

export async function isShellScript(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (EXECUTABLE_EXTENSIONS.includes(ext)) {
    return false;
  }
  if (SHELLSCRIPT_EXTENSIONS.includes(ext)) {
    return true;
  }
  try {
    const shebangBuffer = Buffer.alloc(64);
    const fd = await fs.open(filePath, "r");
    try {
      await fd.read(shebangBuffer, 0, shebangBuffer.length, 0);
      // shebang check
      // # = 0x23
      // ! = 0x21
      const shebang = shebangBuffer[0] === 0x23 && shebangBuffer[1] === 0x21;
      if (!shebang) {
        return false;
      }
      // check interpreter
      const interpreter = shebangBuffer.toString("utf-8").split(/\r?\n/)[0];
      if (interpreter.endsWith("sh")) {
        return true;
      }
    } finally {
      await fd.close();
    }
  } catch {
    // ignore
  }
  return false;
}
