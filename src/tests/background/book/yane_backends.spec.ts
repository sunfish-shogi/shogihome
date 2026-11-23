// [共通] やねうら王形式の定跡の On-the-fly モードの振る舞いを、JavaScript 版と WebAssembly 版の両方で確かめる。
// JavaScript 版を削除する際には backends から "js" を取り除けばよい。

import fs from "node:fs";
import path from "node:path";
import {
  clearBook,
  closeBookSession,
  getBookInfo,
  openBook,
  openBookAsNewSession,
  removeBookMove,
  saveBook,
  searchBookEntry,
  updateBookMove,
  updateBookPositionComment,
} from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { after76, editBook, initialSfen, snapshotBook, yaneFields } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/yane-backends");

const backends: BookBackend[] = ["wasm", "js"];

const sources = [
  "src/tests/testdata/book/yaneuraou.db",
  "src/tests/testdata/book/yaneuraou-crlf.db",
  "src/tests/testdata/book/yaneuraou-bom-crlf.db",
  "src/tests/testdata/book/yaneuraou-no-header.db",
  "src/tests/testdata/book/yaneuraou-bom-no-header.db",
];

describe.each(backends)("background/book YaneuraOu on-the-fly (backend=%s)", (backend) => {
  beforeAll(() => {
    fs.mkdirSync(path.join(tmpdir, backend), { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  const out = (name: string) => path.join(tmpdir, backend, name);
  const open = (session: number, filePath: string) =>
    openBook(session, filePath, { forceOnTheFly: true, backend });

  for (const source of sources) {
    it(`open and search: ${source}`, async () => {
      expect(await open(defaultBookSession, source)).toBe("on-the-fly");
      const entry = await searchBookEntry(defaultBookSession, initialSfen);
      expect(entry?.moves.map((m) => m.usi)).toEqual(["2g2f", "7g7f", "5g5f", "2h7h", "3g3f"]);
      expect(entry?.moves[0]).toMatchObject({ usi2: "3c3d", score: 63, depth: 27 });
      expect(entry?.moves[0].comment).toBe("multi line comment 1\nmulti line comment 2");
      expect(entry?.moves[1].comment).toBe("single line comment");
      expect((await searchBookEntry(defaultBookSession, after76))?.moves).toHaveLength(3);
      // 存在しない局面
      expect(
        await searchBookEntry(defaultBookSession, initialSfen.replace(" b - 1", " w - 1")),
      ).toBeNull();
    });
  }

  it("edit, save and reopen", async () => {
    await open(defaultBookSession, "src/tests/testdata/book/yaneuraou.db");
    await editBook(defaultBookSession, path.join(tmpdir, backend));
    const edited = await snapshotBook(defaultBookSession);
    expect(edited.length).toBeGreaterThan(5);
    expect(getBookInfo(defaultBookSession).unsaved).toBe(true);

    await saveBook(defaultBookSession, out("edited.db"));
    expect(getBookInfo(defaultBookSession).unsaved).toBe(false);
    // 保存しても内容は変わらない
    expect(await snapshotBook(defaultBookSession)).toEqual(edited);

    // 保存したファイルを開き直しても内容は変わらない (やねうら王形式で保存できる項目のみ)
    const { session } = await openBookAsNewSession(out("edited.db"), {
      forceOnTheFly: true,
      backend,
    });
    try {
      expect(yaneFields(await snapshotBook(session))).toEqual(yaneFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  it("remove moves and comments, and save", async () => {
    await open(defaultBookSession, "src/tests/testdata/book/yaneuraou.db");
    await removeBookMove(defaultBookSession, initialSfen, "7g7f");
    await updateBookPositionComment(defaultBookSession, after76, "comment\nof after76");
    await updateBookMove(defaultBookSession, after76, { usi: "1c1d", count: 5, comment: "x" });
    await saveBook(defaultBookSession, out("removed.db"));

    const { session } = await openBookAsNewSession(out("removed.db"), {
      forceOnTheFly: true,
      backend,
    });
    try {
      const initial = await searchBookEntry(session, initialSfen);
      expect(initial?.moves.map((m) => m.usi)).toEqual(["2g2f", "5g5f", "2h7h", "3g3f"]);
      const entry = await searchBookEntry(session, after76);
      expect(entry?.comment).toBe("comment\nof after76");
      expect(entry?.moves.at(-1)).toMatchObject({ usi: "1c1d", count: 5, comment: "x" });
    } finally {
      closeBookSession(session);
    }
  });

  it("cannot overwrite the opened file", async () => {
    fs.copyFileSync("src/tests/testdata/book/yaneuraou.db", out("overwrite.db"));
    await open(defaultBookSession, out("overwrite.db"));
    await updateBookMove(defaultBookSession, initialSfen, { usi: "1g1f", count: 3 });
    await expect(saveBook(defaultBookSession, out("overwrite.db"))).rejects.toThrow();
    expect(fs.readFileSync(out("overwrite.db"))).toEqual(
      fs.readFileSync("src/tests/testdata/book/yaneuraou.db"),
    );
  });

  it("not ordered", async () => {
    fs.writeFileSync(
      out("not-ordered.db"),
      [
        "#YANEURAOU-DB2016 1.00",
        `sfen ${initialSfen}`,
        "7g7f none 0 0 1",
        `sfen ${after76}`,
        "8c8d none 0 0 1",
        "",
      ].join("\n"),
    );
    await expect(open(defaultBookSession, out("not-ordered.db"))).rejects.toThrow(
      "Book is not ordered by position",
    );
  });

  it("invalid header is rejected on save", async () => {
    fs.writeFileSync(
      out("invalid-header.db"),
      ["#YANEURAOU-DB2016 2.00", `sfen ${initialSfen}`, "7g7f none 0 0 1", ""].join("\n"),
    );
    await open(defaultBookSession, out("invalid-header.db"));
    await updateBookMove(defaultBookSession, initialSfen, { usi: "2g2f", count: 1 });
    await expect(saveBook(defaultBookSession, out("invalid-header-out.db"))).rejects.toThrow(
      "Unsupported book header",
    );
    expect(getBookInfo(defaultBookSession).unsaved).toBe(true);
  });
});
