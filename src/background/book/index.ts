import fs, { ReadStream } from "node:fs";
import { BookImportSummary, BookLoadingMode, BookLoadingOptions, BookMove } from "@/common/book.js";
import { getAppLogger } from "@/background/log.js";
import {
  arrayMoveToCommonBookMove,
  Book,
  BookEntry,
  BookFormat,
  commonBookMoveToArray,
  IDX_COUNT,
  IDX_USI,
  mergeBookEntries,
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
} from "tsshogi";
import { t } from "@/common/i18n/index.js";
import { hash as aperyHash } from "./apery_zobrist.js";
import {
  loadAperyBook,
  mergeAperyBook,
  searchAperyBookMovesOnTheFly,
  storeAperyBook,
} from "./apery.js";

type BookHandle = InMemoryBook | OnTheFlyBook;

type InMemoryBook = Book & {
  type: "in-memory";
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
  }
}

// メモリ上のエントリーを取得する。返されたエントリーを更新した場合に book に反映されることを保証する。
function retrieveEntry(book: BookHandle, sfen: string): BookEntry | undefined {
  switch (book.format) {
    case "yane2016":
      return book.entries.get(sfen);
    case "apery":
      return book.entries.get(aperyHash(sfen));
  }
}

function storeEntry(sfen: string, entry: BookEntry): void {
  switch (book.format) {
    case "yane2016":
      book.entries.set(sfen, entry);
      break;
    case "apery":
      book.entries.set(aperyHash(sfen), entry);
      break;
  }
  book.saved = false;
}

function emptyBook(): BookHandle {
  return {
    type: "in-memory",
    format: "yane2016",
    entries: new Map<string, BookEntry>(),
    saved: true,
  };
}

let book: BookHandle = emptyBook();

export function isBookUnsaved(): boolean {
  return book.type === "in-memory" && !book.saved;
}

export function getBookFormat(): BookFormat {
  return book.format;
}

function getFormatByPath(path: string): "yane2016" | "apery" {
  return path.endsWith(".db") ? "yane2016" : "apery";
}

async function openBookOnTheFly(path: string, size: number): Promise<void> {
  getAppLogger().info("Loading book on-the-fly: path=%s size=%d", path, size);
  const format = getFormatByPath(path);
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
    replaceBook({
      ...common,
      type: "on-the-fly",
      format: "yane2016",
      entries: new Map<string, BookEntry>(),
    });
  } else {
    replaceBook({
      ...common,
      type: "on-the-fly",
      format: "apery",
      entries: new Map<bigint, BookEntry>(),
    });
  }
}

async function openBookInMemory(path: string, size: number): Promise<void> {
  getAppLogger().info("Loading book in-memory: path=%s size=%d", path, size);
  let file: ReadStream | undefined;
  try {
    let book: Book;
    switch (getFormatByPath(path)) {
      case "yane2016":
        file = fs.createReadStream(path, "utf-8");
        book = await loadYaneuraOuBook(file);
        break;
      case "apery":
        file = fs.createReadStream(path, { highWaterMark: 128 * 1024 });
        book = await loadAperyBook(file);
        break;
    }
    replaceBook({
      type: "in-memory",
      saved: true,
      ...book,
    });
  } finally {
    file?.close();
  }
}

export async function openBook(
  path: string,
  options?: BookLoadingOptions,
): Promise<BookLoadingMode> {
  const stat = await fs.promises.lstat(path);
  if (!stat.isFile()) {
    throw new Error("Not a file: " + path);
  }

  const size = stat.size;
  if (
    options?.onTheFlyThresholdMB !== undefined &&
    size > options.onTheFlyThresholdMB * 1024 * 1024
  ) {
    await openBookOnTheFly(path, size);
    return "on-the-fly";
  } else {
    await openBookInMemory(path, size);
    return "in-memory";
  }
}

function replaceBook(newBook: BookHandle) {
  clearBook();
  book = newBook;
}

export async function saveBook(path: string) {
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
    }
    book.saved = true;
  } finally {
    file.close();
  }
}

export function clearBook(): void {
  if (book.type === "on-the-fly") {
    book.file.close();
  }
  book = emptyBook();
}

export async function searchBookMoves(sfen: string): Promise<BookMove[]> {
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

export async function updateBookMove(sfen: string, move: BookMove) {
  const entry = await retrieveMergedEntry(book, sfen);
  if (book.format === "yane2016") {
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

export async function removeBookMove(sfen: string, usi: string) {
  const entry = await retrieveMergedEntry(book, sfen);
  if (!entry) {
    return;
  }
  entry.moves = entry.moves.filter((move) => move[IDX_USI] !== usi);
  storeEntry(sfen, entry);
}

export async function updateBookMoveOrder(sfen: string, usi: string, order: number) {
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
  storeEntry(sfen, entry);
}

function updateBookMovePatch(sfen: string, move: BookMove) {
  let entry = retrieveEntry(book, sfen);
  if (book.format === "yane2016") {
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

export async function importBookMoves(
  settings: BookImportSettings,
  onProgress?: (progress: number) => void,
): Promise<BookImportSummary> {
  getAppLogger().info("Importing book moves: %s", JSON.stringify(settings));

  // 非同期処理のために参照を複製する
  const bookRef = book;

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

  function importMove(node: ImmutableNode, sfen: string) {
    if (!(node.move instanceof Move)) {
      return;
    }

    // criteria
    if (node.ply < settings.minPly || node.ply > settings.maxPly) {
      return;
    }

    const usi = node.move.usi;
    const entry = retrieveEntry(bookRef, sfen);
    const bookMoves = entry?.moves || [];
    const moves = bookMoves.map(arrayMoveToCommonBookMove);
    const existing = moves.find((move) => move.usi === usi);
    if (existing) {
      duplicateCount++;
    } else {
      entryCount++;
    }
    const bookMove = existing || { usi, comment: "" };
    bookMove.count = (bookMove.count || 0) + 1;
    updateBookMovePatch(sfen, bookMove);
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
        record.forEach((node) => {
          const prev = node.prev;
          if (prev && targetColorSet[prev.nextColor]) {
            importMove(node, prev.sfen);
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

    record.forEach((node) => {
      const prev = node.prev;
      if (prev && targetColorSet[prev.nextColor]) {
        importMove(node, prev.sfen);
      }
    });
    successFileCount++;
  }

  if (bookRef.type === "in-memory") {
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
