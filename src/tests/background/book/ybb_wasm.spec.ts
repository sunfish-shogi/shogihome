// [WebAssembly 版] YBB 形式に固有の振る舞い (常に On-the-fly モードで開く・ファイルの扱い・異常終了)。

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
import { YbbWasmBook } from "@/background/book/wasm/ybb.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { t } from "@/common/i18n/index.js";
import { initialSfen } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/ybb-wasm");
const bookPath = "src/tests/testdata/book/yaneuraou.ybb";

describe("background/book YBB (backend=wasm)", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBook(defaultBookSession);
  });

  it("always opens in on-the-fly mode", async () => {
    const mode = await openBook(defaultBookSession, bookPath, {
      ybbOnTheFlyThresholdMB: 1024,
      backend: "wasm",
    });
    expect(mode).toBe("on-the-fly");
  });

  it("closes the file when the book is closed", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    const closeSync = vi.spyOn(fs, "closeSync");
    clearBook(defaultBookSession);
    expect(closeSync).toHaveBeenCalledTimes(1);
  });

  it("invalid file", async () => {
    const invalidPath = path.join(tmpdir, "invalid.ybb");
    fs.writeFileSync(invalidPath, "x".repeat(64));
    await expect(openBook(defaultBookSession, invalidPath, { backend: "wasm" })).rejects.toThrow(
      "Invalid YBB magic",
    );
  });

  it("crash while searching", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f" });
    const closeSync = vi.spyOn(fs, "closeSync");
    vi.spyOn(YbbWasmBook.prototype, "search").mockImplementation(() => {
      throw new BookWasmCrashError("test");
    });
    await expect(
      searchBookEntry(defaultBookSession, initialSfen.replace(" b - 1", " w - 1")),
    ).rejects.toThrow(
      t.wasmBookCrashedAndClosed + t.unsavedBookChangesWereLost + t.openedBookFileWasNotModified,
    );
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
    expect(closeSync).toHaveBeenCalledTimes(1);
  });

  it("crash while saving", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f" });
    vi.spyOn(YbbWasmBook.prototype, "store").mockRejectedValue(new BookWasmCrashError("test"));
    const outPath = path.join(tmpdir, "out.ybb");
    await expect(saveBook(defaultBookSession, outPath)).rejects.toThrow(
      t.wasmBookCrashedWhileSavingAndClosed +
        t.unsavedBookChangesWereLost +
        t.savedBookFileMayBeIncomplete(outPath) +
        t.openedBookFileWasNotModified,
    );
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
  });
});
