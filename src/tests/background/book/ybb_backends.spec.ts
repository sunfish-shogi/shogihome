// [共通] YBB 形式の定跡の On-the-fly モードの振る舞いを、JavaScript 版と WebAssembly 版の両方で確かめる。
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
import { editBook, initialSfen, snapshotBook, ybbFields } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/ybb-backends");
const bookPath = "src/tests/testdata/book/yaneuraou.ybb";

const backends: BookBackend[] = ["wasm", "js"];

describe.each(backends)("background/book YBB on-the-fly (backend=%s)", (backend) => {
  beforeAll(() => {
    fs.mkdirSync(path.join(tmpdir, backend), { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  const out = (name: string) => path.join(tmpdir, backend, name);
  const open = (session: number, filePath: string) =>
    openBook(session, filePath, { forceOnTheFly: true, backend });

  it("open and search", async () => {
    expect(await open(defaultBookSession, bookPath)).toBe("on-the-fly");
    const entry = await searchBookEntry(defaultBookSession, initialSfen);
    expect(entry?.moves.map((m) => m.usi)).toEqual(["2g2f", "7g7f", "5g5f", "2h7h", "3g3f"]);
    expect(entry?.moves[0]).toMatchObject({ score: 63, depth: 27 });
    expect(entry?.minPly).toBe(1);
    // 存在しない局面
    expect(
      await searchBookEntry(defaultBookSession, initialSfen.replace(" b - 1", " w - 1")),
    ).toBeNull();
  });

  it("edit, save and reopen", async () => {
    await open(defaultBookSession, bookPath);
    await editBook(defaultBookSession, path.join(tmpdir, backend), { positionComment: false });
    const edited = await snapshotBook(defaultBookSession);
    expect(edited.length).toBeGreaterThan(5);

    await saveBook(defaultBookSession, out("edited.ybb"));
    expect(getBookInfo(defaultBookSession).unsaved).toBe(false);
    // 保存しても内容は変わらない
    expect(await snapshotBook(defaultBookSession)).toEqual(edited);

    // 保存したファイルを開き直しても内容は変わらない (YBB 形式で保存できる項目のみ)
    const { session } = await openBookAsNewSession(out("edited.ybb"), {
      forceOnTheFly: true,
      backend,
    });
    try {
      expect(ybbFields(await snapshotBook(session))).toEqual(ybbFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  it("new book", async () => {
    clearBook(defaultBookSession, "ybb", backend);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).toBeNull();
    await editBook(defaultBookSession, path.join(tmpdir, backend), { positionComment: false });
    const edited = await snapshotBook(defaultBookSession);
    await saveBook(defaultBookSession, out("new.ybb"));
    const { session } = await openBookAsNewSession(out("new.ybb"), {
      forceOnTheFly: true,
      backend,
    });
    try {
      expect(ybbFields(await snapshotBook(session))).toEqual(ybbFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  it("cannot overwrite the opened file", async () => {
    fs.copyFileSync(bookPath, out("overwrite.ybb"));
    await open(defaultBookSession, out("overwrite.ybb"));
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 3 });
    await expect(saveBook(defaultBookSession, out("overwrite.ybb"))).rejects.toThrow();
    expect(fs.readFileSync(out("overwrite.ybb"))).toEqual(fs.readFileSync(bookPath));
  });

  it("values out of range", async () => {
    await open(defaultBookSession, bookPath);
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", score: 40000 });
    await expect(saveBook(defaultBookSession, out("out-of-range.ybb"))).rejects.toThrow(
      "out of range",
    );
    expect(getBookInfo(defaultBookSession).unsaved).toBe(true);
  });
});
