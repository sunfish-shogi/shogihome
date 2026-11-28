// [共通] SBK 形式の定跡の振る舞いを、JavaScript 版と WebAssembly 版の両方で確かめる。
// JavaScript 版を削除する際には backends から "js" を取り除けばよい。

import fs from "node:fs";
import path from "node:path";
import { Move, Position } from "tsshogi";
import {
  clearBook,
  closeBookSession,
  exportBook,
  getBookInfo,
  importBookMoves,
  openBook,
  openBookAsNewSession,
  removeBookMove,
  saveBook,
  searchBookEntry,
  updateBookMove,
  updateBookPositionComment,
} from "@/background/book/index.js";
import { SBook } from "@/background/book/proto/sbk.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";
import { defaultBookImportSettings, SourceType } from "@/common/settings/book.js";
import { editBook, initialSfen, sbkFields, snapshotBook } from "@/tests/mock/book_ops.js";

const tmpdir = path.join(getTempPathForTesting(), "book/sbk-backends");

const backends: BookBackend[] = ["wasm", "js"];

describe.each(backends)("background/book SBK (backend=%s)", (backend) => {
  beforeAll(() => {
    fs.mkdirSync(path.join(tmpdir, backend), { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  const out = (name: string) => path.join(tmpdir, backend, name);

  it("open and search", async () => {
    await openBook(defaultBookSession, "src/tests/testdata/book/shogigui02.sbk", { backend });
    expect(await searchBookEntry(defaultBookSession, initialSfen)).toEqual({
      moves: [
        { usi: "7g7f", sbkId: 1, count: 68 },
        { usi: "2g2f", sbkId: 2, count: 175 },
        { usi: "2h7h", sbkId: 3, count: 5 },
        { usi: "5g5f", sbkId: 4, count: 27 },
      ],
      games: 278,
      wonBlack: 16,
      wonWhite: 9,
    });
    const info = getBookInfo(defaultBookSession);
    expect(info.format).toBe("sbk");
    expect(info.path).toBe("src/tests/testdata/book/shogigui02.sbk");
    // 存在しない局面
    expect(
      await searchBookEntry(defaultBookSession, initialSfen.replace(" b - 1", " w - 1")),
    ).toBeNull();
  });

  for (const input of ["shogigui01.sbk", "shogigui02.sbk"]) {
    it(`edit, save and reopen: ${input}`, async () => {
      await openBook(defaultBookSession, `src/tests/testdata/book/${input}`, { backend });
      await editBook(defaultBookSession, path.join(tmpdir, backend));
      const edited = await snapshotBook(defaultBookSession);
      expect(edited.length).toBeGreaterThan(10);
      expect(getBookInfo(defaultBookSession).unsaved).toBe(true);

      await saveBook(defaultBookSession, out(`edited-${input}`));
      expect(getBookInfo(defaultBookSession).unsaved).toBe(false);
      // 保存しても内容は変わらない
      expect(await snapshotBook(defaultBookSession)).toEqual(edited);

      // 保存したファイルを開き直しても内容は変わらない (SBK 形式で保存できる項目のみ)
      const { session } = await openBookAsNewSession(out(`edited-${input}`), { backend });
      try {
        expect(sbkFields(await snapshotBook(session))).toEqual(sbkFields(edited));
      } finally {
        closeBookSession(session);
      }
    });
  }

  it("new book", async () => {
    clearBook(defaultBookSession, "sbk", backend);
    expect(await searchBookEntry(defaultBookSession, initialSfen)).toBeNull();
    await editBook(defaultBookSession, path.join(tmpdir, backend));
    const edited = await snapshotBook(defaultBookSession);
    expect(edited.length).toBeGreaterThan(5);

    await saveBook(defaultBookSession, out("new.sbk"));
    const { session } = await openBookAsNewSession(out("new.sbk"), { backend });
    try {
      expect(sbkFields(await snapshotBook(session))).toEqual(sbkFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  it("export to sbk", async () => {
    await openBook(defaultBookSession, "src/tests/testdata/book/shogigui01.sbk", { backend });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "5g5f", count: 3 });
    const edited = await snapshotBook(defaultBookSession);
    await exportBook(defaultBookSession, out("exported.sbk"), "sbk");
    const { session } = await openBookAsNewSession(out("exported.sbk"), { backend });
    try {
      expect(sbkFields(await snapshotBook(session))).toEqual(sbkFields(edited));
    } finally {
      closeBookSession(session);
    }
  });

  // 先頭が平手以外のルート局面と、先頭以外にあるルート局面を編集して保存しても、
  // それぞれの局面 (Position) が維持される
  it("edit root states and save", async () => {
    const handicapRoot = "lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1";
    await openBook(defaultBookSession, "src/tests/testdata/book/two-roots.sbk", { backend });
    await updateBookPositionComment(defaultBookSession, handicapRoot, "飛車落ち");
    await updateBookMove(defaultBookSession, handicapRoot, { usi: "3c3d", count: 2 });
    await updateBookPositionComment(defaultBookSession, initialSfen, "平手");
    await saveBook(defaultBookSession, out("two-roots.sbk"));

    const { session } = await openBookAsNewSession(out("two-roots.sbk"), { backend });
    try {
      const handicap = await searchBookEntry(session, handicapRoot);
      expect(handicap?.comment).toBe("飛車落ち");
      expect(handicap?.moves.map((m) => m.usi)).toEqual(["4a3b", "3c3d"]);
      const standard = await searchBookEntry(session, initialSfen);
      expect(standard?.comment).toBe("平手");
      expect(standard?.moves.map((m) => m.usi)).toEqual(["7g7f"]);
    } finally {
      closeBookSession(session);
    }
  });

  // 指し手を削除しても、その遷移先の局面 (編集していない) が失われない
  it("remove a move and save", async () => {
    const after76 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
    await openBook(defaultBookSession, "src/tests/testdata/book/shogigui02.sbk", { backend });
    const child = await searchBookEntry(defaultBookSession, after76);
    expect(child?.moves.length).toBeGreaterThan(0);
    await removeBookMove(defaultBookSession, initialSfen, "7g7f");
    await saveBook(defaultBookSession, out("removed.sbk"));

    const { session } = await openBookAsNewSession(out("removed.sbk"), { backend });
    try {
      const initial = await searchBookEntry(session, initialSfen);
      expect(initial?.moves.map((m) => m.usi)).toEqual(["2g2f", "2h7h", "5g5f"]);
      const reloaded = await searchBookEntry(session, after76);
      expect(reloaded?.moves.map((m) => m.usi)).toEqual(child?.moves.map((m) => m.usi));
      expect(reloaded?.games).toBe(child?.games);
    } finally {
      closeBookSession(session);
    }
  });

  // 棋譜の取り込みで作られるパッチは元の指し手を含まないが、指し手を削除したことにはならない
  it("import records and save", async () => {
    const after76 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
    const sourcePath = "src/tests/testdata/book/shogigui02.sbk";
    await openBook(defaultBookSession, sourcePath, { backend, forceOnTheFly: true });
    const child = await searchBookEntry(defaultBookSession, after76);
    const recordPath = out("import-records.sfen");
    fs.writeFileSync(recordPath, "position startpos moves 1g1f resign\n");
    await importBookMoves(defaultBookSession, {
      ...defaultBookImportSettings(),
      sourceType: SourceType.FILE,
      sourceRecordFile: recordPath,
      maxPly: 1,
    });
    await saveBook(defaultBookSession, out("imported.sbk"));

    // 編集していない局面に Position を書き出さない (追加された遷移先の State は Position を持たない)
    const positions = (sbk: Buffer) =>
      SBook.decode(sbk)
        .BookStates.map((s) => s.Position)
        .filter((p) => p);
    expect(positions(fs.readFileSync(out("imported.sbk")))).toEqual(
      positions(fs.readFileSync(sourcePath)),
    );
    const { session } = await openBookAsNewSession(out("imported.sbk"), { backend });
    try {
      const initial = await searchBookEntry(session, initialSfen);
      expect(initial?.moves.map((m) => m.usi)).toEqual(["7g7f", "2g2f", "2h7h", "5g5f", "1g1f"]);
      const reloaded = await searchBookEntry(session, after76);
      expect(reloaded?.moves.map((m) => m.usi)).toEqual(child?.moves.map((m) => m.usi));
    } finally {
      closeBookSession(session);
    }
  });

  // 元の定跡とつながらない局面から始まり、元の局面に戻る循環を追加して保存しても、循環の局面が失われない
  it("add a loop and save", async () => {
    await openBook(defaultBookSession, "src/tests/testdata/book/shogigui02.sbk", {
      backend,
      forceOnTheFly: true,
    });
    const start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/8P/PPPPPPPP1/1B5R1/LNSGKGSNL w - 1";
    const usis = ["8b7b", "2h3h", "7b8b", "3h2h"];
    const pos = Position.newBySFEN(start) as Position;
    const loop: [string, string][] = [];
    for (const usi of usis) {
      loop.push([pos.sfen, usi]);
      await updateBookMove(defaultBookSession, pos.sfen, { usi, count: 1 });
      pos.doMove(pos.createMoveByUSI(usi) as Move);
    }
    await saveBook(defaultBookSession, out("loop.sbk"));

    const { session } = await openBookAsNewSession(out("loop.sbk"), { backend });
    try {
      for (const [sfen, usi] of loop) {
        expect(
          (await searchBookEntry(session, sfen))?.moves.map((m) => m.usi),
          sfen,
        ).toContain(usi);
      }
    } finally {
      closeBookSession(session);
    }
  });

  it("overwrite the opened file", async () => {
    const original = "src/tests/testdata/book/shogigui01.sbk";
    const target = out("overwrite.sbk");
    fs.copyFileSync(original, target);
    await openBook(defaultBookSession, target, { backend, forceOnTheFly: true });
    await updateBookMove(defaultBookSession, initialSfen, { usi: "5g5f", count: 3 });
    if (backend === "js") {
      // [js] JavaScript 版の On-the-fly モードでは開いているファイルに上書きできない
      await expect(saveBook(defaultBookSession, target)).rejects.toThrow();
      expect(fs.readFileSync(target)).toEqual(fs.readFileSync(original));
      return;
    }
    // 別のファイルに保存した場合と同じ内容になる
    await saveBook(defaultBookSession, out("overwrite-expected.sbk"));
    await saveBook(defaultBookSession, target);
    expect(getBookInfo(defaultBookSession).unsaved).toBe(false);
    expect(fs.readFileSync(target)).toEqual(fs.readFileSync(out("overwrite-expected.sbk")));
    // 一時ファイルは残らない
    expect(
      fs.readdirSync(path.join(tmpdir, backend)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    // 保存したファイルを開き直して、続けて編集・上書き保存できる
    expect(
      (await searchBookEntry(defaultBookSession, initialSfen))?.moves.map((m) => m.usi),
    ).toContain("5g5f");
    await updateBookMove(defaultBookSession, initialSfen, { usi: "9g9f", count: 1 });
    await saveBook(defaultBookSession, target);
    const { session } = await openBookAsNewSession(target, { backend, forceOnTheFly: true });
    try {
      const usis = (await searchBookEntry(session, initialSfen))?.moves.map((m) => m.usi);
      expect(usis).toContain("5g5f");
      expect(usis).toContain("9g9f");
    } finally {
      closeBookSession(session);
    }
  });
});
