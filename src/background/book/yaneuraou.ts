import readline from "node:readline";
import events from "node:events";
import { Readable } from "node:stream";
import { Book, BookEntry, BookMove, IDX_COMMENTS, MOVE_NONE } from "./types";
import { getAppLogger } from "@/background/log";

const YANEURAOU_BOOK_HEADER_V100 = "#YANEURAOU-DB2016 1.00";

type Line = CommentLine | PositionLine | MoveLine;

type CommentLine = {
  type: "comment";
  comment: string;
};

type PositionLine = {
  type: "position";
  sfen: string;
  ply: number;
};

type MoveLine = {
  type: "move";
  move: BookMove;
};

function parseLine(line: string): Line {
  // コメント
  if (line.startsWith("#")) {
    return { type: "comment", comment: line.slice(1) };
  } else if (line.startsWith("//")) {
    return { type: "comment", comment: line.slice(2) };
  }

  // 局面
  if (line.startsWith("sfen ")) {
    // 手数部分は省略される場合があるので、手数部分を除いた範囲を抽出する。
    const begin = 5;
    let end = begin;
    for (let columns = 0; end < line.length; end++) {
      if (line[end] !== " ") {
        continue;
      }
      columns++;
      if (columns === 3) {
        break;
      }
    }
    const sfen = line.slice(begin, end) + " 1";
    const ply = parseInt(line.slice(end + 1), 10) || 0;
    return { type: "position", sfen, ply };
  }

  // 定跡手
  if (/^[1-9][a-i][1-9][a-i]\+? /.test(line) || /^[KRBGSNLP]\*[1-9][a-i] /.test(line)) {
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
        commentIndex < line.length ? line.slice(commentIndex) : "", // comment
      ],
    };
  }

  // どれにも該当しない行はコメントとみなす。
  return { type: "comment", comment: line.slice(0) };
}

export async function loadYaneuraOuBook(input: Readable): Promise<Book> {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });

  const entries: { [sfen: string]: BookEntry } = {};
  let current: [sfen: string, entry: BookEntry];
  let lineNo = 0;
  let entryCount = 0;
  let duplicateCount = 0;
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
            current[1].comment += parsed.comment + "\n";
          } else {
            const moves = current[1].moves;
            moves[moves.length - 1][IDX_COMMENTS] += parsed.comment + "\n";
          }
        }
        break;
      case "position":
        current = [parsed.sfen, { comment: "", moves: [], minPly: parsed.ply }];
        if (entries[current[0]]) {
          duplicateCount++;
          if (current[1].minPly < entries[current[0]].minPly) {
            entries[current[0]] = current[1];
          }
        } else {
          entries[current[0]] = current[1];
          entryCount++;
        }
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

  await events.once(reader, "close");
  return { entries, entryCount, duplicateCount };
}
