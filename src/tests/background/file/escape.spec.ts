import { escapeLinuxDesktopToken, escapePosixArg, escapeWinArg } from "@/background/file/escape";

describe("escape", () => {
  it("posixArg", () => {
    expect(escapePosixArg("foo")).toBe("'foo'");
    expect(escapePosixArg("foo'bar")).toBe("'foo'\\''bar'");
    expect(escapePosixArg("foo\\bar")).toBe("'foo\\bar'");
  });

  it("winArg", () => {
    expect(escapeWinArg("foo")).toBe('"foo"');
    expect(escapeWinArg('foo"bar')).toBe('"foo\\"bar"');
    expect(escapeWinArg("foo\\bar")).toBe('"foo\\bar"');
    expect(escapeWinArg('foo\\"bar')).toBe('"foo\\\\\\"bar"');
    expect(escapeWinArg('foobar\\"')).toBe('"foobar\\\\\\""');
  });

  it("linuxDesktopToken", () => {
    expect(escapeLinuxDesktopToken("foo")).toBe('"foo"');
    expect(escapeLinuxDesktopToken("foo bar")).toBe('"foo bar"');
    expect(escapeLinuxDesktopToken("foo%bar")).toBe('"foo%%bar"');
    expect(escapeLinuxDesktopToken('foo"bar')).toBe('"foo\\"bar"');
    expect(escapeLinuxDesktopToken("foo\\bar")).toBe('"foo\\\\bar"');
  });
});
