import path from "node:path";
import fs from "node:fs";
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
  updateBookMoveOrder,
  updateBookPositionComment,
} from "@/background/book/index.js";
import { getTempPathForTesting } from "@/background/proc/env.js";
import { defaultBookImportSettings, SourceType } from "@/common/settings/book.js";
import { BookBackend, defaultBookSession } from "@/common/book.js";

// 定跡の WebAssembly 版と JavaScript 版で、同じ操作に対して同じ結果になることを確かめる

const tmpdir = path.join(getTempPathForTesting(), "book-backend");

const initialSfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const after76 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
const after7634 = "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 1";
const sfens = [initialSfen, after76, after7634];

const records = [
  "position startpos moves 7g7f 3c3d 2g2f 8c8d 2f2e 8d8e resign",
  "position startpos moves 7g7f 3c3d 6g6f 8c8d 2h6h resign",
  "position startpos moves 2g2f 8c8d 7g7f 3c3d 2f2e resign",
  "position startpos moves 7g7f 8c8d 2g2f 8d8e 8h7g 3c3d 7i8h resign",
];

async function editBook(session: number): Promise<void> {
  const sfenPath = path.join(tmpdir, "records.sfen");
  fs.writeFileSync(sfenPath, records.join("\n") + "\n");
  await importBookMoves(session, {
    ...defaultBookImportSettings(),
    sourceType: SourceType.FILE,
    sourceRecordFile: sfenPath,
    maxPly: 6,
  });
  await updateBookMove(session, initialSfen, { usi: "5g5f", count: 1, comment: "中飛車" });
  await updateBookMove(session, after76, { usi: "8c8d", count: 10, score: 30, depth: 12 });
  await updateBookPositionComment(session, after76, "角道を開ける");
  await updateBookPositionComment(session, after7634, "");
  await updateBookMoveOrder(session, initialSfen, "5g5f", 0);
  await removeBookMove(session, after7634, "2g2f");
}

async function snapshot(session: number) {
  const result = [];
  for (const sfen of sfens) {
    // JavaScript 版は保持しているオブジェクトをそのまま返すため、後の変更の影響を受けないようコピーする
    result.push(structuredClone(await searchBookEntry(session, sfen)));
  }
  return result;
}

async function runBoth(
  fn: (backend: BookBackend) => Promise<unknown>,
): Promise<{ wasm: unknown; js: unknown }> {
  const wasm = await fn("wasm");
  const js = await fn("js");
  return { wasm, js };
}

describe("background/book backends", () => {
  beforeAll(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(() => {
    clearBook(defaultBookSession);
  });

  for (const input of ["shogigui01.sbk", "shogigui02.sbk", "shogigui01-copy.sbk"]) {
    it(`edit and save: ${input}`, async () => {
      const { wasm, js } = await runBoth(async (backend) => {
        const { session, mode } = await openBookAsNewSession(`src/tests/testdata/book/${input}`, {
          backend,
        });
        expect(mode).toBe("in-memory");
        const before = await snapshot(session);
        await editBook(session);
        const after = await snapshot(session);
        const info = getBookInfo(session);
        const outPath = path.join(tmpdir, `edit-${backend}.sbk`);
        await saveBook(session, outPath);
        const exportPath = path.join(tmpdir, `export-${backend}.db`);
        await exportBook(session, exportPath, "yane2016", undefined, backend);
        closeBookSession(session);
        return {
          before,
          after,
          info: { ...info, path: undefined },
          saved: fs.readFileSync(outPath).toString("hex"),
          exported: fs.readFileSync(exportPath, "utf-8"),
        };
      });
      expect(wasm).toEqual(js);
    });
  }

  it("new book", async () => {
    const { wasm, js } = await runBoth(async (backend) => {
      clearBook(defaultBookSession, "sbk", backend);
      await editBook(defaultBookSession);
      const outPath = path.join(tmpdir, `new-${backend}.sbk`);
      await saveBook(defaultBookSession, outPath);
      return {
        entries: await snapshot(defaultBookSession),
        info: { ...getBookInfo(defaultBookSession), path: undefined },
        saved: fs.readFileSync(outPath).toString("hex"),
      };
    });
    expect(wasm).toEqual(js);
  });

  it("export yane2016 to sbk", async () => {
    const { wasm, js } = await runBoth(async (backend) => {
      await openBook(defaultBookSession, "src/tests/testdata/book/yaneuraou.db", { backend });
      await editBook(defaultBookSession);
      const outPath = path.join(tmpdir, `yane-${backend}.sbk`);
      await exportBook(defaultBookSession, outPath, "sbk", undefined, backend);
      return fs.readFileSync(outPath).toString("hex");
    });
    expect(wasm).toEqual(js);
  });

  it("export sbk (on-the-fly) to yane2016", async () => {
    const { wasm, js } = await runBoth(async (backend) => {
      await openBook(defaultBookSession, "src/tests/testdata/book/shogigui02.sbk", {
        backend,
        forceOnTheFly: true,
      });
      await editBook(defaultBookSession);
      const outPath = path.join(tmpdir, `otf-${backend}.db`);
      await exportBook(defaultBookSession, outPath, "yane2016", undefined, backend);
      return fs.readFileSync(outPath, "utf-8");
    });
    expect(wasm).toEqual(js);
  });
});
