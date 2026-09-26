// @vitest-environment node
//
// デスクトップ版のダウンロード一覧 (docs/engine-index.json) を検証する。
// 一覧は main に push した時点で GitHub Pages から公開されるため、誤りはここで止める。
// npm run release も一覧を更新した直後にこのテストを実行する (specs/wasm-engine-desktop.md)。
//
// 外部で配信されているエンジンのファイルはここでは取得しない。大きなファイルのダウンロードを
// 伴い、配信側の障害で無関係な変更のテストまで落ちるため。それらは登録するときに
// scripts/engine-index.ts add が実際に取得して確かめる。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENGINE_INDEX_FILE_NAME, parseEngineIndex } from "@/common/wasm-engine/package.js";
import { MANIFEST_FILE_NAME } from "@/common/wasm-engine/manifest.js";

const INDEX_URL = `https://sunfish-shogi.github.io/shogihome/${ENGINE_INDEX_FILE_NAME}`;
const WEBAPP_ENGINES_URL = "https://sunfish-shogi.github.io/shogihome/webapp/engines/";
const WEBAPP_ENGINES_DIR = path.resolve("docs/webapp/engines");

function readIndexJSON(): unknown {
  return JSON.parse(fs.readFileSync(path.resolve("docs", ENGINE_INDEX_FILE_NAME), "utf8"));
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.split("/").some((segment) => segment.startsWith(".")))
    .sort();
}

describe("engines/index", () => {
  it("一覧の全ての項目が実行時の検証を通ること", () => {
    const index = parseEngineIndex(readIndexJSON(), INDEX_URL);
    expect(index.errors).toEqual([]);
    expect(index.engines.length).toBeGreaterThan(0);
  });

  it("本家のエンジンの項目が配信物 (docs/webapp/engines/) と一致すること", () => {
    const index = parseEngineIndex(readIndexJSON(), INDEX_URL);
    const builtins = index.engines.filter((e) => e.packageURL.startsWith(WEBAPP_ENGINES_URL));
    expect(builtins.length).toBeGreaterThan(0);
    for (const pkg of builtins) {
      const dir = path.join(
        WEBAPP_ENGINES_DIR,
        decodeURIComponent(pkg.packageURL.substring(WEBAPP_ENGINES_URL.length)),
      );
      // 一覧に載ったファイルと配信物のファイルが過不足なく一致すること。
      expect(pkg.files.map((f) => f.path).sort(), pkg.id).toEqual(listFiles(dir));
      for (const file of pkg.files) {
        const data = fs.readFileSync(path.join(dir, file.path));
        expect(file.size, file.path).toBe(data.byteLength);
        expect(file.sha256, file.path).toBe(crypto.createHash("sha256").update(data).digest("hex"));
      }
    }
  });

  it("配信物に置かれた本家のエンジンが一覧に載っていること", () => {
    const index = parseEngineIndex(readIndexJSON(), INDEX_URL);
    const listed = new Set(index.engines.map((e) => e.packageURL));
    for (const dir of fs.readdirSync(WEBAPP_ENGINES_DIR)) {
      const manifestPath = path.join(WEBAPP_ENGINES_DIR, dir, MANIFEST_FILE_NAME);
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      // wasm などが外部にあるエンジンは scripts/engine-index.ts add で登録するため対象外。
      if (JSON.parse(fs.readFileSync(manifestPath, "utf8")).assetBaseURL) {
        continue;
      }
      expect(listed.has(`${WEBAPP_ENGINES_URL}${dir}/`), dir).toBeTruthy();
    }
  });
});
