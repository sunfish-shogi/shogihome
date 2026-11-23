// [WebAssembly 版] やねうら王形式の定跡を On-the-fly モードで編集して保存した結果を、期待値ファイルと比較して固定する。
// 期待値ファイルは、移行期間中に JavaScript 版 (On-the-fly モード) の出力と一致することを
// yane_wasm_equivalence.spec.ts で確かめた上で作成している。JavaScript 版を削除した後も残す。
//
// 意図して出力を変更した場合は、次のコマンドで期待値ファイルを更新する。
//   UPDATE_GOLDEN=1 npx vitest run src/tests/background/book/yane_wasm_golden.spec.ts

import fs from "node:fs";
import path from "node:path";
import { clearBook, openBook, saveBook } from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/yane-wasm-golden");
const goldenDir = "src/tests/testdata/book/wasm";
const update = !!process.env.UPDATE_GOLDEN;

const yaneGoldenCases = [
  { name: "yaneuraou-edited.db", input: "src/tests/testdata/book/yaneuraou.db" },
  { name: "yaneuraou-crlf-edited.db", input: "src/tests/testdata/book/yaneuraou-crlf.db" },
  {
    name: "yaneuraou-bom-no-header-edited.db",
    input: "src/tests/testdata/book/yaneuraou-bom-no-header.db",
  },
];

describe("background/book YaneuraOu on-the-fly (backend=wasm) golden", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  for (const { name, input } of yaneGoldenCases) {
    it(name, async () => {
      const mode = await openBook(defaultBookSession, input, {
        forceOnTheFly: true,
        backend: "wasm",
      });
      expect(mode).toBe("on-the-fly");
      await editBook(defaultBookSession, tmpdir);
      const outPath = path.join(tmpdir, name);
      await saveBook(defaultBookSession, outPath);
      const actual = fs.readFileSync(outPath);
      const goldenPath = path.join(goldenDir, name);
      if (update) {
        fs.mkdirSync(goldenDir, { recursive: true });
        fs.writeFileSync(goldenPath, actual);
      }
      expect(actual.toString("utf-8")).toBe(fs.readFileSync(goldenPath).toString("utf-8"));
    });
  }
});
