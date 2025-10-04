export function fileURLToCustomSchemeURL(url: string): string {
  const fileURLPrefix = "file:///";
  if (url.startsWith(fileURLPrefix)) {
    return "user-file://localhost/" + url.substring(fileURLPrefix.length);
  }
  return url;
}
