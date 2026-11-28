// [WebAssembly 版] On-the-fly モードで開いているファイルへの上書き保存が失敗した場合の動作。

import fs from "node:fs";
import path from "node:path";
import {
  clearBook,
  getBookInfo,
  openBook,
  saveBook,
  searchBookEntry,
  updateBookMove,
} from "@/background/book/index.js";
import { BookWasmCrashError } from "@/background/book/wasm/instance.js";
import { SbkWasmBook } from "@/background/book/wasm/sbk.js";
import { YaneWasmBook } from "@/background/book/wasm/yaneuraou.js";
import { YbbWasmBook } from "@/background/book/wasm/ybb.js";
import { AperyWasmBook } from "@/background/book/wasm/apery.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { t } from "@/common/i18n/index.js";
import { initialSfen } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/wasm-overwrite");

const cases = [
  { format: "sbk", source: "src/tests/testdata/book/shogigui01.sbk", wasm: SbkWasmBook },
  { format: "yane2016", source: "src/tests/testdata/book/yaneuraou.db", wasm: YaneWasmBook },
  { format: "ybb", source: "src/tests/testdata/book/yaneuraou.ybb", wasm: YbbWasmBook },
  { format: "apery", source: "src/tests/testdata/book/apery.bin", wasm: AperyWasmBook },
] as const;

describe.each(cases)("background/book overwrite (backend=wasm, format=$format)", (c) => {
  const dir = path.join(tmpdir, c.format);
  const target = path.join(dir, `overwrite${path.extname(c.source)}`);
  const original = fs.readFileSync(c.source);
  const tempFiles = () => fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
  const usis = async () =>
    (await searchBookEntry(defaultBookSession, initialSfen))?.moves.map((m) => m.usi);

  beforeEach(async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, original);
    await openBook(defaultBookSession, target, { forceOnTheFly: true, backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "9g9f", count: 3 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBook(defaultBookSession);
  });

  it("error while writing", async () => {
    vi.spyOn(c.wasm.prototype, "store").mockRejectedValue(new Error("test error"));
    await expect(saveBook(defaultBookSession, target)).rejects.toThrow("test error");
    // 元のファイルは変更されず、編集内容も残る
    expect(fs.readFileSync(target)).toEqual(original);
    expect(tempFiles()).toEqual([]);
    expect(getBookInfo(defaultBookSession)).toMatchObject({ path: target, unsaved: true });
    vi.restoreAllMocks();
    expect(await usis()).toContain("9g9f");
    // 改めて保存できる
    await saveBook(defaultBookSession, target);
    expect(await usis()).toContain("9g9f");
  });

  it("crash while writing", async () => {
    vi.spyOn(c.wasm.prototype, "store").mockRejectedValue(new BookWasmCrashError("test"));
    await expect(saveBook(defaultBookSession, target)).rejects.toThrow(
      t.wasmBookCrashedWhileSavingAndClosed +
        t.unsavedBookChangesWereLost +
        t.openedBookFileWasNotModified,
    );
    expect(fs.readFileSync(target)).toEqual(original);
    expect(tempFiles()).toEqual([]);
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
  });

  it("failed to replace the file", async () => {
    vi.spyOn(fs.promises, "rename").mockRejectedValue(new Error("test rename error"));
    await expect(saveBook(defaultBookSession, target)).rejects.toThrow("test rename error");
    // 元のファイルを開き直し、編集内容も残る
    expect(fs.readFileSync(target)).toEqual(original);
    expect(tempFiles()).toEqual([]);
    expect(getBookInfo(defaultBookSession)).toMatchObject({ path: target, unsaved: true });
    expect(await usis()).toContain("9g9f");
    vi.restoreAllMocks();
    await saveBook(defaultBookSession, target);
    expect(getBookInfo(defaultBookSession).unsaved).toBe(false);
  });

  it("failed to replace the file and reopen the original file", async () => {
    vi.spyOn(fs.promises, "rename").mockRejectedValue(new Error("test rename error"));
    vi.spyOn(c.wasm, "open").mockImplementation(() => {
      throw new Error("test open error");
    });
    await expect(saveBook(defaultBookSession, target)).rejects.toThrow(
      t.bookFileCouldNotBeReopenedAndClosed +
        t.unsavedBookChangesWereLost +
        t.openedBookFileWasNotModified,
    );
    expect(fs.readFileSync(target)).toEqual(original);
    expect(tempFiles()).toEqual([]);
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
  });

  it("failed to reopen the saved file", async () => {
    vi.spyOn(c.wasm, "open").mockImplementation(() => {
      throw new Error("test open error");
    });
    await expect(saveBook(defaultBookSession, target)).rejects.toThrow(
      t.bookFileWasSavedButCouldNotBeReopenedAndClosed,
    );
    // 保存は完了している
    expect(fs.readFileSync(target)).not.toEqual(original);
    expect(tempFiles()).toEqual([]);
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
    vi.restoreAllMocks();
    await openBook(defaultBookSession, target, { forceOnTheFly: true, backend: "wasm" });
    expect(await usis()).toContain("9g9f");
  });

  // 権限を引き継ぐ。シンボリックリンクのフォルダーを通して開いた場合も、リンク先のファイルを置き換える。
  it.skipIf(process.platform === "win32")("permissions and symbolic link", async () => {
    clearBook(defaultBookSession);
    const linkDir = path.join(tmpdir, `link-${c.format}`);
    fs.rmSync(linkDir, { force: true });
    fs.symlinkSync(dir, linkDir);
    const linkPath = path.join(linkDir, path.basename(target));
    fs.chmodSync(target, 0o640);
    await openBook(defaultBookSession, linkPath, { forceOnTheFly: true, backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "9g9f", count: 3 });
    await saveBook(defaultBookSession, linkPath);
    expect(fs.lstatSync(linkDir).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target)).not.toEqual(original);
    expect(fs.statSync(target).mode & 0o777).toBe(0o640);
    expect(tempFiles()).toEqual([]);
    expect(await usis()).toContain("9g9f");
  });
});
