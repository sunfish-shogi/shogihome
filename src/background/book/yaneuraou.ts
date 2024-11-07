import fs from "node:fs";
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

function normalizeSFEN(sfen: string): [string, number] {
  // 手数部分は省略される場合があるので、手数部分を除いた範囲を抽出する。
  const begin = 5;
  let end = begin;
  for (let columns = 0; end < sfen.length; end++) {
    if (sfen[end] !== " ") {
      continue;
    }
    columns++;
    if (columns === 3) {
      break;
    }
  }
  return [
    // 手数部分を 1 にした SFEN
    sfen.slice(begin, end) + " 1",
    // オリジナルの手数
    parseInt(sfen.slice(end + 1), 10) || 0,
  ];
}

function parseLine(line: string): Line {
  // コメント
  if (line.startsWith("#")) {
    return { type: "comment", comment: line.slice(1) };
  } else if (line.startsWith("//")) {
    return { type: "comment", comment: line.slice(2) };
  }

  // 局面
  if (line.startsWith("sfen ")) {
    const [sfen, ply] = normalizeSFEN(line);
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

const SFENMarker = "sfen ";
const LF = "\n".charCodeAt(0);
const CR = "\r".charCodeAt(0);

export async function searchBookMovesOnTheFly(
  sfen: string,
  file: fs.promises.FileHandle,
  size: number,
): Promise<BookMove[]> {
  const offset = await binarySearch(sfen, file, size);
  if (offset < 0) {
    return [];
  }

  const bufferSize = 8 * 1024;
  const buffer = Buffer.alloc(bufferSize);
  const read = await file.read(buffer, 0, bufferSize, offset);
  if (read.bytesRead === 0) {
    return [];
  }
  const moves: BookMove[] = [];
  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const moveLine = readLineFromBuffer(buffer, read.bytesRead, i);
    i += moveLine.length + 1;
    if (i >= read.bytesRead) {
      break;
    }
    const parsed = parseLine(moveLine);
    if (parsed.type === "comment") {
      // On-the-fly ではコメント行を無視する。
      continue;
    } else if (parsed.type !== "move") {
      break;
    }
    moves.push(parsed.move);
  }
  return moves;
}

async function binarySearch(
  sfen: string,
  file: fs.promises.FileHandle,
  size: number,
): Promise<number> {
  const bufferSize = 1024;
  const buffer = Buffer.alloc(bufferSize);
  let begin = 0;
  let end = size;
  while (begin < end) {
    // 範囲の中央を読み込む
    const mid = Math.floor((begin + end) / 2);

    // SFEN の開始位置を探す
    let head = mid;
    let sfenOffset = -1;
    while (head < end) {
      const read = await file.read(buffer, 0, bufferSize, head);
      if (read.bytesRead === 0) {
        break;
      }
      sfenOffset = head + findSFENMarker(buffer, read.bytesRead, head === 0);
      if (sfenOffset >= 0) {
        break;
      }
      head += bufferSize - (SFENMarker.length + 1);
    }
    if (sfenOffset < 0) {
      return -1;
    }

    // SFEN を読み込む
    const read = await file.read(buffer, 0, bufferSize, sfenOffset);
    const sfenLine = readLineFromBuffer(buffer, read.bytesRead);
    const [currentSFEN] = normalizeSFEN(sfenLine);
    if (sfen === currentSFEN) {
      return sfenOffset + sfenLine.length + 1;
    }

    if (sfen < currentSFEN) {
      end = mid;
    } else {
      begin = sfenOffset + sfenLine.length + 1;
    }
  }
  return -1;
}

function findSFENMarker(buffer: Buffer, size: number, isFileHead: boolean): number {
  if (isFileHead && checkSFENMarker(0, buffer)) {
    return 0;
  }
  for (let i = 0; i < size - (SFENMarker.length + 1); i++) {
    if ((buffer[i] === LF || buffer[i] === CR) && checkSFENMarker(i + 1, buffer)) {
      return i + 1;
    }
  }
  return -1;
}

function checkSFENMarker(offset: number, buffer: Buffer): boolean {
  for (let i = 0; i < SFENMarker.length; i++) {
    if (buffer[offset + i] !== SFENMarker.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

function readLineFromBuffer(buffer: Buffer, size: number, offset: number = 0): string {
  let end = offset;
  while (end < size && buffer[end] !== LF && buffer[end] !== CR) {
    end++;
  }
  return buffer.toString("utf-8", offset, end);
}
