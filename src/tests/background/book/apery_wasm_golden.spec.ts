// [WebAssembly 版] Apery 形式の定跡を編集して保存した結果と、他の形式からの変換結果を、期待値ファイルと比較して固定する。
// 期待値ファイルは、移行期間中に JavaScript 版の出力と一致することを apery_wasm_equivalence.spec.ts で
// 確かめた上で作成している。JavaScript 版を削除した後も残す。
//
// 意図して出力を変更した場合は、次のコマンドで期待値ファイルを更新する。
//   UPDATE_GOLDEN=1 npx vitest run src/tests/background/book/apery_wasm_golden.spec.ts

import fs from "node:fs";
import path from "node:path";
import { clearBook, exportBook, openBook, saveBook } from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/apery-wasm-golden");
const goldenDir = "src/tests/testdata/book/wasm";
const update = !!process.env.UPDATE_GOLDEN;

function compareWithGolden(name: string, actual: Buffer) {
  const goldenPath = path.join(goldenDir, name);
  if (update) {
    fs.mkdirSync(goldenDir, { recursive: true });
    fs.writeFileSync(goldenPath, actual);
  }
  expect(actual.toString("hex")).toBe(fs.readFileSync(goldenPath).toString("hex"));
}

describe("background/book Apery (backend=wasm) golden", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  // 保存 (input が undefined の場合は新規作成した定跡)
  for (const { name, input } of [
    { name: "apery-edited.bin", input: "src/tests/testdata/book/apery.bin" },
    { name: "new-edited.bin", input: undefined },
  ]) {
    it(name, async () => {
      if (input) {
        await openBook(defaultBookSession, input, { backend: "wasm" });
      } else {
        clearBook(defaultBookSession, "apery", "wasm");
      }
      await editBook(defaultBookSession, tmpdir, { positionComment: false });
      const outPath = path.join(tmpdir, name);
      await saveBook(defaultBookSession, outPath);
      compareWithGolden(name, fs.readFileSync(outPath));
    });
  }

  // 他の形式からの変換
  for (const { name, input } of [
    { name: "yaneuraou-db-exported.bin", input: "src/tests/testdata/book/yaneuraou.db" },
    { name: "shogigui02-exported.bin", input: "src/tests/testdata/book/shogigui02.sbk" },
    { name: "yaneuraou-ybb-exported.bin", input: "src/tests/testdata/book/yaneuraou.ybb" },
  ]) {
    it(name, async () => {
      await openBook(defaultBookSession, input, { backend: "wasm" });
      await editBook(defaultBookSession, tmpdir, { positionComment: !input.endsWith(".ybb") });
      const outPath = path.join(tmpdir, name);
      await exportBook(defaultBookSession, outPath, "apery");
      compareWithGolden(name, fs.readFileSync(outPath));
    });
  }
});
