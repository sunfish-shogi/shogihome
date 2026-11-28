import { basename, dirname, join as joinPath, resolve as resolvePath } from "node:path";
import fs, { ReadStream } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  BookBackend,
  BookFormat,
  BookImportSummary,
  BookInfo,
  BookLoadingOptions,
  BookMove,
  BookPositionEntry,
  defaultBookSession,
} from "@/common/book.js";
import { getAppLogger } from "@/background/log.js";
import { AperyBook, Book, BookEntry, mergeBookEntries, SbkBook, YaneBook } from "./types.js";
import {
  loadYaneuraOuBook,
  mergeYaneuraOuBook,
  searchYaneuraOuBookMovesOnTheFly,
  storeYaneuraOuBook,
  validateBookPositionOrdering,
} from "./yaneuraou.js";
import { BookImportSettings, PlayerCriteria, SourceType } from "@/common/settings/book.js";
import { exists, listFiles } from "@/background/helpers/file.js";
import {
  detectRecordFileFormatByPath,
  importRecordFromBuffer,
  RecordFileFormat,
} from "@/common/file/record.js";
import { TextDecodingRule } from "@/common/settings/app.js";
import { loadAppSettings } from "@/background/settings.js";
import {
  Color,
  getBlackPlayerName,
  getWhitePlayerName,
  ImmutableNode,
  Move,
  Record,
  reverseColor,
  SpecialMoveType,
} from "tsshogi";
import { t } from "@/common/i18n/index.js";
import { parseComment } from "@/common/record/comment.js";
import { hash as aperyHash } from "./apery_zobrist.js";
import {
  loadAperyBook,
  mergeAperyBook,
  searchAperyBookMovesOnTheFly,
  storeAperyBook,
} from "./apery.js";
import {
  loadSbkBook,
  loadSbkBookOnTheFly,
  searchSbkBookEntryOnTheFly,
  storeSbkBook,
} from "./sbk.js";
import {
  loadYbbBook,
  loadYbbBookFull,
  mergeYbbBook,
  openYbbBookOnTheFly,
  searchYbbBookMovesOnTheFly,
  storeYbbBook,
  YbbOnTheFly,
} from "./ybb.js";
import { BookWasmCrashError, isBookWasmAvailable } from "./wasm/instance.js";
import { SbkWasmBook } from "./wasm/sbk.js";
import { YaneWasmBook } from "./wasm/yaneuraou.js";
import { YbbWasmBook } from "./wasm/ybb.js";
import { AperyWasmBook } from "./wasm/apery.js";

type BookHandle = InMemoryBook | OnTheFlyBook | WasmBook;

type InMemoryBook = Book & {
  type: "in-memory";
  path?: string;
  saved: boolean;
};

type OnTheFlyBook = {
  type: "on-the-fly";
  path: string;
  saved: boolean;
} & (
  | ((YaneBook | AperyBook) & {
      file: fs.promises.FileHandle;
      size: number;
    })
  | SbkBook
  | YbbOnTheFly
);

// WebAssembly 版の SBK 定跡。常に On-the-fly モードで動作する。
// 元のファイルの内容は WebAssembly 側で保持し、編集内容 (entries) は JavaScript 側で保持する。
type WasmSbkBook = {
  type: "on-the-fly";
  backend: "wasm";
  format: "sbk";
  path?: string; // 元のファイル (新規作成した定跡の場合は undefined)
  saved: boolean;
  entries: Map<string, BookEntry>;
  sbkWasm: SbkWasmBook;
  sbkAuthor?: string;
  sbkDescription?: string;
};

// WebAssembly 版のやねうら王形式の定跡。JavaScript 版と同じく On-the-fly 閾値でモードを切り替える。
// - On-the-fly モード: 元のファイルはメモリに読み込まず WebAssembly 側から必要な部分を読む。
// - in-memory モード: ファイル全体を WebAssembly 側に読み込む。編集した局面は元のエントリーを
//   entries に複製してから変更する (JavaScript 版の in-memory モードと同じ結果にするため)。
// 編集内容 (entries) は JavaScript 側で保持する。
type WasmYaneBook = {
  type: "on-the-fly" | "in-memory";
  backend: "wasm";
  format: "yane2016";
  path?: string; // 元のファイル (新規作成した定跡の場合は undefined)
  saved: boolean;
  entries: Map<string, BookEntry>;
  yaneWasm: YaneWasmBook;
};

// WebAssembly 版の YBB 形式の定跡。常に On-the-fly モードで動作する。
// 元のファイルはメモリに読み込まず WebAssembly 側から必要な部分を読む。編集内容 (entries) は JavaScript 側で保持する。
type WasmYbbBook = {
  type: "on-the-fly";
  backend: "wasm";
  format: "ybb";
  path?: string; // 元のファイル (新規作成した定跡の場合は undefined)
  saved: boolean;
  entries: Map<string, BookEntry>;
  ybbWasm: YbbWasmBook;
};

// WebAssembly 版の Apery 形式の定跡。常に On-the-fly モードで動作する。
// 元のファイルはメモリに読み込まず WebAssembly 側から必要な部分を読む。
// 編集内容 (entries) は JavaScript 側でハッシュ値をキーとして保持する。
type WasmAperyBook = {
  type: "on-the-fly";
  backend: "wasm";
  format: "apery";
  path?: string; // 元のファイル (新規作成した定跡の場合は undefined)
  saved: boolean;
  entries: Map<bigint, BookEntry>;
  aperyWasm: AperyWasmBook;
};

type WasmBook = WasmSbkBook | WasmYaneBook | WasmYbbBook | WasmAperyBook;

// 形式ごとのファイルの拡張子
const bookFileExtensions: { [K in BookFormat]: string } = {
  yane2016: ".db",
  apery: ".bin",
  sbk: ".sbk",
  ybb: ".ybb",
};

// WebAssembly 版の定跡のインスタンス
function wasmInstance(book: WasmBook): SbkWasmBook | YaneWasmBook | YbbWasmBook | AperyWasmBook {
  switch (book.format) {
    case "apery":
      return book.aperyWasm;
    case "sbk":
      return book.sbkWasm;
    case "yane2016":
      return book.yaneWasm;
    case "ybb":
      return book.ybbWasm;
  }
}

function isWasmBook(book: BookHandle): book is WasmBook {
  return "backend" in book && book.backend === "wasm";
}

// WebAssembly 版を使うかどうか。WebAssembly モジュールを初期化できない場合は JavaScript 版を使う。
function useWasm(format: BookFormat, backend?: BookBackend): boolean {
  const implemented =
    format === "sbk" || format === "yane2016" || format === "ybb" || format === "apery";
  return implemented && backend !== "js" && isBookWasmAvailable();
}

// 2 つのパスが同じファイルを指すかどうか
function isSameFile(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return resolvePath(a) === resolvePath(b);
  }
}

/**
 * WebAssembly モジュールが異常終了した場合の処理。
 * 異常終了したインスタンスは使えないため定跡を閉じ、何が失われたかを伝えるエラーを投げる。
 * それ以外のエラーはそのまま投げ直す。
 */
function handleWasmCrash(
  book: WasmBook,
  e: unknown,
  savePath?: string,
  { overwrite = false }: { overwrite?: boolean } = {},
): never {
  if (!(e instanceof BookWasmCrashError)) {
    throw e;
  }
  closeWasmBook(book);
  discardWasmBook(book);
  const sentences = [
    savePath !== undefined ? t.wasmBookCrashedWhileSavingAndClosed : t.wasmBookCrashedAndClosed,
  ];
  if (!book.saved) {
    sentences.push(t.unsavedBookChangesWereLost);
  }
  // On-the-fly モードの上書き保存では一時ファイルに書き出して削除するため、保存先は変更されていない
  if (savePath !== undefined && !overwrite) {
    sentences.push(t.savedBookFileMayBeIncomplete(savePath));
  }
  // in-memory モードでは開いているファイルに上書きできるため、上書きに失敗した場合は伝えない
  if (book.path && (savePath === undefined || overwrite || !isSameFile(book.path, savePath))) {
    sentences.push(t.openedBookFileWasNotModified);
  }
  throw new Error(joinSentences(sentences), { cause: e });
}

// 日本語の文は空白を挟まずに連結する
function joinSentences(sentences: string[]): string {
  return sentences.reduce((a, b) => (/[。．]$/.test(a) ? a + b : `${a} ${b}`));
}

// マージ済みのエントリーを取得する。
async function retrieveMergedEntry(book: BookHandle, sfen: string): Promise<BookEntry | undefined> {
  if (isWasmBook(book)) {
    const entry =
      book.format === "apery" ? book.entries.get(aperyHash(sfen)) : book.entries.get(sfen);
    if (entry?.type === "normal") {
      return entry;
    }
    let base: BookEntry | undefined;
    try {
      base = wasmInstance(book).search(sfen);
    } catch (e) {
      handleWasmCrash(book, e);
    }
    return mergeBookEntries(base, entry);
  }
  switch (book.format) {
    case "yane2016": {
      const entry = book.entries.get(sfen);
      if (book.type === "in-memory" || entry?.type === "normal") {
        return entry;
      }
      const base = await searchYaneuraOuBookMovesOnTheFly(sfen, book.file, book.size);
      return mergeBookEntries(base, entry);
    }
    case "apery": {
      const entry = book.entries.get(aperyHash(sfen));
      if (book.type === "in-memory" || entry?.type === "normal") {
        return entry;
      }
      const base = await searchAperyBookMovesOnTheFly(sfen, book.file, book.size);
      return mergeBookEntries(base, entry);
    }
    case "sbk": {
      const entry = book.entries.get(sfen);
      if (
        book.type === "in-memory" ||
        entry?.type === "normal" ||
        !book.rawData ||
        !book.sbkIndex
      ) {
        return entry;
      }
      const base = await searchSbkBookEntryOnTheFly(sfen, book.rawData, book.sbkIndex);
      return mergeBookEntries(base, entry);
    }
    case "ybb": {
      const entry = book.entries.get(sfen);
      if (book.type === "in-memory" || entry?.type === "normal") {
        return entry;
      }
      const base = await searchYbbBookMovesOnTheFly(sfen, book.file, book.recordCount, book.flags);
      return mergeBookEntries(base, entry);
    }
  }
}

// メモリ上のエントリーを取得する。返されたエントリーを更新した場合に book に反映されることを保証する。
function retrieveEntry(book: BookHandle, sfen: string): BookEntry | undefined {
  // WebAssembly 版の in-memory モードでは、元のエントリーを複製して保持する
  // (JavaScript 版の in-memory モードでは、元のエントリーを直接変更するため)
  if (isWasmBook(book) && book.format === "yane2016" && book.type === "in-memory") {
    let entry = book.entries.get(sfen);
    if (!entry) {
      let base: BookEntry | undefined;
      try {
        base = book.yaneWasm.search(sfen);
      } catch (e) {
        handleWasmCrash(book, e);
      }
      if (base) {
        entry = base;
        book.entries.set(sfen, entry);
      }
    }
    return entry;
  }
  switch (book.format) {
    case "yane2016":
    case "sbk":
    case "ybb":
      return book.entries.get(sfen);
    case "apery":
      return book.entries.get(aperyHash(sfen));
  }
}

function storeEntry(book: BookHandle, sfen: string, entry: BookEntry): void {
  switch (book.format) {
    case "yane2016":
    case "sbk":
    case "ybb":
      book.entries.set(sfen, entry);
      break;
    case "apery":
      book.entries.set(aperyHash(sfen), entry);
      break;
  }
  book.saved = false;
}

function emptyBook(format: BookFormat = "yane2016", backend?: BookBackend): BookHandle {
  // やねうら王形式は、内部で一時的に空の定跡を作る場合 (backend の指定が無い場合) は JavaScript 版を使う
  if (format === "yane2016" && backend === "wasm" && useWasm(format, backend)) {
    return {
      type: "in-memory",
      backend: "wasm",
      format: "yane2016",
      saved: true,
      entries: new Map<string, BookEntry>(),
      yaneWasm: YaneWasmBook.create(),
    };
  }
  if (format === "apery" && useWasm(format, backend)) {
    return {
      type: "on-the-fly",
      backend: "wasm",
      format: "apery",
      saved: true,
      entries: new Map<bigint, BookEntry>(),
      aperyWasm: AperyWasmBook.create(),
    };
  }
  if (format === "ybb" && useWasm(format, backend)) {
    return {
      type: "on-the-fly",
      backend: "wasm",
      format: "ybb",
      saved: true,
      entries: new Map<string, BookEntry>(),
      ybbWasm: YbbWasmBook.create(),
    };
  }
  if (format === "sbk" && useWasm(format, backend)) {
    return {
      type: "on-the-fly",
      backend: "wasm",
      format: "sbk",
      saved: true,
      entries: new Map<string, BookEntry>(),
      sbkWasm: SbkWasmBook.create(),
    };
  }
  switch (format) {
    case "apery":
      return {
        type: "in-memory",
        format: "apery",
        entries: new Map<bigint, BookEntry>(),
        saved: true,
      };
    case "sbk":
      return {
        type: "in-memory",
        format: "sbk",
        entries: new Map<string, BookEntry>(),
        saved: true,
      };
    case "ybb":
      return {
        type: "in-memory",
        format: "ybb",
        entries: new Map<string, BookEntry>(),
        saved: true,
      };
    default:
      return {
        type: "in-memory",
        format: "yane2016",
        entries: new Map<string, BookEntry>(),
        saved: true,
      };
  }
}

const bookFiles = new Map<number, BookHandle>();
bookFiles.set(defaultBookSession, emptyBook());
let nextBookSession = defaultBookSession + 1;

function getBook(session: number): BookHandle {
  const book = bookFiles.get(session);
  if (!book) {
    throw new Error("Book session not found: " + session);
  }
  return book;
}

export function isBookUnsaved(session: number): boolean {
  const book = getBook(session);
  return !book.saved;
}

function countInMemoryEntries(book: BookHandle): number {
  if (!isWasmBook(book) || book.format !== "yane2016") {
    return book.entries.size;
  }
  // 元のファイルの局面の数に、新たに追加した局面の数を加える
  let added = 0;
  for (const sfen of book.entries.keys()) {
    if (!book.yaneWasm.search(sfen)) {
      added++;
    }
  }
  return book.yaneWasm.entryCount + added;
}

export function getBookInfo(session: number): BookInfo {
  const book = getBook(session);
  return {
    format: book.format,
    type: book.type,
    path: book.path,
    entryCount: book.type === "in-memory" ? countInMemoryEntries(book) : undefined,
    unsaved: !book.saved,
    sbkAuthor: book.format === "sbk" ? book.sbkAuthor : undefined,
    sbkDescription: book.format === "sbk" ? book.sbkDescription : undefined,
  };
}

export function getBookFormat(session: number): BookFormat {
  const book = getBook(session);
  return book.format;
}

function getFormatByPath(path: string): "yane2016" | "apery" | "sbk" | "ybb" {
  if (path.endsWith(".db")) {
    return "yane2016";
  }
  if (path.endsWith(".sbk")) {
    return "sbk";
  }
  if (path.endsWith(".ybb")) {
    return "ybb";
  }
  return "apery";
}

async function openBookOnTheFly(
  session: number,
  path: string,
  size: number,
  onProgress?: (progress: number) => void,
): Promise<void> {
  getAppLogger().info("Loading book on-the-fly: path=%s size=%d", path, size);
  const format = getFormatByPath(path);
  const common = { type: "on-the-fly", path, saved: true } as const;

  if (format === "sbk") {
    const sbkOnTheFly = await loadSbkBookOnTheFly(path, onProgress);
    replaceBook(session, {
      ...common,
      ...sbkOnTheFly,
    });
    return;
  }

  if (format === "ybb") {
    const ybbOnTheFly = await openYbbBookOnTheFly(path);
    replaceBook(session, {
      ...common,
      ...ybbOnTheFly,
    });
    return;
  }

  const file = await fs.promises.open(path, "r");
  try {
    if (format === "yane2016") {
      const ordered = await validateBookPositionOrdering(
        file.createReadStream({ autoClose: false }),
      );
      if (!ordered) {
        throw new Error("Book is not ordered by position"); // FIXME: i18n
      }
      replaceBook(session, {
        ...common,
        format: "yane2016",
        file,
        size,
        entries: new Map<string, BookEntry>(),
      });
    } else {
      replaceBook(session, {
        ...common,
        format: "apery",
        file,
        size,
        entries: new Map<bigint, BookEntry>(),
      });
    }
  } catch (e) {
    await file.close();
    throw e;
  }
}

async function openSbkBookWasm(session: number, path: string): Promise<void> {
  getAppLogger().info("Loading book with WebAssembly: path=%s", path);
  let sbkWasm: SbkWasmBook;
  try {
    sbkWasm = await SbkWasmBook.open(path);
  } catch (e) {
    if (e instanceof BookWasmCrashError) {
      // 開いていた定跡はそのまま残る
      throw new Error(t.wasmBookCrashedOnOpen, { cause: e });
    }
    throw e;
  }
  replaceBook(session, {
    type: "on-the-fly",
    backend: "wasm",
    format: "sbk",
    path,
    saved: true,
    entries: new Map<string, BookEntry>(),
    sbkWasm,
    sbkAuthor: sbkWasm.author,
    sbkDescription: sbkWasm.description,
  });
}

async function openYaneBookWasm(
  session: number,
  path: string,
  mode: "in-memory" | "on-the-fly",
): Promise<void> {
  getAppLogger().info("Loading book with WebAssembly: path=%s mode=%s", path, mode);
  let yaneWasm: YaneWasmBook;
  try {
    yaneWasm = mode === "on-the-fly" ? YaneWasmBook.open(path) : await YaneWasmBook.load(path);
  } catch (e) {
    if (e instanceof BookWasmCrashError) {
      // 開いていた定跡はそのまま残る
      throw new Error(t.wasmBookCrashedOnOpen, { cause: e });
    }
    throw e;
  }
  replaceBook(session, {
    type: mode,
    backend: "wasm",
    format: "yane2016",
    path,
    saved: true,
    entries: new Map<string, BookEntry>(),
    yaneWasm,
  });
}

// WebAssembly 版の定跡が保持している元のファイルを閉じる
function closeWasmBook(book: WasmBook): void {
  wasmInstance(book).close();
}

function openAperyBookWasm(session: number, path: string): void {
  getAppLogger().info("Loading book with WebAssembly: path=%s", path);
  let aperyWasm: AperyWasmBook;
  try {
    aperyWasm = AperyWasmBook.open(path);
  } catch (e) {
    if (e instanceof BookWasmCrashError) {
      // 開いていた定跡はそのまま残る
      throw new Error(t.wasmBookCrashedOnOpen, { cause: e });
    }
    throw e;
  }
  replaceBook(session, {
    type: "on-the-fly",
    backend: "wasm",
    format: "apery",
    path,
    saved: true,
    entries: new Map<bigint, BookEntry>(),
    aperyWasm,
  });
}

function openYbbBookWasm(session: number, path: string): void {
  getAppLogger().info("Loading book with WebAssembly: path=%s", path);
  let ybbWasm: YbbWasmBook;
  try {
    ybbWasm = YbbWasmBook.open(path);
  } catch (e) {
    if (e instanceof BookWasmCrashError) {
      // 開いていた定跡はそのまま残る
      throw new Error(t.wasmBookCrashedOnOpen, { cause: e });
    }
    throw e;
  }
  replaceBook(session, {
    type: "on-the-fly",
    backend: "wasm",
    format: "ybb",
    path,
    saved: true,
    entries: new Map<string, BookEntry>(),
    ybbWasm,
  });
}

async function openBookInMemory(session: number, path: string, size: number): Promise<void> {
  getAppLogger().info("Loading book in-memory: path=%s size=%d", path, size);
  let file: ReadStream | undefined;
  try {
    clearBook(session); // メモリ節約のため先にクリアする
    let book: Book;
    switch (getFormatByPath(path)) {
      case "yane2016":
        file = fs.createReadStream(path, "utf-8");
        book = await loadYaneuraOuBook(file);
        break;
      case "sbk":
        book = await loadSbkBook(path);
        break;
      case "ybb":
        book = await loadYbbBook(path);
        break;
      default:
        file = fs.createReadStream(path, { highWaterMark: 128 * 1024 });
        book = await loadAperyBook(file);
        break;
    }
    replaceBook(session, {
      type: "in-memory",
      path,
      saved: true,
      ...book,
    });
  } finally {
    file?.close();
  }
}

export async function openBook(
  session: number,
  path: string,
  options?: BookLoadingOptions,
  onProgress?: (progress: number) => void,
): Promise<"in-memory" | "on-the-fly"> {
  const stat = await fs.promises.lstat(path);
  if (!stat.isFile()) {
    throw new Error("Not a file: " + path);
  }

  const size = stat.size;
  const format = getFormatByPath(path);

  // SBK 形式の WebAssembly 版は常に On-the-fly モードで開く
  if (format === "sbk" && useWasm(format, options?.backend)) {
    await openSbkBookWasm(session, path);
    return "on-the-fly";
  }
  // YBB 形式と Apery 形式の WebAssembly 版も常に On-the-fly モードで開く
  if (format === "ybb" && useWasm(format, options?.backend)) {
    openYbbBookWasm(session, path);
    return "on-the-fly";
  }
  if (format === "apery" && useWasm(format, options?.backend)) {
    openAperyBookWasm(session, path);
    return "on-the-fly";
  }

  let onTheFlyThresholdMB: number | undefined;
  switch (format) {
    case "yane2016":
      onTheFlyThresholdMB = options?.yaneOnTheFlyThresholdMB;
      break;
    case "apery":
      onTheFlyThresholdMB = options?.aperyOnTheFlyThresholdMB;
      break;
    case "sbk":
      onTheFlyThresholdMB = options?.sbkOnTheFlyThresholdMB;
      break;
    case "ybb":
      onTheFlyThresholdMB = options?.ybbOnTheFlyThresholdMB;
      break;
  }

  if (
    options?.forceOnTheFly ||
    (onTheFlyThresholdMB !== undefined && size > onTheFlyThresholdMB * 1024 * 1024)
  ) {
    if (format === "yane2016" && useWasm(format, options?.backend)) {
      await openYaneBookWasm(session, path, "on-the-fly");
    } else {
      await openBookOnTheFly(session, path, size, onProgress);
    }
    return "on-the-fly";
  } else {
    if (format === "yane2016" && useWasm(format, options?.backend)) {
      await openYaneBookWasm(session, path, "in-memory");
    } else {
      await openBookInMemory(session, path, size);
    }
    return "in-memory";
  }
}

export async function openBookAsNewSession(
  path: string,
  options?: BookLoadingOptions,
): Promise<{ session: number; mode: "in-memory" | "on-the-fly" }> {
  const session = nextBookSession++;
  const mode = await openBook(session, path, options);
  return { session, mode };
}

export function closeBookSession(session: number): void {
  if (session === defaultBookSession) {
    throw new Error("Cannot close default book session");
  }
  clearBook(session);
  bookFiles.delete(session);
}

function replaceBook(session: number, newBook: BookHandle) {
  clearBook(session);
  bookFiles.set(session, newBook);
}

async function loadMergedSbkBook(book: OnTheFlyBook & { format: "sbk" }): Promise<SbkBook> {
  const fullBook = await loadSbkBook(book.rawData || book.path);
  for (const [sfen, patch] of book.entries) {
    const merged = mergeBookEntries(fullBook.entries.get(sfen), patch);
    if (merged) {
      fullBook.entries.set(sfen, merged);
    }
  }
  return fullBook;
}

export async function saveBook(
  session: number,
  path: string,
  onProgress?: (progress: number) => void,
) {
  const book = getBook(session);
  // JavaScript 版の on-the-fly の場合は上書きを禁止
  // SBK の場合は on-the-fly でもメモリにロードしているので上書きも可能であるがルールを統一しておく
  if (!isWasmBook(book) && book.type === "on-the-fly" && book.path && (await exists(path))) {
    const inputRealPath = await fs.promises.realpath(book.path);
    const outputRealPath = await fs.promises.realpath(path);
    if (inputRealPath === outputRealPath) {
      throw new Error(`${t.cannotOverwriteOnTheFlyBook} ${t.pleaseSpecifyOtherFileName}`);
    }
  }

  if (isWasmBook(book)) {
    if (!path.endsWith(bookFileExtensions[book.format])) {
      throw new Error("Invalid file extension: " + path);
    }
    // On-the-fly モードでは元のファイルを読みながら書き出すため、開いているファイルへは別の方法で上書きする
    if (
      book.type === "on-the-fly" &&
      book.path &&
      (await exists(path)) &&
      isSameFile(book.path, path)
    ) {
      await overwriteWasmBook(book, book.path, onProgress);
      return;
    }
    const file = fs.createWriteStream(path);
    // 書き出しを始める前に中断した場合も、書き込み先のエラー (開けなかった場合など) で
    // 未処理のエラーにならないようにする (書き出し中のエラーは store が受け取って投げる)
    file.on("error", () => {});
    try {
      await storeWasmBook(book, file, onProgress);
    } catch (e) {
      handleWasmCrash(book, e, path);
    } finally {
      file.close();
    }
    // in-memory モードでは元のファイルを使わないため、保存先を新たなファイルとして扱う (JavaScript 版と同じ)
    if (book.type === "in-memory") {
      book.path = path;
    }
    book.saved = true;
    return;
  }

  if (book.format === "ybb") {
    if (!path.endsWith(".ybb")) {
      throw new Error("Invalid file extension: " + path);
    }
    if (book.type === "in-memory") {
      await storeYbbBook(book.entries, path, onProgress);
    } else {
      await mergeYbbBook(book.file, book.recordCount, book.flags, book.entries, path, onProgress);
    }
    if (book.type === "in-memory") {
      book.path = path;
    }
    book.saved = true;
    return;
  }

  const file = fs.createWriteStream(path, "utf-8");
  try {
    switch (book.format) {
      case "yane2016":
        if (!path.endsWith(".db")) {
          throw new Error("Invalid file extension: " + path);
        }
        if (book.type === "in-memory") {
          await storeYaneuraOuBook(book, file);
        } else {
          const input = book.file.createReadStream({
            encoding: "utf-8",
            autoClose: false,
            start: 0,
          });
          await mergeYaneuraOuBook(input, book, file);
        }
        break;
      case "apery":
        if (!path.endsWith(".bin")) {
          throw new Error("Invalid file extension: " + path);
        }
        if (book.type === "in-memory") {
          await storeAperyBook(book, file);
        } else {
          const input = book.file.createReadStream({
            autoClose: false,
            start: 0,
            highWaterMark: 128 * 1024,
          });
          await mergeAperyBook(input, book, file);
        }
        break;
      case "sbk":
        if (!path.endsWith(".sbk")) {
          throw new Error("Invalid file extension: " + path);
        }
        await storeSbkBook(book, file, onProgress);
        break;
    }
    if (book.type === "in-memory") {
      book.path = path;
    }
    book.saved = true;
  } finally {
    file.close();
  }
}

// WebAssembly 版の定跡に編集内容を統合して書き出す
async function storeWasmBook(
  book: WasmBook,
  output: fs.WriteStream,
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (book.format === "apery") {
    await book.aperyWasm.store(book.entries, output, onProgress);
  } else {
    const wasm =
      book.format === "sbk"
        ? book.sbkWasm
        : book.format === "yane2016"
          ? book.yaneWasm
          : book.ybbWasm;
    await wasm.store(book.entries, output, onProgress);
  }
}

// WebAssembly 版の定跡の元のファイルを開き直し、インスタンスを置き換える。編集内容は変更しない。
async function reopenWasmBook(book: WasmBook, path: string): Promise<void> {
  switch (book.format) {
    case "sbk":
      book.sbkWasm = await SbkWasmBook.open(path);
      book.sbkAuthor = book.sbkWasm.author;
      book.sbkDescription = book.sbkWasm.description;
      break;
    case "yane2016":
      book.yaneWasm = YaneWasmBook.open(path);
      break;
    case "ybb":
      book.ybbWasm = YbbWasmBook.open(path);
      break;
    case "apery":
      book.aperyWasm = AperyWasmBook.open(path);
      break;
  }
}

// 定跡を閉じて空の定跡に置き換える
function discardWasmBook(book: WasmBook): void {
  for (const [session, b] of bookFiles) {
    if (b === book) {
      bookFiles.set(session, emptyBook(book.format, "wasm"));
    }
  }
}

/**
 * On-the-fly モードで開いているファイルに上書き保存する。
 * 同じフォルダーの一時ファイルに書き出してから、元のファイルを閉じて一時ファイルで置き換え、開き直す。
 * 書き出しや置き換えに失敗した場合、一時ファイルは削除し、元のファイルは変更しない。
 */
async function overwriteWasmBook(
  book: WasmBook,
  path: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  // シンボリックリンクの場合はリンク先のファイルを置き換える
  const target = await fs.promises.realpath(path);
  const { mode } = await fs.promises.stat(target);
  const tempPath = joinPath(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const removeTemp = () => fs.promises.rm(tempPath, { force: true }).catch(() => {});
  getAppLogger().info("Overwriting book: path=%s temp=%s", target, tempPath);

  // 一時ファイルに書き出す
  // 書き出し中に他のユーザーから読めないように、所有者だけが読み書きできる権限で作る
  const file = fs.createWriteStream(tempPath, { flags: "wx", mode: 0o600 });
  file.on("error", () => {});
  try {
    await storeWasmBook(book, file, onProgress);
  } catch (e) {
    await new Promise((resolve) => file.close(resolve));
    await removeTemp();
    handleWasmCrash(book, e, path, { overwrite: true });
  }
  // 置き換える前に一時ファイルを閉じ、元のファイルの権限を引き継ぐ
  await new Promise((resolve) => file.close(resolve));
  // 権限を変更できないファイルシステムでは、所有者だけが読み書きできる権限のまま置き換える
  await fs.promises.chmod(tempPath, mode & 0o7777).catch((e) => {
    getAppLogger().warn("Failed to restore the permissions of the book file: %s", e);
  });

  // 元のファイルを閉じて置き換える (Windows では開いているファイルを置き換えられないため先に閉じる)
  closeWasmBook(book);
  try {
    await fs.promises.rename(tempPath, target);
  } catch (e) {
    await removeTemp();
    // 元のファイルは変更されていないので開き直す
    try {
      await reopenWasmBook(book, path);
    } catch (reopenError) {
      getAppLogger().error("Failed to replace the book file: %s", e);
      discardWasmBook(book);
      const sentences = [t.bookFileCouldNotBeReopenedAndClosed];
      if (!book.saved) {
        sentences.push(t.unsavedBookChangesWereLost);
      }
      sentences.push(t.openedBookFileWasNotModified);
      throw new Error(joinSentences(sentences), { cause: reopenError });
    }
    throw e;
  }

  // 保存したファイルを開き直す。編集内容は保存したファイルに含まれる。
  try {
    await reopenWasmBook(book, path);
  } catch (e) {
    discardWasmBook(book);
    throw new Error(t.bookFileWasSavedButCouldNotBeReopenedAndClosed, { cause: e });
  }
  book.entries.clear();
  book.saved = true;
}

async function exportWasmBook(
  book: WasmBook,
  path: string,
  targetFormat: BookFormat,
  onProgress?: (progress: number) => void,
): Promise<void> {
  // SBK 形式・やねうら王形式・YBB 形式の間と、それらから Apery 形式へ変換できる
  // (Apery 形式からの変換は exportBook で除外している)
  let exportTo: ((output: fs.WriteStream) => Promise<void>) | undefined;
  if (book.format === "sbk") {
    const [wasm, entries] = [book.sbkWasm, book.entries];
    if (targetFormat === "yane2016") {
      exportTo = (output) => wasm.exportYane(entries, output, onProgress);
    } else if (targetFormat === "ybb") {
      exportTo = (output) => wasm.exportYbb(entries, output, onProgress);
    } else if (targetFormat === "apery") {
      exportTo = (output) => wasm.exportApery(entries, output, onProgress);
    }
  } else if (book.format === "yane2016") {
    const [wasm, entries] = [book.yaneWasm, book.entries];
    if (targetFormat === "sbk") {
      exportTo = (output) => wasm.exportSbk(entries, output, onProgress);
    } else if (targetFormat === "ybb") {
      exportTo = (output) => wasm.exportYbb(entries, output, onProgress);
    } else if (targetFormat === "apery") {
      exportTo = (output) => wasm.exportApery(entries, output, onProgress);
    }
  } else if (book.format === "ybb") {
    const [wasm, entries] = [book.ybbWasm, book.entries];
    if (targetFormat === "sbk") {
      exportTo = (output) => wasm.exportSbk(entries, output, onProgress);
    } else if (targetFormat === "yane2016") {
      exportTo = (output) => wasm.exportYane(entries, output, onProgress);
    } else if (targetFormat === "apery") {
      exportTo = (output) => wasm.exportApery(entries, output, onProgress);
    }
  }
  if (!exportTo) {
    throw new Error(`Not supported yet: converting ${book.format} books to ${targetFormat}`);
  }
  const file = fs.createWriteStream(path);
  // 書き出しを始める前に中断した場合も、書き込み先のエラーで未処理のエラーにならないようにする
  file.on("error", () => {});
  try {
    await exportTo(file);
  } catch (e) {
    handleWasmCrash(book, e, path);
  } finally {
    file.close();
  }
}

export async function exportBook(
  session: number,
  path: string,
  targetFormat: BookFormat,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const expectedExt = bookFileExtensions[targetFormat];
  if (!path.endsWith(expectedExt)) {
    throw new Error("Invalid file extension: " + path);
  }

  const book = getBook(session);

  if (book.format === targetFormat) {
    await saveBook(session, path, onProgress);
    return;
  }

  // Apery 形式は独自のハッシュ値がキーになっており局面を復元できない場合があるため
  // ShogiHome では他の形式への変換をサポートしない
  // NOTE: BookConv の場合は平手初期局面から到達可能な局面のみを変換対象としている
  if (book.format === "apery") {
    throw new Error(t.cannotConvertAperyBookToOtherFormat);
  }

  if (isWasmBook(book)) {
    await exportWasmBook(book, path, targetFormat, onProgress);
    return;
  }

  // インメモリに全てのデータを取り込む
  // 形式ごとにソートキーが異なるためストリーミングは実装コストが高い
  // メモリを多量に消費するがどうしても必要になるまでストリーミングには対応しない
  let fullBook: Book;
  if (book.type === "in-memory") {
    fullBook = book;
  } else if (book.format === "yane2016") {
    const stream = book.file.createReadStream({ encoding: "utf-8", autoClose: false, start: 0 });
    fullBook = await loadYaneuraOuBook(stream);
    for (const [sfen, patch] of book.entries) {
      const merged = mergeBookEntries(fullBook.entries.get(sfen), patch);
      if (merged) {
        fullBook.entries.set(sfen, merged);
      }
    }
  } else if (book.format === "sbk") {
    fullBook = await loadMergedSbkBook(book);
  } else if (book.format === "ybb") {
    const base = await loadYbbBookFull(book.file, book.recordCount, book.flags);
    for (const [sfen, patch] of book.entries) {
      const merged = mergeBookEntries(base.get(sfen), patch);
      if (merged) {
        base.set(sfen, merged);
      }
    }
    fullBook = { format: "ybb", entries: base };
  } else {
    throw new Error("On-the-fly mode is not supported for this book format");
  }

  if (targetFormat === "ybb") {
    await storeYbbBook(fullBook.entries as Map<string, BookEntry>, path, onProgress);
    return;
  }

  let targetBook: YaneBook | AperyBook | SbkBook;
  switch (targetFormat) {
    case "yane2016":
      targetBook = { format: "yane2016", entries: fullBook.entries as Map<string, BookEntry> };
      break;
    case "apery": {
      const aperyEntries = new Map<bigint, BookEntry>();
      for (const [sfen, entry] of fullBook.entries as Map<string, BookEntry>) {
        aperyEntries.set(aperyHash(sfen), entry);
      }
      targetBook = { format: "apery", entries: aperyEntries };
      break;
    }
    case "sbk":
      targetBook = {
        format: "sbk",
        entries: fullBook.entries as Map<string, BookEntry>,
        sbkAuthor: fullBook.format === "sbk" ? fullBook.sbkAuthor : undefined,
        sbkDescription: fullBook.format === "sbk" ? fullBook.sbkDescription : undefined,
      };
      break;
  }

  const file = fs.createWriteStream(path);
  try {
    switch (targetBook.format) {
      case "yane2016":
        await storeYaneuraOuBook(targetBook, file);
        break;
      case "apery":
        await storeAperyBook(targetBook, file);
        break;
      case "sbk":
        await storeSbkBook(targetBook, file, onProgress);
        break;
    }
  } finally {
    file.close();
  }
}

export function clearBook(session: number, format?: BookFormat, backend?: BookBackend): void {
  const book = bookFiles.get(session);
  if (!book) {
    return;
  }
  if (isWasmBook(book)) {
    closeWasmBook(book);
  } else if (book.type === "on-the-fly" && book.format !== "sbk") {
    if ("file" in book) {
      book.file.close();
    }
  }
  bookFiles.set(session, emptyBook(format, backend));
}

export async function searchBookMoves(session: number, sfen: string): Promise<BookMove[]> {
  const book = getBook(session);
  const entry = await retrieveMergedEntry(book, sfen);
  return entry ? entry.moves : [];
}

export async function searchBookEntry(
  session: number,
  sfen: string,
): Promise<BookPositionEntry | null> {
  const book = getBook(session);
  const entry = await retrieveMergedEntry(book, sfen);
  if (!entry) {
    return null;
  }
  return {
    moves: entry.moves,
    comment: entry.comment,
    minPly: entry.minPly,
    games: entry.games,
    wonBlack: entry.wonBlack,
    wonWhite: entry.wonWhite,
    sbkEvals: entry.sbkEvals?.map((e) => ({
      evaluationValue: e.EvaluationValue,
      depth: e.Depth,
      selDepth: e.SelDepth,
      nodes: e.Nodes.toString(),
      variation: e.Variation,
      engineName: e.EngineName,
    })),
  };
}

export async function updateBookPositionComment(session: number, sfen: string, comment: string) {
  const book = getBook(session);
  if (book.format === "apery" || book.format === "ybb") {
    throw new Error("Position comment is not supported by the current book format");
  }
  const entry = await retrieveMergedEntry(book, sfen);
  if (entry) {
    entry.comment = comment || undefined;
    storeEntry(book, sfen, entry);
  } else if (comment) {
    storeEntry(book, sfen, { type: "normal", moves: [], comment });
  }
}

function updateBookEntry(entry: BookEntry, move: BookMove): void {
  for (let i = 0; i < entry.moves.length; i++) {
    if (entry.moves[i].usi === move.usi) {
      entry.moves[i] = move;
      return;
    }
  }
  entry.moves.push(move);
}

export async function updateBookMove(session: number, sfen: string, move: BookMove) {
  const book = getBook(session);
  applyFormatDefaults(book.format, move);
  const entry = await retrieveMergedEntry(book, sfen);
  if (book.format === "yane2016" || book.format === "sbk" || book.format === "ybb") {
    if (entry) {
      updateBookEntry(entry, move);
      book.entries.set(sfen, entry);
    } else {
      book.entries.set(sfen, {
        type: "normal",
        moves: [move],
      });
    }
  } else {
    const sanitizedMove: BookMove = {
      usi: move.usi,
    };
    if (move.score !== undefined) {
      sanitizedMove.score = move.score;
    }
    if (move.count !== undefined) {
      sanitizedMove.count = move.count;
    }
    const hash = aperyHash(sfen);
    if (entry) {
      updateBookEntry(entry, sanitizedMove);
      book.entries.set(hash, entry);
    } else {
      book.entries.set(hash, {
        type: "normal",
        moves: [sanitizedMove],
      });
    }
  }
  book.saved = false;
}

export async function removeBookMove(session: number, sfen: string, usi: string) {
  const book = getBook(session);
  const entry = await retrieveMergedEntry(book, sfen);
  if (!entry) {
    return;
  }
  entry.moves = entry.moves.filter((move) => move.usi !== usi);
  storeEntry(book, sfen, entry);
}

export async function updateBookMoveOrder(
  session: number,
  sfen: string,
  usi: string,
  order: number,
) {
  const book = getBook(session);
  const entry = await retrieveMergedEntry(book, sfen);
  if (!entry) {
    return;
  }
  const move = entry.moves.find((move) => move.usi === usi);
  if (!move) {
    return;
  }
  entry.moves = entry.moves.filter((move) => move.usi !== usi);
  entry.moves.splice(order, 0, move);
  storeEntry(book, sfen, entry);
}

function applyFormatDefaults(format: BookFormat, move: BookMove): void {
  if (format === "apery" || format === "ybb") {
    if (move.score === undefined) {
      move.score = 0;
    }
  }
  if (format === "apery") {
    if (move.count === undefined) {
      move.count = 0;
    }
  }
}

function updateBookMovePatch(book: BookHandle, sfen: string, move: BookMove) {
  applyFormatDefaults(book.format, move);
  let entry = retrieveEntry(book, sfen);
  if (book.format === "yane2016" || book.format === "sbk" || book.format === "ybb") {
    if (entry) {
      updateBookEntry(entry, move);
    } else {
      entry = {
        type: book.type === "in-memory" ? "normal" : "patch",
        moves: [move],
      };
      book.entries.set(sfen, entry);
    }
  } else {
    const sanitizedMove: BookMove = {
      usi: move.usi,
    };
    if (move.score !== undefined) {
      sanitizedMove.score = move.score;
    }
    if (move.count !== undefined) {
      sanitizedMove.count = move.count;
    }
    const hash = aperyHash(sfen);
    if (entry) {
      updateBookEntry(entry, sanitizedMove);
    } else {
      entry = {
        type: book.type === "in-memory" ? "normal" : "patch",
        moves: [sanitizedMove],
      };
      book.entries.set(hash, entry);
    }
  }
  entry.moves.sort((a, b) => (b.count || 0) - (a.count || 0));
  book.saved = false;
}

// 棋譜の終端ノードから勝者を判定する。
// 引き分けや不明な場合は undefined を返す。
function getRecordWinner(node: ImmutableNode): Color | undefined {
  let lastNode = node;
  while (lastNode.next) {
    lastNode = lastNode.next;
  }
  const lastMove = lastNode.move;
  if (lastMove instanceof Move) {
    return undefined;
  }
  switch (lastMove.type) {
    case SpecialMoveType.FOUL_WIN:
    case SpecialMoveType.ENTERING_OF_KING:
      return lastNode.nextColor;
    case SpecialMoveType.RESIGN:
    case SpecialMoveType.MATE:
    case SpecialMoveType.TIMEOUT:
    case SpecialMoveType.FOUL_LOSE:
    case SpecialMoveType.TRY:
      return reverseColor(lastNode.nextColor);
    default:
      return undefined;
  }
}

export async function importBookMoves(
  session: number,
  settings: BookImportSettings,
  onProgress?: (progress: number) => void,
): Promise<BookImportSummary> {
  getAppLogger().info("Importing book moves: %s", JSON.stringify(settings));

  const book = getBook(session);

  const appSettings = await loadAppSettings();

  let paths: string[];
  switch (settings.sourceType) {
    case SourceType.FILE:
      if (!settings.sourceRecordFile) {
        throw new Error("source record file is not set");
      }
      if (!detectRecordFileFormatByPath(settings.sourceRecordFile)) {
        throw new Error("unknown file format: " + settings.sourceRecordFile);
      }
      if (!(await exists(settings.sourceRecordFile))) {
        throw new Error(t.fileNotFound(settings.sourceRecordFile));
      }
      paths = [settings.sourceRecordFile];
      break;
    case SourceType.DIRECTORY:
      if (!settings.sourceDirectory) {
        throw new Error("source directory is not set");
      }
      if (!(await exists(settings.sourceDirectory))) {
        throw new Error(t.directoryNotFound(settings.sourceDirectory));
      }
      paths = await listFiles(settings.sourceDirectory, Infinity);
      paths = paths.filter(detectRecordFileFormatByPath);
      break;
    default:
      throw new Error("invalid source type");
  }

  let successFileCount = 0;
  let errorFileCount = 0;
  let skippedFileCount = 0;
  let entryCount = 0;
  let duplicateCount = 0;

  function importMove(node: ImmutableNode, sfen: string, winner: Color | undefined) {
    if (!(node.move instanceof Move)) {
      return;
    }

    // criteria
    if (node.ply < settings.minPly || node.ply > settings.maxPly) {
      return;
    }

    const usi = node.move.usi;
    const bookMoves = retrieveEntry(book, sfen)?.moves || [];
    const existing = bookMoves.find((move) => move.usi === usi);
    if (existing) {
      duplicateCount++;
    } else {
      entryCount++;
    }
    const bookMove = existing || { usi, comment: "" };
    bookMove.count = (bookMove.count || 0) + 1;

    if (settings.importScore && node.comment) {
      const customData = parseComment(node.comment);
      // parseComment は先手基準の評価値を返すので手番視点に変換する
      const sign = node.move.color === Color.WHITE ? -1 : 1;
      // 評価値を持つ候補のうち既存より読みが深いもので bookMove を更新する
      for (const info of [
        customData.playerSearchInfo,
        customData.opponentSearchInfo,
        customData.researchInfo,
        customData.researchInfo2,
        customData.researchInfo3,
        customData.researchInfo4,
      ]) {
        if (info?.score === undefined && info?.mate === undefined) {
          continue;
        }
        if (bookMove.score === undefined || (info.depth ?? -1) > (bookMove.depth ?? -1)) {
          bookMove.score =
            info.mate !== undefined ? (info.mate > 0 ? 32000 : -32000) * sign : info.score! * sign;
          bookMove.depth = info.depth;
        }
      }
    }

    updateBookMovePatch(book, sfen, bookMove);

    const entry = retrieveEntry(book, sfen);
    if (entry) {
      const ply = node.ply;
      if (entry.minPly === undefined || ply < entry.minPly) {
        entry.minPly = ply;
      }
      if (book.format === "sbk") {
        entry.games = (entry.games ?? 0) + 1;
        if (winner === Color.BLACK) {
          entry.wonBlack = (entry.wonBlack ?? 0) + 1;
        } else if (winner === Color.WHITE) {
          entry.wonWhite = (entry.wonWhite ?? 0) + 1;
        }
      }
    }
  }

  for (const path of paths) {
    if (onProgress) {
      const progress = (successFileCount + errorFileCount + skippedFileCount) / paths.length;
      onProgress(progress);
    }

    const targetColorSet = {
      [Color.BLACK]: true,
      [Color.WHITE]: true,
    };
    switch (settings.playerCriteria) {
      case PlayerCriteria.BLACK:
        targetColorSet[Color.WHITE] = false;
        break;
      case PlayerCriteria.WHITE:
        targetColorSet[Color.BLACK] = false;
        break;
    }

    getAppLogger().debug("Importing book moves from: %s", path);
    const format = detectRecordFileFormatByPath(path) as RecordFileFormat;
    const sourceData = await fs.promises.readFile(path);

    if (format === RecordFileFormat.SFEN) {
      if (settings.playerCriteria === PlayerCriteria.FILTER_BY_NAME && settings.playerName) {
        getAppLogger().debug("Ignoring SFEN file: %s", path);
        skippedFileCount++;
        continue; // skip SFEN files when filtering by player name
      }
      const lines = sourceData.toString("utf-8").split(/\r?\n/);
      let hasValidLines = false;
      let invalidLine = "";
      for (let index = 0; index < lines.length; index++) {
        if (onProgress) {
          const progress =
            (successFileCount + errorFileCount + skippedFileCount + index / lines.length) /
            paths.length;
          onProgress(progress);
        }
        const line = lines[index];
        const record = Record.newByUSI(line.trim());
        if (record instanceof Error) {
          invalidLine = line;
          continue;
        }
        hasValidLines = true;
        let winner: Color | undefined;
        let lastPly = Infinity;
        record.forEach((node) => {
          if (node.ply <= lastPly) {
            winner = getRecordWinner(node);
          }
          lastPly = node.ply;
          const prev = node.prev;
          if (prev && targetColorSet[prev.nextColor]) {
            importMove(node, prev.sfen, winner);
          }
        });
      }
      if (hasValidLines) {
        successFileCount++;
      } else if (invalidLine) {
        getAppLogger().debug("Invalid lines found in SFEN file: %s: [%s]", path, invalidLine);
        errorFileCount++;
      } else {
        getAppLogger().debug("No valid lines found in SFEN file: %s", path);
        skippedFileCount++;
      }
      continue;
    }

    const record = importRecordFromBuffer(sourceData, format, {
      autoDetect: appSettings.textDecodingRule === TextDecodingRule.AUTO_DETECT,
    });
    if (record instanceof Error) {
      getAppLogger().debug("Failed to import book moves from: %s: %s", path, record);
      errorFileCount++;
      continue;
    }

    if (settings.playerCriteria === PlayerCriteria.FILTER_BY_NAME) {
      const blackPlayerName = getBlackPlayerName(record.metadata)?.toLowerCase();
      const whitePlayerName = getWhitePlayerName(record.metadata)?.toLowerCase();
      if (!settings.playerName) {
        throw new Error("player name is not set");
      }
      if (!blackPlayerName || blackPlayerName?.indexOf(settings.playerName.toLowerCase()) === -1) {
        targetColorSet[Color.BLACK] = false;
      }
      if (!whitePlayerName || whitePlayerName?.indexOf(settings.playerName.toLowerCase()) === -1) {
        targetColorSet[Color.WHITE] = false;
      }
    }

    let winner: Color | undefined;
    let lastPly = Infinity;
    record.forEach((node) => {
      if (node.ply <= lastPly) {
        winner = getRecordWinner(node);
      }
      lastPly = node.ply;
      const prev = node.prev;
      if (prev && targetColorSet[prev.nextColor]) {
        importMove(node, prev.sfen, winner);
      }
    });
    successFileCount++;
  }

  if (book.type === "in-memory") {
    return {
      successFileCount,
      errorFileCount,
      skippedFileCount,
      entryCount,
      duplicateCount,
    };
  }
  return {
    successFileCount,
    errorFileCount,
    skippedFileCount,
  };
}
