import fs from "node:fs";
import { BookMove as CommonBookMove } from "@/common/book";
import { getAppLogger } from "@/background/log";
import { arrayMoveToCommonBookMove, Book } from "./types";
import { loadYaneuraOuBook } from "./yaneuraou";

type BookHandle = InMemoryBook | OnTheFlyBook;

type InMemoryBook = Book & {
  type: "in-memory";
};

type OnTheFlyBook = {
  type: "on-the-fly";
};

let book: BookHandle | null = null;

export async function openBook(path: string): Promise<void> {
  // FIXME: on-the-fly mode
  await loadBook(path);
}

async function loadBook(path: string): Promise<void> {
  getAppLogger().info("Loading book: path=%s", path);
  const file = fs.createReadStream(path, "utf-8");
  try {
    book = {
      type: "in-memory",
      ...(await loadYaneuraOuBook(file)),
    };
    if (book.duplicateCount) {
      getAppLogger().warn("Duplicated entries: %d", book.duplicateCount);
    }
    getAppLogger().info("Loaded book with %d entries", book.entryCount);
  } catch (error) {
    getAppLogger().error(`${error}`);
    throw error;
  }
}

export async function searchBookMoves(sfen: string): Promise<CommonBookMove[] | null> {
  if (book?.type === "in-memory") {
    const entry = book.entries[sfen];
    if (!entry) {
      return null;
    }
    const moves: CommonBookMove[] = [];
    for (const move of entry.moves) {
      moves.push(arrayMoveToCommonBookMove(move));
    }
    return moves;
  } else if (book?.type === "on-the-fly") {
    // FIXME
    throw new Error("on-the-fly mode is not implemented: sfen=" + sfen);
  }
  return null;
}
