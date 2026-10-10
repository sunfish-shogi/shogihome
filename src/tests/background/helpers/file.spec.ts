// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSameFileSync } from "@/background/helpers/file.js";

describe("helpers/file", () => {
  it("isSameFileSync", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-same-file-"));
    const a = path.join(dir, "a", "engine.json");
    const b = path.join(dir, "b", "engine.json");
    fs.mkdirSync(path.dirname(a));
    fs.mkdirSync(path.dirname(b));
    fs.writeFileSync(a, "{}");
    fs.writeFileSync(b, "{}");
    fs.symlinkSync(path.dirname(a), path.join(dir, "link"));

    expect(isSameFileSync(a, a)).toBeTruthy();
    expect(isSameFileSync(a, path.join(dir, "a", "..", "a", "engine.json"))).toBeTruthy();
    // シンボリックリンクを経由したパス
    expect(isSameFileSync(a, path.join(dir, "link", "engine.json"))).toBeTruthy();
    // 内容が同じでも別のファイル
    expect(isSameFileSync(a, b)).toBeFalsy();
    // 存在しないファイル
    expect(isSameFileSync(a, path.join(dir, "missing.json"))).toBeFalsy();
  });
});
