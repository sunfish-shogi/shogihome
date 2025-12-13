export function removeLastSlash(path: string): string {
  if (path === "/" || path === "\\") {
    return path;
  }
  if (/^[A-Za-z]:[\\/]{1}$/.test(path)) {
    return path;
  }
  if (path.endsWith("\\") || path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}
