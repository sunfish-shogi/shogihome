// [WebAssembly 版] やねうら王形式の定跡を編集して保存した結果と、SBK 形式との間の変換結果を、
// 期待値ファイルと比較して固定する。
// 期待値ファイルは、移行期間中に JavaScript 版の出力と一致する (SBK 形式への変換は内容が一致する) ことを
// yane_wasm_equivalence.spec.ts で確かめた上で作成している。JavaScript 版を削除した後も残す。
//
// 意図して出力を変更した場合は、次のコマンドで期待値ファイルを更新する。
//   UPDATE_GOLDEN=1 npx vitest run src/tests/background/book/yane_wasm_golden.spec.ts

import fs from "node:fs";
import path from "node:path";
import { clearBook, exportBook, openBook, saveBook } from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { editBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/yane-wasm-golden");
const goldenDir = "src/tests/testdata/book/wasm";
const update = !!process.env.UPDATE_GOLDEN;

const yaneGoldenCases = [
  { name: "yaneuraou-edited.db", input: "src/tests/testdata/book/yaneuraou.db", onTheFly: true },
  {
    name: "yaneuraou-crlf-edited.db",
    input: "src/tests/testdata/book/yaneuraou-crlf.db",
    onTheFly: true,
  },
  {
    name: "yaneuraou-bom-no-header-edited.db",
    input: "src/tests/testdata/book/yaneuraou-bom-no-header.db",
    onTheFly: true,
  },
  {
    name: "yaneuraou-in-memory-edited.db",
    input: "src/tests/testdata/book/yaneuraou.db",
    onTheFly: false,
  },
];

// 変換 (出力の拡張子で変換先の形式を決める)
const exportCases = [
  { name: "yaneuraou-exported.sbk", input: "src/tests/testdata/book/yaneuraou.db" },
  { name: "shogigui02-exported.db", input: "src/tests/testdata/book/shogigui02.sbk" },
];

function compareWithGolden(name: string, actual: Buffer) {
  const goldenPath = path.join(goldenDir, name);
  if (update) {
    fs.mkdirSync(goldenDir, { recursive: true });
    fs.writeFileSync(goldenPath, actual);
  }
  expect(actual.toString("hex")).toBe(fs.readFileSync(goldenPath).toString("hex"));
}

describe("background/book YaneuraOu (backend=wasm) golden", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  for (const { name, input, onTheFly } of yaneGoldenCases) {
    it(name, async () => {
      const mode = await openBook(defaultBookSession, input, {
        forceOnTheFly: onTheFly,
        backend: "wasm",
      });
      expect(mode).toBe(onTheFly ? "on-the-fly" : "in-memory");
      await editBook(defaultBookSession, tmpdir);
      const outPath = path.join(tmpdir, name);
      await saveBook(defaultBookSession, outPath);
      compareWithGolden(name, fs.readFileSync(outPath));
    });
  }

  for (const { name, input } of exportCases) {
    it(name, async () => {
      await openBook(defaultBookSession, input, { backend: "wasm" });
      await editBook(defaultBookSession, tmpdir);
      const outPath = path.join(tmpdir, name);
      await exportBook(defaultBookSession, outPath, name.endsWith(".sbk") ? "sbk" : "yane2016");
      compareWithGolden(name, fs.readFileSync(outPath));
    });
  }
});
