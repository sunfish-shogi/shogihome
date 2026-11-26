// [WebAssembly 版] やねうら王形式に固有の振る舞い (ファイルの扱いと異常終了)。

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
import { BookWasmCrashError } from "@/background/book/wasm/instance.js";
import { YaneWasmBook } from "@/background/book/wasm/yaneuraou.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { t } from "@/common/i18n/index.js";
import { initialSfen } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/yane-wasm");
const bookPath = "src/tests/testdata/book/yaneuraou.db";
const open = () => openBook(defaultBookSession, bookPath, { forceOnTheFly: true, backend: "wasm" });

describe("background/book YaneuraOu (backend=wasm)", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBook(defaultBookSession);
  });

  it("modes are switched by the threshold", async () => {
    const open = vi.spyOn(YaneWasmBook, "open");
    const load = vi.spyOn(YaneWasmBook, "load");
    expect(
      await openBook(defaultBookSession, bookPath, { yaneOnTheFlyThresholdMB: 1, backend: "wasm" }),
    ).toBe("in-memory");
    expect(load).toHaveBeenCalledTimes(1);
    expect(
      await openBook(defaultBookSession, bookPath, {
        yaneOnTheFlyThresholdMB: 0.0001,
        backend: "wasm",
      }),
    ).toBe("on-the-fly");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("in-memory mode does not keep the file open", async () => {
    const closeSync = vi.spyOn(fs, "closeSync");
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    clearBook(defaultBookSession);
    expect(closeSync).not.toHaveBeenCalled();
  });

  it("closes the file when the book is closed", async () => {
    await open();
    const closeSync = vi.spyOn(fs, "closeSync");
    clearBook(defaultBookSession);
    expect(closeSync).toHaveBeenCalledTimes(1);
  });

  it("read errors are reported without closing the book", async () => {
    await open();
    vi.spyOn(fs, "readSync").mockImplementation(() => {
      throw new Error("EIO: i/o error, read");
    });
    await expect(searchBookEntry(defaultBookSession, initialSfen)).rejects.toThrow("EIO");
    vi.restoreAllMocks();
    // 定跡は開いたまま
    expect(getBookInfo(defaultBookSession).path).toBe(bookPath);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).not.toBeNull();
  });

  it("crash while searching (with unsaved changes)", async () => {
    await open();
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 1 });
    const closeSync = vi.spyOn(fs, "closeSync");
    vi.spyOn(YaneWasmBook.prototype, "search").mockImplementation(() => {
      throw new BookWasmCrashError("test");
    });
    const after = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
    await expect(searchBookEntry(defaultBookSession, after)).rejects.toThrow(
      t.wasmBookCrashedAndClosed + t.unsavedBookChangesWereLost + t.openedBookFileWasNotModified,
    );
    // 定跡は閉じられ、ファイルも閉じられている
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
    expect(isBookUnsaved(defaultBookSession)).toBe(false);
    expect(closeSync).toHaveBeenCalledTimes(1);
  });

  it("crash while saving", async () => {
    await open();
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 1 });
    vi.spyOn(YaneWasmBook.prototype, "store").mockRejectedValue(new BookWasmCrashError("test"));
    const outPath = path.join(tmpdir, "out.db");
    await expect(saveBook(defaultBookSession, outPath)).rejects.toThrow(
      t.wasmBookCrashedWhileSavingAndClosed +
        t.unsavedBookChangesWereLost +
        t.savedBookFileMayBeIncomplete(outPath) +
        t.openedBookFileWasNotModified,
    );
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
  });

  it("crash while overwriting the opened file (in-memory)", async () => {
    // in-memory モードでは開いているファイルに上書きできるため、ファイルが変更されていないとは伝えない
    const filePath = path.join(tmpdir, "overwrite.db");
    fs.copyFileSync(bookPath, filePath);
    await openBook(defaultBookSession, filePath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 1 });
    vi.spyOn(YaneWasmBook.prototype, "store").mockRejectedValue(new BookWasmCrashError("test"));
    await expect(saveBook(defaultBookSession, filePath)).rejects.toMatchObject({
      message:
        t.wasmBookCrashedWhileSavingAndClosed +
        t.unsavedBookChangesWereLost +
        t.savedBookFileMayBeIncomplete(filePath),
    });
  });

  it("traps are converted to BookWasmCrashError", () => {
    const book = YaneWasmBook.open(bookPath);
    try {
      const raw = (book as unknown as { raw: Record<string, unknown> }).raw;
      raw.yane_search = () => {
        throw new WebAssembly.RuntimeError("unreachable");
      };
      expect(() => book.search(initialSfen)).toThrow(BookWasmCrashError);
    } finally {
      book.close();
    }
  });
});
