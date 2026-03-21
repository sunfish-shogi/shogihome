import fs, { ReadStream } from "node:fs";
import {
  BookFormat,
  BookImportSummary,
  BookLoadingOptions,
  BookMove,
  defaultBookSession,
} from "@/common/book.js";
import { getAppLogger } from "@/background/log.js";
import {
  AperyBook,
  arrayMoveToCommonBookMove,
  Book,
  BookEntry,
  commonBookMoveToArray,
  IDX_COUNT,
  IDX_USI,
  mergeBookEntries,
  SbkBook,
  YaneBook,
} from "./types.js";
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
import { hash as aperyHash } from "./apery_zobrist.js";
import {
  loadAperyBook,
  mergeAperyBook,
  searchAperyBookMovesOnTheFly,
  storeAperyBook,
} from "./apery.js";
import { loadSbkBook, storeSbkBook } from "./sbk.js";

type BookHandle = InMemoryBook | OnTheFlyBook;

type InMemoryBook = Book & {
  type: "in-memory";
  path?: string;
  saved: boolean;
};

type OnTheFlyBook = Book & {
  type: "on-the-fly";
  path: string;
  file: fs.promises.FileHandle;
  size: number;
  saved: boolean;
};

// マージ済みのエントリーを取得する。
async function retrieveMergedEntry(book: BookHandle, sfen: string): Promise<BookEntry | undefined> {
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
    case "sbk":
      return book.entries.get(sfen);
  }
}

// メモリ上のエントリーを取得する。返されたエントリーを更新した場合に book に反映されることを保証する。
function retrieveEntry(book: BookHandle, sfen: string): BookEntry | undefined {
  switch (book.format) {
    case "yane2016":
    case "sbk":
      return book.entries.get(sfen);
    case "apery":
      return book.entries.get(aperyHash(sfen));
  }
}

function storeEntry(book: BookHandle, sfen: string, entry: BookEntry): void {
  switch (book.format) {
    case "yane2016":
    case "sbk":
      book.entries.set(sfen, entry);
      break;
    case "apery":
      book.entries.set(aperyHash(sfen), entry);
      break;
  }
  book.saved = false;
}

function emptyBook(format: BookFormat = "yane2016"): BookHandle {
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

export type BookInfo = {
  format: BookFormat;
  type: "in-memory" | "on-the-fly";
  path?: string;
  entryCount?: number;
  unsaved: boolean;
};

export function getBookInfo(session: number): BookInfo {
  const book = getBook(session);
  return {
    format: book.format,
    type: book.type,
    path: book.path,
    entryCount: book.type === "in-memory" ? book.entries.size : undefined,
    unsaved: !book.saved,
  };
}

export function getBookFormat(session: number): BookFormat {
  const book = getBook(session);
  return book.format;
}

function getFormatByPath(path: string): "yane2016" | "apery" | "sbk" {
  if (path.endsWith(".db")) {
    return "yane2016";
  }
  if (path.endsWith(".sbk")) {
    return "sbk";
  }
  return "apery";
}

async function openBookOnTheFly(session: number, path: string, size: number): Promise<void> {
  getAppLogger().info("Loading book on-the-fly: path=%s size=%d", path, size);
  const format = getFormatByPath(path);
  if (format === "sbk") {
    throw new Error("SBK format does not support on-the-fly loading");
  }
  const file = await fs.promises.open(path, "r");
  try {
    if (
      format === "yane2016" &&
      !(await validateBookPositionOrdering(file.createReadStream({ autoClose: false })))
    ) {
      throw new Error("Book is not ordered by position"); // FIXME: i18n
    }
  } catch (e) {
    await file.close();
    throw e;
  }
  const common = { path, file, size, saved: true };
  if (format === "yane2016") {
    replaceBook(session, {
      ...common,
      type: "on-the-fly",
      format: "yane2016",
      entries: new Map<string, BookEntry>(),
    });
  } else {
    replaceBook(session, {
      ...common,
      type: "on-the-fly",
      format: "apery",
      entries: new Map<bigint, BookEntry>(),
    });
  }
}

async function openBookInMemory(session: number, path: string, size: number): Promise<void> {
  getAppLogger().info("Loading book in-memory: path=%s size=%d", path, size);
  let file: ReadStream | undefined;
  try {
    let book: Book;
    switch (getFormatByPath(path)) {
      case "yane2016":
        file = fs.createReadStream(path, "utf-8");
        book = await loadYaneuraOuBook(file);
        break;
      case "sbk": {
        const data = await fs.promises.readFile(path);
        book = loadSbkBook(data);
        break;
      }
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
): Promise<"in-memory" | "on-the-fly"> {
  const stat = await fs.promises.lstat(path);
  if (!stat.isFile()) {
    throw new Error("Not a file: " + path);
  }

  const size = stat.size;
  if (
    getFormatByPath(path) !== "sbk" &&
    (options?.forceOnTheFly ||
      (options?.onTheFlyThresholdMB !== undefined &&
        size > options.onTheFlyThresholdMB * 1024 * 1024))
  ) {
    await openBookOnTheFly(session, path, size);
    return "on-the-fly";
  } else {
    await openBookInMemory(session, path, size);
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

export async function saveBook(session: number, path: string) {
  const book = getBook(session);
  // on-the-fly の場合は上書きを禁止
  if (book.type === "on-the-fly" && (await exists(path))) {
    const inputRealPath = await fs.promises.realpath(book.path);
    const outputRealPath = await fs.promises.realpath(path);
    if (inputRealPath === outputRealPath) {
      throw new Error(`${t.cannotOverwriteOnTheFlyBook} ${t.pleaseSpecifyOtherFileName}`);
    }
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
        await storeSbkBook(book, file);
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

export async function exportBook(
  session: number,
  path: string,
  targetFormat: BookFormat,
): Promise<void> {
  const expectedExt =
    targetFormat === "yane2016" ? ".db" : targetFormat === "apery" ? ".bin" : ".sbk";
  if (!path.endsWith(expectedExt)) {
    throw new Error("Invalid file extension: " + path);
  }

  const book = getBook(session);

  if (book.format === targetFormat) {
    await saveBook(session, path);
    return;
  }

  if (book.format === "apery") {
    throw new Error(t.cannotConvertAperyBookToOtherFormat);
  }

  // Build a fully merged in-memory book
  let fullBook: Book;
  if (book.type === "in-memory") {
    fullBook = book;
  } else if (book.format === "yane2016") {
    const stream = book.file.createReadStream({ encoding: "utf-8", autoClose: false, start: 0 });
    const base = await loadYaneuraOuBook(stream);
    for (const [sfen, patch] of book.entries) {
      const merged = mergeBookEntries(base.entries.get(sfen), patch);
      if (merged) {
        base.entries.set(sfen, merged);
      }
    }
    fullBook = base;
  } else {
    throw new Error("On-the-fly mode is not supported for this book format");
  }

  // fullBook is yane2016 or sbk — both are SFEN-keyed
  let targetBook: YaneBook | AperyBook | SbkBook;
  switch (targetFormat) {
    case "yane2016":
      targetBook = { format: "yane2016", entries: fullBook.entries };
      break;
    case "apery": {
      const aperyEntries = new Map<bigint, BookEntry>();
      for (const [sfen, entry] of fullBook.entries) {
        aperyEntries.set(aperyHash(sfen), entry);
      }
      targetBook = { format: "apery", entries: aperyEntries };
      break;
    }
    case "sbk":
      targetBook = { format: "sbk", entries: fullBook.entries };
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
        await storeSbkBook(targetBook, file);
        break;
    }
  } finally {
    file.close();
  }
}

export function clearBook(session: number, format?: BookFormat): void {
  const book = bookFiles.get(session);
  if (!book) {
    return;
  }
  if (book.type === "on-the-fly") {
    book.file.close();
  }
  bookFiles.set(session, emptyBook(format));
}

export async function searchBookMoves(session: number, sfen: string): Promise<BookMove[]> {
  const book = getBook(session);
  const entry = await retrieveMergedEntry(book, sfen);
  return entry ? entry.moves.map(arrayMoveToCommonBookMove) : [];
}

function updateBookEntry(entry: BookEntry, move: BookMove): void {
  for (let i = 0; i < entry.moves.length; i++) {
    if (entry.moves[i][IDX_USI] === move.usi) {
      entry.moves[i] = commonBookMoveToArray(move);
      return;
    }
  }
  entry.moves.push(commonBookMoveToArray(move));
}

export async function updateBookMove(session: number, sfen: string, move: BookMove) {
  const book = getBook(session);
  const entry = await retrieveMergedEntry(book, sfen);
  if (book.format === "yane2016" || book.format === "sbk") {
    if (entry) {
      updateBookEntry(entry, move);
      book.entries.set(sfen, entry);
    } else {
      book.entries.set(sfen, {
        type: "normal",
        comment: "",
        moves: [commonBookMoveToArray(move)],
        minPly: 0,
      });
    }
  } else {
    const sanitizedMove = {
      score: 0, // required for Apery book
      count: 0, // required for Apery book
      ...move,
      comment: "", // not supported
    };
    delete sanitizedMove.usi2; // not supported
    delete sanitizedMove.depth; // not supported
    const hash = aperyHash(sfen);
    if (entry) {
      updateBookEntry(entry, sanitizedMove);
      book.entries.set(hash, entry);
    } else {
      book.entries.set(hash, {
        type: "normal",
        comment: "",
        moves: [commonBookMoveToArray(sanitizedMove)],
        minPly: 0,
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
  entry.moves = entry.moves.filter((move) => move[IDX_USI] !== usi);
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
  const move = entry.moves.find((move) => move[IDX_USI] === usi);
  if (!move) {
    return;
  }
  entry.moves = entry.moves.filter((move) => move[IDX_USI] !== usi);
  entry.moves.splice(order, 0, move);
  storeEntry(book, sfen, entry);
}

function updateBookMovePatch(book: BookHandle, sfen: string, move: BookMove) {
  let entry = retrieveEntry(book, sfen);
  if (book.format === "yane2016" || book.format === "sbk") {
    if (entry) {
      updateBookEntry(entry, move);
    } else {
      entry = {
        type: book.type === "in-memory" ? "normal" : "patch",
        comment: "",
        moves: [commonBookMoveToArray(move)],
        minPly: 0,
      };
      book.entries.set(sfen, entry);
    }
  } else {
    const sanitizedMove = {
      score: 0, // required for Apery book
      count: 0, // required for Apery book
      ...move,
      comment: "", // not supported
    };
    delete sanitizedMove.usi2; // not supported
    delete sanitizedMove.depth; // not supported
    const hash = aperyHash(sfen);
    if (entry) {
      updateBookEntry(entry, sanitizedMove);
    } else {
      entry = {
        type: book.type === "in-memory" ? "normal" : "patch",
        comment: "",
        moves: [commonBookMoveToArray(sanitizedMove)],
        minPly: 0,
      };
      book.entries.set(hash, entry);
    }
  }
  entry.moves.sort((a, b) => (b[IDX_COUNT] || 0) - (a[IDX_COUNT] || 0));
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
    const bookMoves = (retrieveEntry(book, sfen)?.moves || []).map(arrayMoveToCommonBookMove);
    const existing = bookMoves.find((move) => move.usi === usi);
    if (existing) {
      duplicateCount++;
    } else {
      entryCount++;
    }
    const bookMove = existing || { usi, comment: "" };
    bookMove.count = (bookMove.count || 0) + 1;
    updateBookMovePatch(book, sfen, bookMove);

    if (book.format === "sbk") {
      const entry = retrieveEntry(book, sfen);
      if (entry) {
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
