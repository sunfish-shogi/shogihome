// [共通] Apery 形式の定跡の On-the-fly モードの振る舞いを、JavaScript 版と WebAssembly 版の両方で確かめる。
// JavaScript 版を削除する際には backends から "js" を取り除けばよい。

import fs from "node:fs";
import path from "node:path";
import {
  clearBook,
  closeBookSession,
  getBookInfo,
  openBook,
  openBookAsNewSession,
  saveBook,
  searchBookEntry,
  updateBookMove,
} from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { aperyFields, editBook, initialSfen, snapshotBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/apery-backends");
const bookPath = "src/tests/testdata/book/apery.bin";
const searchSfen = "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 4";

const backends: BookBackend[] = ["wasm", "js"];

describe.each(backends)("background/book Apery on-the-fly (backend=%s)", (backend) => {
  beforeAll(() => {
    fs.mkdirSync(path.join(tmpdir, backend), { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  const dir = path.join(tmpdir, backend);
  const out = (name: string) => path.join(dir, name);
  const open = (session: number, filePath: string) =>
    openBook(session, filePath, { forceOnTheFly: true, backend });
  const reopen = (filePath: string) =>
    openBookAsNewSession(filePath, { forceOnTheFly: true, backend });

  it("open and search", async () => {
    expect(await open(defaultBookSession, bookPath)).toBe("on-the-fly");
    const entry = await searchBookEntry(defaultBookSession, searchSfen);
    expect(entry?.moves).toEqual([
      { usi: "4c4d", score: -30, count: 69 },
      { usi: "3d3e", score: -50, count: 23 },
      { usi: "2c2d", score: -100, count: 8 },
    ]);
    // 存在しない局面
    expect(
      await searchBookEntry(defaultBookSession, initialSfen.replace(" b - 1", " w - 1")),
    ).toBeNull();
  });

  it("edit, save and reopen", async () => {
    await open(defaultBookSession, bookPath);
    await editBook(defaultBookSession, dir, { positionComment: false });
    const edited = await snapshotBook(defaultBookSession);
    expect(edited.length).toBeGreaterThan(5);

    await saveBook(defaultBookSession, out("edited.bin"));
    expect(getBookInfo(defaultBookSession).unsaved).toBe(false);
    // 保存しても内容は変わらない
    expect(await snapshotBook(defaultBookSession)).toEqual(edited);

    // 保存したファイルを開き直しても内容は変わらない (Apery 形式で保存できる項目のみ)
    const { session } = await reopen(out("edited.bin"));
    try {
      expect(aperyFields(await snapshotBook(session))).toEqual(aperyFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  it("new book", async () => {
    clearBook(defaultBookSession, "apery", backend);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).toBeNull();
    await editBook(defaultBookSession, dir, { positionComment: false });
    const edited = await snapshotBook(defaultBookSession);
    await saveBook(defaultBookSession, out("new.bin"));
    const { session } = await reopen(out("new.bin"));
    try {
      expect(aperyFields(await snapshotBook(session))).toEqual(aperyFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  it("cannot overwrite the opened file", async () => {
    fs.copyFileSync(bookPath, out("overwrite.bin"));
    await open(defaultBookSession, out("overwrite.bin"));
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 3 });
    await expect(saveBook(defaultBookSession, out("overwrite.bin"))).rejects.toThrow();
    expect(fs.readFileSync(out("overwrite.bin"))).toEqual(fs.readFileSync(bookPath));
  });

  it("values out of range", async () => {
    await open(defaultBookSession, bookPath);
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 70000 });
    await expect(saveBook(defaultBookSession, out("out-of-range.bin"))).rejects.toThrow(
      "out of range",
    );
    expect(getBookInfo(defaultBookSession).unsaved).toBe(true);
  });
});
