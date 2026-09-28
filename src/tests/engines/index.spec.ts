// @vitest-environment node
//
// デスクトップ版のダウンロード一覧 (src/background/usi/wasm/engine-index.json) を検証する。
// 一覧はアプリに同梱され、リリース後は直せないため、誤りはここで止める。
//
// 一覧が指すファイルはここでは取得しない。大きなファイルのダウンロードを伴い、配信側の障害で
// 無関係な変更のテストまで落ちるため。登録するときに scripts/engine-index.ts add が実際に
// 取得して確かめ、配信中のファイルは scripts/engine-index.ts verify で確かめる。
import fs from "node:fs";
import path from "node:path";
import { parseEngineIndex } from "@/common/wasm-engine/package.js";

const INDEX_PATH = "src/background/usi/wasm/engine-index.json";

function readIndexJSON(): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(INDEX_PATH), "utf8"));
}

describe("engines/index", () => {
  it("一覧の全ての項目が実行時の検証を通ること", () => {
    const index = parseEngineIndex(readIndexJSON());
    expect(index.errors).toEqual([]);
  });

  // 実行時の検証は開発用に localhost の http を認めるが、同梱する一覧には載せない。
  it("全ての URL が https であること", () => {
    const index = parseEngineIndex(readIndexJSON());
    for (const pkg of index.engines) {
      expect(new URL(pkg.packageURL).protocol, pkg.id).toBe("https:");
      for (const file of pkg.files) {
        expect(new URL(file.url).protocol, `${pkg.id}: ${file.path}`).toBe("https:");
      }
    }
  });
});
