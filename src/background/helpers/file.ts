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
    const buffer = Buffer.alloc(64);
    const fd = await fs.open(filePath, "r");
    try {
      await fd.read(buffer, 0, buffer.length, 0);
      // shebang check
      // # = 0x23
      // ! = 0x21
      const shebang = buffer[0] === 0x23 && buffer[1] === 0x21;
      if (shebang) {
        // check interpreter
        const interpreter = buffer.toString("utf-8").split(/\r?\n/)[0].split(/\s+/);
        return (
          // e.g. #!/bin/sh, #!/bin/bash
          (interpreter.length >= 1 && interpreter[0].endsWith("sh")) ||
          // e.g. #!/usr/bin/env bash
          (interpreter.length >= 2 &&
            interpreter[0].endsWith("/env") &&
            interpreter[1].endsWith("sh"))
        );
      } else {
        // if including only printable characters, consider as shell script
        for (let i = 0; i < buffer.length; i++) {
          const byte = buffer[i];
          if (byte > 0x00 && (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte > 0x7e)) {
            return false;
          }
        }
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
