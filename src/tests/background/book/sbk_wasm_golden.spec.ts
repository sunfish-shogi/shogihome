// [WebAssembly 版] SBK 形式の定跡を編集して保存した結果を、期待値ファイルと比較して固定する。
// 期待値ファイルは、移行期間中に JavaScript 版 (On-the-fly モード) の出力と一致することを
// sbk_wasm_equivalence.spec.ts で確かめた上で作成している。JavaScript 版を削除した後も残す。
//
// 意図して出力を変更した場合は、次のコマンドで期待値ファイルを更新する。
//   UPDATE_GOLDEN=1 npx vitest run src/tests/background/book/sbk_wasm_golden.spec.ts

import fs from "node:fs";
import path from "node:path";
import { clearBook, openBook, saveBook } from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/sbk-wasm-golden");
const goldenDir = "src/tests/testdata/book/wasm";
const update = !!process.env.UPDATE_GOLDEN;

describe("background/book SBK (backend=wasm) golden", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  const cases = [
    { name: "shogigui01-edited.sbk", input: "src/tests/testdata/book/shogigui01.sbk" },
    { name: "shogigui02-edited.sbk", input: "src/tests/testdata/book/shogigui02.sbk" },
    { name: "sbk-merge-edited.sbk", input: "src/tests/testdata/book/sbk-merge.sbk" },
    { name: "new-edited.sbk", input: undefined },
  ];
  for (const { name, input } of cases) {
    it(name, async () => {
      if (input) {
        const mode = await openBook(defaultBookSession, input, { backend: "wasm" });
        expect(mode).toBe("on-the-fly");
      } else {
        clearBook(defaultBookSession, "sbk", "wasm");
      }
      await editBook(defaultBookSession, tmpdir);
      const outPath = path.join(tmpdir, name);
      await saveBook(defaultBookSession, outPath);
      const actual = fs.readFileSync(outPath);
      const goldenPath = path.join(goldenDir, name);
      if (update) {
        fs.mkdirSync(goldenDir, { recursive: true });
        fs.writeFileSync(goldenPath, actual);
      }
      expect(actual.toString("hex")).toBe(fs.readFileSync(goldenPath).toString("hex"));
    });
  }
});
