// [WebAssembly 版] Apery 形式に固有の振る舞い (常に On-the-fly モードで開く・ファイルの扱い・変換・異常終了)。

import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import {
  clearBook,
  exportBook,
  getBookInfo,
  openBook,
  saveBook,
  searchBookEntry,
  updateBookMove,
} from "@/background/book/index.js";
import { BookWasmCrashError } from "@/background/book/wasm/instance.js";
import { AperyWasmBook } from "@/background/book/wasm/apery.js";
import { hash } from "@/background/book/apery_zobrist.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookSession } from "@/common/book.js";
import { t } from "@/common/i18n/index.js";
import { initialSfen } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/apery-wasm");
const bookPath = "src/tests/testdata/book/apery.bin";

describe("background/book Apery (backend=wasm)", () => {
  beforeAll(() => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearBook(defaultBookSession);
  });

  it("always opens in on-the-fly mode", async () => {
    const mode = await openBook(defaultBookSession, bookPath, {
      aperyOnTheFlyThresholdMB: 1024,
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

  it("cannot convert to other formats", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    await expect(
      exportBook(defaultBookSession, path.join(tmpdir, "out.db"), "yane2016"),
    ).rejects.toThrow(t.cannotConvertAperyBookToOtherFormat);
  });

  it("file size is not a multiple of 16", async () => {
    const invalidPath = path.join(tmpdir, "invalid.bin");
    fs.writeFileSync(invalidPath, Buffer.concat([fs.readFileSync(bookPath), Buffer.alloc(3)]));
    await openBook(defaultBookSession, invalidPath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f" });
    await expect(saveBook(defaultBookSession, path.join(tmpdir, "out.bin"))).rejects.toThrow(
      "Invalid Apery book format",
    );
  });

  // 元のファイルの回数との合計が範囲外になる場合も、書き出し始める前にエラーにする
  it("merged count is out of range", async () => {
    const sfen = "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 4";
    const book = AperyWasmBook.open(bookPath);
    try {
      expect(book.search(sfen)?.moves.find((m) => m.usi === "4c4d")?.count).toBe(69);
      const output = new PassThrough();
      let written = 0;
      output.on("data", (chunk: Buffer) => (written += chunk.length));
      const patches = new Map([
        [hash(sfen), { type: "patch" as const, moves: [{ usi: "4c4d", count: 65535 - 68 }] }],
      ]);
      await expect(book.store(patches, output)).rejects.toThrow("out of range");
      expect(written).toBe(0);
      // 合計が範囲内なら書き出せる
      patches.get(hash(sfen))!.moves[0].count = 65535 - 69;
      await book.store(patches, new PassThrough().resume());
    } finally {
      book.close();
    }
  });

  it("crash while searching", async () => {
    await openBook(defaultBookSession, bookPath, { backend: "wasm" });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f" });
    const closeSync = vi.spyOn(fs, "closeSync");
    vi.spyOn(AperyWasmBook.prototype, "search").mockImplementation(() => {
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
    vi.spyOn(AperyWasmBook.prototype, "store").mockRejectedValue(new BookWasmCrashError("test"));
    const outPath = path.join(tmpdir, "out.bin");
    await expect(saveBook(defaultBookSession, outPath)).rejects.toThrow(
      t.wasmBookCrashedWhileSavingAndClosed +
        t.unsavedBookChangesWereLost +
        t.savedBookFileMayBeIncomplete(outPath) +
        t.openedBookFileWasNotModified,
    );
    expect(getBookInfo(defaultBookSession).path).toBeUndefined();
  });
});
