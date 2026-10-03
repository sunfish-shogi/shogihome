import { isWebURL, validateWebURL } from "@/background/helpers/url.js";

describe("helpers/url", () => {
  it("isWebURL", () => {
    expect(isWebURL("https://github.com/sunfish-shogi/shogihome/releases/tag/v1.0.0")).toBe(true);
    expect(isWebURL("http://localhost:6173/")).toBe(true);
    expect(isWebURL("HTTPS://example.com/")).toBe(true);
    expect(isWebURL("file:///etc/passwd")).toBe(false);
    expect(isWebURL("smb://example.com/share")).toBe(false);
    expect(isWebURL("javascript:alert(1)")).toBe(false);
    expect(isWebURL("ms-settings:")).toBe(false);
    expect(isWebURL("C:\\Windows\\System32\\calc.exe")).toBe(false);
    expect(isWebURL("/usr/bin/xcalc")).toBe(false);
    expect(isWebURL("")).toBe(false);
  });

  it("validateWebURL", () => {
    expect(() => validateWebURL("https://example.com/")).not.toThrow();
    expect(() => validateWebURL("file:///etc/passwd")).toThrow("Invalid URL");
  });
});
