export function escapePosixArg(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function escapeWinArg(arg: string): string {
  if (arg.length === 0) {
    return '""';
  }
  let result = '"';
  let bs = 0;
  for (const c of arg) {
    if (c === "\\") {
      bs++;
    } else if (c === '"') {
      result += "\\".repeat(bs * 2 + 1) + '"';
      bs = 0;
    } else {
      result += "\\".repeat(bs) + c;
      bs = 0;
    }
  }
  result += "\\".repeat(bs * 2) + '"';
  return result;
}

export function escapeLinuxDesktopToken(s: string): string {
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "%%")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/[\r\n\t]/g, " ")}"`;
}
