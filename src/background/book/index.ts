import fs from "node:fs";
import { BookLoadingMode, BookLoadingOptions, BookMove } from "@/common/book";
import { getAppLogger } from "@/background/log";
import { arrayMoveToCommonBookMove, Book, commonBookMoveToArray, IDX_USI } from "./types";
import {
  loadYaneuraOuBook,
  searchBookMovesOnTheFly,
  storeYaneuraOuBook,
  validateBookPositionOrdering,
} from "./yaneuraou";

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
    return;
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
    const entry = book.entries[sfen];
    if (!entry) {
      return [];
    }
    const moves: BookMove[] = [];
    for (const move of entry.moves) {
      moves.push(arrayMoveToCommonBookMove(move));
    }
    return moves;
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
