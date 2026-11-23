// [WebAssembly 版] 開けるファイルの大きさの上限と、WebAssembly モジュールが異常終了した場合の動作。

import fs from "node:fs";
import path from "node:path";
import {
  clearBook,
  getBookInfo,
  isBookUnsaved,
  openBook,
  saveBook,
  searchBookEntry,
  updateBookMove,
} from "@/background/book/index.js";
import { BookWasmCrashError, MAX_SBK_FILE_SIZE, SbkWasmBook } from "@/background/book/wasm/sbk.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { t } from "@/common/i18n/index.js";
import { initialSfen } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/sbk-wasm-crash");
const bookPath = "src/tests/testdata/book/shogigui02.sbk";

describe("background/book SBK (backend=wasm) crash", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBook(defaultBookSession);
  });

  it("rejects too large files", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    // 中身の無いファイル (ディスクを消費しない) で上限を超える大きさにする
    const largePath = path.join(tmpdir, "large.sbk");
    const fd = fs.openSync(largePath, "w");
    try {
      fs.ftruncateSync(fd, MAX_SBK_FILE_SIZE + 1);
    } finally {
      fs.closeSync(fd);
    }
    await expect(openBook(defaultBookSession, largePath, { backend: "wasm" })).rejects.toThrow(
      t.bookFileTooLargeForWasm("1 GiB"),
    );
    // 開いていた定跡はそのまま残る
    expect(getBookInfo(defaultBookSession).path).toBe(bookPath);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).not.toBeNull();
  });

  it("crash while opening", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    vi.spyOn(SbkWasmBook, "open").mockRejectedValueOnce(new BookWasmCrashError("test"));
    await expect(
      openBook(defaultBookSession, "src/tests/testdata/book/shogigui01.sbk", { backend: "wasm" }),
    ).rejects.toThrow(t.wasmBookCrashedOnOpen);
    // 開いていた定跡はそのまま残る
    expect(getBookInfo(defaultBookSession).path).toBe(bookPath);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).not.toBeNull();
  });

  it("crash while searching (with unsaved changes)", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 1 });
    expect(isBookUnsaved(defaultBookSession)).toBe(true);
    vi.spyOn(SbkWasmBook.prototype, "search").mockImplementation(() => {
      throw new BookWasmCrashError("test");
    });
    const after = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
    await expect(searchBookEntry(defaultBookSession, after)).rejects.toThrow(
      t.wasmBookCrashedAndClosed + t.unsavedBookChangesWereLost + t.openedBookFileWasNotModified,
    );
    vi.restoreAllMocks();
    // 定跡は閉じられている (以後の検索でエラーが続かない)
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
    expect(isBookUnsaved(defaultBookSession)).toBe(false);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).toBeNull();
  });

  it("crash while searching (without unsaved changes)", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    vi.spyOn(SbkWasmBook.prototype, "search").mockImplementation(() => {
      throw new BookWasmCrashError("test");
    });
    await expect(searchBookEntry(defaultBookSession, initialSfen)).rejects.toThrow(
      t.wasmBookCrashedAndClosed + t.openedBookFileWasNotModified,
    );
  });

  it("crash while saving", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 1 });
    vi.spyOn(SbkWasmBook.prototype, "store").mockRejectedValue(new BookWasmCrashError("test"));
    const outPath = path.join(tmpdir, "out.sbk");
    await expect(saveBook(defaultBookSession, outPath)).rejects.toThrow(
      t.wasmBookCrashedWhileSavingAndClosed +
        t.unsavedBookChangesWereLost +
        t.savedBookFileMayBeIncomplete(outPath) +
        t.openedBookFileWasNotModified,
    );
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
  });

  it("other errors do not close the book", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    vi.spyOn(SbkWasmBook.prototype, "search").mockImplementation(() => {
      throw new Error("other error");
    });
    await expect(searchBookEntry(defaultBookSession, initialSfen)).rejects.toThrow("other error");
    expect(getBookInfo(defaultBookSession).path).toBe(bookPath);
  });

  it("traps are converted to BookWasmCrashError", async () => {
    const book = await SbkWasmBook.open(bookPath);
    const raw = (book as unknown as { raw: Record<string, unknown> }).raw;
    const original = raw.sbk_search;
    let calls = 0;
    raw.sbk_search = () => {
      calls++;
      throw new WebAssembly.RuntimeError("unreachable");
    };
    expect(() => book.search(initialSfen)).toThrow(BookWasmCrashError);
    // 異常終了した後は WebAssembly の関数を呼び出さずに同じエラーになる
    raw.sbk_search = original;
    expect(() => book.search(initialSfen)).toThrow(BookWasmCrashError);
    expect(calls).toBe(1);
  });

  it("pointers in the upper half of memory are treated as unsigned", async () => {
    const book = await SbkWasmBook.open(bookPath);
    const internal = book as unknown as {
      raw: Record<string, unknown>;
      exports: Record<string, () => number>;
    };
    // 2 GiB より後ろのアドレスは i32 として負の値で返される
    internal.raw.book_result_ptr = () => -2146369512;
    internal.raw.sbk_save_next = () => -1;
    expect(internal.exports.book_result_ptr()).toBe(2148597784);
    // アドレス以外の戻り値 (負の値はエラーを表す) は変換しない
    expect(internal.exports.sbk_save_next()).toBe(-1);
  });
});
