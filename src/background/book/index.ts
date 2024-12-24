import fs from "node:fs";
import { BookImportSummary, BookLoadingMode, BookLoadingOptions, BookMove } from "@/common/book";
import { getAppLogger } from "@/background/log";
import {
  arrayMoveToCommonBookMove,
  Book,
  commonBookMoveToArray,
  IDX_COUNT,
  IDX_USI,
} from "./types";
import {
  loadYaneuraOuBook,
  searchBookMovesOnTheFly,
  storeYaneuraOuBook,
  validateBookPositionOrdering,
} from "./yaneuraou";
import { BookImportSettings, PlayerCriteria, SourceType } from "@/common/settings/book";
import { exists, listFiles } from "@/background/helpers/file";
import {
  detectRecordFileFormatByPath,
  importRecordFromBuffer,
  RecordFileFormat,
} from "@/common/file/record";
import { TextDecodingRule } from "@/common/settings/app";
import { loadAppSettings } from "@/background/settings";
import { Color, getBlackPlayerName, getWhitePlayerName, Move } from "tsshogi";
import { t } from "@/common/i18n";

type BookHandle = InMemoryBook | OnTheFlyBook;

type InMemoryBook = Book & {
  type: "in-memory";
  saved: boolean;
};

type OnTheFlyBook = {
  type: "on-the-fly";
  file: fs.promises.FileHandle;
  size: number;
};

function emptyBook(): BookHandle {
  return {
    type: "in-memory",
    entries: {},
    entryCount: 0,
    duplicateCount: 0,
    saved: true,
  };
}

let book: BookHandle = emptyBook();

export function isBookUnsaved(): boolean {
  return book.type === "in-memory" && !book.saved;
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
  if (options && size > options.onTheFlyThresholdMB * 1024 * 1024) {
    getAppLogger().info("Loading book on-the-fly: path=%s size=%d", path, size);
    const file = await fs.promises.open(path, "r");
    if (!(await validateBookPositionOrdering(file.createReadStream({ autoClose: false })))) {
      file.close();
      throw new Error("Book is not ordered by position"); // FIXME: i18n
    }
    return replaceBook({
      type: "on-the-fly",
      file,
      size,
    }).type;
  } else {
    getAppLogger().info("Loading book in-memory: path=%s size=%d", path, size);
    const file = fs.createReadStream(path, "utf-8");
    return replaceBook({
      type: "in-memory",
      saved: true,
      ...(await loadYaneuraOuBook(file)),
    }).type;
  }
}

function replaceBook(newBook: BookHandle): BookHandle {
  clearBook();
  book = newBook;
  if (book.type === "in-memory") {
    if (book.duplicateCount) {
      getAppLogger().warn("Duplicated entries: %d", book.duplicateCount);
    }
    getAppLogger().info("Loaded book with %d entries", book.entryCount);
  }
  return book;
}

export async function saveBook(path: string) {
  if (book.type === "on-the-fly") {
    throw new Error("Cannot save on-the-fly book");
  }
  const file = fs.createWriteStream(path, "utf-8");
  try {
    book.saved = true;
    await storeYaneuraOuBook(book, file);
  } catch (e) {
    file.close();
    book.saved = false;
    throw e;
  }
}

export function clearBook(): void {
  if (book.type === "on-the-fly") {
    book.file.close();
  }
  book = emptyBook();
}

export async function searchBookMoves(sfen: string): Promise<BookMove[]> {
  if (book.type === "in-memory") {
    const moves = book.entries[sfen]?.moves || [];
    return moves.map(arrayMoveToCommonBookMove);
  } else {
    const moves = await searchBookMovesOnTheFly(sfen, book.file, book.size);
    return moves.map(arrayMoveToCommonBookMove);
  }
}

export function updateBookMove(sfen: string, move: BookMove): void {
  if (book.type === "on-the-fly") {
    return;
  }
  book.saved = false;
  const entry = book.entries[sfen];
  if (entry) {
    for (let i = 0; i < entry.moves.length; i++) {
      if (entry.moves[i][IDX_USI] === move.usi) {
        entry.moves[i] = commonBookMoveToArray(move);
        return;
      }
    }
    entry.moves.push(commonBookMoveToArray(move));
  } else {
    book.entries[sfen] = {
      comment: "",
      moves: [commonBookMoveToArray(move)],
      minPly: 0,
    };
    book.entryCount++;
  }
}

export function removeBookMove(sfen: string, usi: string): void {
  if (book.type === "on-the-fly") {
    return;
  }
  const entry = book.entries[sfen];
  if (!entry) {
    return;
  }
  entry.moves = entry.moves.filter((move) => move[IDX_USI] !== usi);
  book.saved = false;
}

export function updateBookMoveOrder(sfen: string, usi: string, order: number): void {
  if (book.type === "on-the-fly") {
    return;
  }
  const entry = book.entries[sfen];
  if (!entry) {
    return;
  }
  const move = entry.moves.find((move) => move[IDX_USI] === usi);
  if (!move) {
    return;
  }
  entry.moves = entry.moves.filter((move) => move[IDX_USI] !== usi);
  entry.moves.splice(order, 0, move);
  book.saved = false;
}

function updateBookMoveOrderByCounts(sfen: string): void {
  if (book.type === "on-the-fly") {
    return;
  }
  const entry = book.entries[sfen];
  if (!entry) {
    return;
  }
  entry.moves.sort((a, b) => (b[IDX_COUNT] || 0) - (a[IDX_COUNT] || 0));
  book.saved = false;
}

export async function importBookMoves(
  settings: BookImportSettings,
  onProgress?: (progress: number) => void,
): Promise<BookImportSummary> {
  getAppLogger().info("Importing book moves: %s", JSON.stringify(settings));

  const bookRef = book;
  if (bookRef.type === "on-the-fly") {
    throw new Error("Cannot import to on-the-fly book");
  }

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
  let entryCount = 0;
  let duplicateCount = 0;

  for (const path of paths) {
    if (onProgress) {
      const progress = (successFileCount + errorFileCount) / paths.length;
      onProgress(progress);
    }

    getAppLogger().debug("Importing book moves from: %s", path);
    const format = detectRecordFileFormatByPath(path) as RecordFileFormat;
    const sourceData = await fs.promises.readFile(path);
    const record = importRecordFromBuffer(sourceData, format, {
      autoDetect: appSettings.textDecodingRule === TextDecodingRule.AUTO_DETECT,
    });
    if (record instanceof Error) {
      getAppLogger().debug("Failed to import book moves from: %s: %s", path, record);
      errorFileCount++;
      continue;
    }
    successFileCount++;

    const targetColorSet = {
      [Color.BLACK]: true,
      [Color.WHITE]: true,
    };
    const blackPlayerName = getBlackPlayerName(record.metadata)?.toLowerCase();
    const whitePlayerName = getWhitePlayerName(record.metadata)?.toLowerCase();
    switch (settings.playerCriteria) {
      case PlayerCriteria.BLACK:
        targetColorSet[Color.WHITE] = false;
        break;
      case PlayerCriteria.WHITE:
        targetColorSet[Color.BLACK] = false;
        break;
      case PlayerCriteria.FILTER_BY_NAME:
        if (!settings.playerName) {
          throw new Error("player name is not set");
        }
        if (blackPlayerName?.indexOf(settings.playerName.toLowerCase()) === -1) {
          targetColorSet[Color.BLACK] = false;
        }
        if (whitePlayerName?.indexOf(settings.playerName.toLowerCase()) === -1) {
          targetColorSet[Color.WHITE] = false;
        }
        break;
    }

    record.forEach((node, position) => {
      if (!(node.move instanceof Move)) {
        return;
      }

      // criteria
      if (node.ply < settings.minPly || node.ply > settings.maxPly) {
        return;
      }
      if (!targetColorSet[position.color]) {
        return;
      }

      const sfen = position.sfen;
      const usi = node.move.usi;
      const bookMoves = bookRef.entries[sfen]?.moves || [];
      const moves = bookMoves.map(arrayMoveToCommonBookMove);
      const existing = moves.find((move) => move.usi === usi);
      if (existing) {
        duplicateCount++;
      } else {
        entryCount++;
      }
      const bookMove = existing || { usi, comment: "" };
      bookMove.count = (bookMove.count || 0) + 1;
      updateBookMove(sfen, bookMove);
      updateBookMoveOrderByCounts(sfen);
    });
  }

  return {
    successFileCount,
    errorFileCount,
    entryCount,
    duplicateCount,
  };
}
