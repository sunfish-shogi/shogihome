import fs from "node:fs";
import readline from "node:readline";
import events from "node:events";
import { BookMove as CommonBookMove } from "@/common/book";
import { getAppLogger } from "./log";

export type Book = {
  entries: { [sfen: string]: BookEntry };
};

export type BookEntry = {
  comments: string; // 局面に対するコメント
  moves: BookMove[]; // この局面に対する定跡手
};

export type BookMove = [
  usi: string,
  usi2: string | undefined,
  score: number | undefined,
  depth: number | undefined,
  counts: number | undefined,
  comments: string | undefined,
];

const IDX_USI = 0;
const IDX_USI2 = 1;
const IDX_SCORE = 2;
const IDX_DEPTH = 3;
const IDX_COUNTS = 4;
const IDX_COMMENTS = 5;

const MOVE_NONE = "none";

function arrayMoveToCommonBookMove(move: BookMove): CommonBookMove {
  return {
    usi: move[IDX_USI],
    usi2: move[IDX_USI2],
    score: move[IDX_SCORE],
    depth: move[IDX_DEPTH],
    counts: move[IDX_COUNTS],
    comments: move[IDX_COMMENTS] || "",
  };
}

type BookHandle = InMemoryBook | OnTheFlyBook;

type InMemoryBook = Book & {
  type: "in-memory";
};

type OnTheFlyBook = {
  type: "on-the-fly";
};

let book: BookHandle | null = null;

const YANEURAOU_BOOK_HEADER_V100 = "#YANEURAOU-DB2016 1.00";

export async function openBook(path: string): Promise<void> {
  // FIXME: on-the-fly mode
  await loadBook(path);
}

async function loadBook(path: string): Promise<void> {
  getAppLogger().info("Loading book: path=%s", path);
  const file = fs.createReadStream(path, "utf-8");
  const reader = readline.createInterface({ input: file, crlfDelay: Infinity });

  const entries: { [sfen: string]: BookEntry } = {};
  let current: [sfen: string, entry: BookEntry];
  let lineNo = 0;
  let entryCount = 0;
  reader.on("line", (line) => {
    const parsed = parseLine(line);
    switch (parsed.type) {
      case "comment":
        if (lineNo === 0 && line !== YANEURAOU_BOOK_HEADER_V100) {
          reader.emit("error", new Error("Unsupported book header: " + line));
          return;
        }
        if (current) {
          if (current[1].moves.length === 0) {
            current[1].comments += "\n" + line;
          } else {
            const moves = current[1].moves;
            moves[moves.length - 1][IDX_COMMENTS] += "\n" + line;
          }
        }
        break;
      case "position":
        if (current) {
          if (entries[current[0]]) {
            getAppLogger().warn("Duplicated entry: sfen=%s", current[0]);
          } else {
            entries[current[0]] = current[1];
            entryCount++;
          }
        }
        current = [line, { comments: "", moves: [] }];
        break;
      case "move":
        if (current) {
          current[1].moves.push(parsed.move);
        } else {
          getAppLogger().warn("Move line without position line: line=%d", lineNo);
        }
        break;
    }
    lineNo++;
  });

  try {
    await events.once(reader, "close");
    book = { type: "in-memory", entries };
    getAppLogger().info("Loaded book with %d entries", entryCount);
  } catch (error) {
    getAppLogger().error(`${error}`);
    throw error;
  }
}

type Line = CommentLine | PositionLine | MoveLine;

type CommentLine = {
  type: "comment";
  comment: string;
};

type PositionLine = {
  type: "position";
  sfen: string;
};

type MoveLine = {
  type: "move";
  move: BookMove;
};

function parseLine(line: string): Line {
  if (line.startsWith("#")) {
    return { type: "comment", comment: line.slice(1) };
  } else if (line.startsWith("//")) {
    return { type: "comment", comment: line.slice(2) };
  } else if (line.startsWith("sfen ")) {
    return { type: "position", sfen: line.slice(5) };
  } else if (/^[1-9][a-i][1-9][a-i]\+? /.test(line) || /^[KRBGSNLP]\*[1-9][a-i] /.test(line)) {
    const columns = line.split(" ", 5);
    let commentIndex = 0;
    for (let i = 0; i < columns.length; i++) {
      commentIndex += columns[i].length + 1;
    }
    return {
      type: "move",
      move: [
        columns[0], // usi
        columns[1] === MOVE_NONE ? undefined : columns[1], // usi2
        columns[2] ? parseInt(columns[2], 10) : undefined, // score
        columns[3] ? parseInt(columns[3], 10) : undefined, // depth
        columns[4] ? parseInt(columns[4], 10) : undefined, // counts
        commentIndex < line.length ? line.slice(commentIndex) : undefined, // comments
      ],
    };
  }
  return { type: "comment", comment: line.slice(0) };
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
