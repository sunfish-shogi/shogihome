import fs from "node:fs";
import { BookLoadingMode, BookMove } from "@/common/book";
import { getAppLogger } from "@/background/log";
import { arrayMoveToCommonBookMove, Book } from "./types";
import { loadYaneuraOuBook, searchBookMovesOnTheFly } from "./yaneuraou";

type BookHandle = InMemoryBook | OnTheFlyBook;

type InMemoryBook = Book & {
  type: "in-memory";
};

type OnTheFlyBook = {
  type: "on-the-fly";
  file: fs.promises.FileHandle;
  size: number;
};

const inMemoryBookSizeLimit = 256 * 1024 * 1024;

let book: BookHandle | null = null;

export async function openBook(path: string): Promise<BookLoadingMode> {
  const stat = await fs.promises.lstat(path);
  if (!stat.isFile()) {
    throw new Error("Not a file: " + path);
  }
  const size = stat.size;
  if (size > inMemoryBookSizeLimit) {
    getAppLogger().info("Loading book on-the-fly: path=%s size=%d", path, size);
    const file = await fs.promises.open(path, "r");
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
      ...(await loadYaneuraOuBook(file)),
    }).type;
  }
}

function replaceBook(newBook: BookHandle): BookHandle {
  if (book?.type === "on-the-fly") {
    book.file.close();
  }
  book = newBook;
  if (book.type === "in-memory") {
    if (book.duplicateCount) {
      getAppLogger().warn("Duplicated entries: %d", book.duplicateCount);
    }
    getAppLogger().info("Loaded book with %d entries", book.entryCount);
  }
  return book;
}

export async function searchBookMoves(sfen: string): Promise<BookMove[]> {
  if (book?.type === "in-memory") {
    const entry = book.entries[sfen];
    if (!entry) {
      return [];
    }
    const moves: BookMove[] = [];
    for (const move of entry.moves) {
      moves.push(arrayMoveToCommonBookMove(move));
    }
    return moves;
  } else if (book?.type === "on-the-fly") {
    const moves = await searchBookMovesOnTheFly(sfen, book.file, book.size);
    return moves.map(arrayMoveToCommonBookMove);
  }
  return [];
}
