import fs from "node:fs";
import readline from "node:readline";
import events from "node:events";
import { Readable, Writable } from "node:stream";
import {
  YaneBook,
  BookEntry,
  BookMove,
  IDX_COMMENTS,
  IDX_COUNT,
  IDX_DEPTH,
  IDX_SCORE,
  IDX_USI,
  IDX_USI2,
  mergeBookEntries,
} from "./types.js";
import { getAppLogger } from "@/background/log.js";

const YANEURAOU_BOOK_HEADER_V100 = "#YANEURAOU-DB2016 1.00";

const MOVE_NONE = "none";
const SCORE_NONE = "none";
const DEPTH_NONE = "none";

const SFENMarker = "sfen ";
const CommentMarker1 = "#";
const CommentMarker2 = "//";
const LF = "\n".charCodeAt(0);
const CR = "\r".charCodeAt(0);

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
  if (line.startsWith(CommentMarker1)) {
    return { type: "comment", comment: line.slice(CommentMarker1.length) };
  } else if (line.startsWith(CommentMarker2)) {
    return { type: "comment", comment: line.slice(CommentMarker2.length) };
  }

  // 局面
  if (line.startsWith(SFENMarker)) {
    const [sfen, ply] = normalizeSFEN(line);
    return { type: "position", sfen, ply };
  }

  // 定跡手
  if (/^[1-9][a-i][1-9][a-i]\+? /.test(line) || /^[RBGSNLP]\*[1-9][a-i] /.test(line)) {
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
        // ShogiHome v1.20.0 は score と depth の省略時に空文字を出力する実装なので空文字も判定に含める。
        columns[2] === SCORE_NONE || columns[2] === "" ? undefined : parseInt(columns[2], 10), // score
        columns[3] === DEPTH_NONE || columns[3] === "" ? undefined : parseInt(columns[3], 10), // depth
        columns[4] ? parseInt(columns[4], 10) : undefined, // counts
        commentIndex < line.length ? line.slice(commentIndex).replace(/^(#|\/\/)/, "") : "", // comment
      ],
    };
  }

  // どれにも該当しない行はコメントとみなす。
  return { type: "comment", comment: line.slice(0) };
}

function appendCommentLine(base: string, next: string): string {
  return base ? base + "\n" + next : next;
}

async function load(input: Readable, nextEntry: (sfen: string, entry: BookEntry) => Promise<void>) {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    let current: [sfen: string, entry: BookEntry] | undefined;
    let lineNo = 0;
    for await (let line of reader) {
      if (lineNo === 0) {
        line = line.replace(/^\uFEFF/, "");
      }
      const parsed = parseLine(line);
      switch (parsed.type) {
        case "comment":
          if (lineNo === 0 && line !== YANEURAOU_BOOK_HEADER_V100) {
            throw new Error("Unsupported book header: " + line);
          }
          if (current) {
            if (current[1].moves.length === 0) {
              const bookEntry = current[1];
              bookEntry.comment = appendCommentLine(bookEntry.comment, parsed.comment);
            } else {
              const moves = current[1].moves;
              const move = moves[moves.length - 1];
              move[IDX_COMMENTS] = appendCommentLine(move[IDX_COMMENTS], parsed.comment);
            }
          }
          break;
        case "position":
          if (current) {
            await nextEntry(current[0], current[1]);
          }
          current = [parsed.sfen, { type: "normal", comment: "", moves: [], minPly: parsed.ply }];
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
    }
    if (current) {
      await nextEntry(current[0], current[1]);
    }
  } finally {
    reader.close();
  }
}

export async function loadYaneuraOuBook(input: Readable): Promise<YaneBook> {
  const entries: Map<string, BookEntry> = new Map();
  await load(input, async (sfen, entry) => {
    const existing = entries.get(sfen);
    if (!existing || entry.minPly < existing.minPly) {
      entries.set(sfen, entry);
    }
  });
  return { format: "yane2016", entries };
}

async function writeEntry(output: Writable, sfen: string, entry: BookEntry) {
  if (entry.moves.length === 0) {
    return;
  }
  if (!output.write(SFENMarker + sfen + "\n")) {
    await events.once(output, "drain");
  }
  if (entry.comment) {
    for (const commentLine of entry.comment.split("\n")) {
      if (!output.write(CommentMarker1 + commentLine + "\n")) {
        await events.once(output, "drain");
      }
    }
  }
  for (const move of entry.moves) {
    const line =
      move[IDX_USI] +
      " " +
      (move[IDX_USI2] || MOVE_NONE) +
      " " +
      // やねうら王や BookConv は連続するスペースをまとめて読み込むので、
      // 値の省略時には空文字列ではなく 1 文字以上の出力が必要である。
      // やねうら王のブログではその場合の書き方を言及していないが、
      // 数値として解析できない文字列であれば実装上は問題ないことがわかっている。
      (move[IDX_SCORE] != undefined ? move[IDX_SCORE].toFixed(0) : SCORE_NONE) +
      " " +
      (move[IDX_DEPTH] != undefined ? move[IDX_DEPTH].toFixed(0) : DEPTH_NONE) +
      " " +
      (move[IDX_COUNT] != undefined ? move[IDX_COUNT].toFixed(0) : "") +
      "\n";
    if (!output.write(line)) {
      await events.once(output, "drain");
    }
    if (move[IDX_COMMENTS]) {
      for (const commentLine of move[IDX_COMMENTS].split("\n")) {
        if (!output.write(CommentMarker1 + commentLine + "\n")) {
          await events.once(output, "drain");
        }
      }
    }
  }
}

export async function storeYaneuraOuBook(book: YaneBook, output: Writable): Promise<void> {
  if (book.format !== "yane2016") {
    return Promise.reject(new Error(`Expected book format "yane2016" but got "${book.format}"`));
  }
  const end = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  output.write(YANEURAOU_BOOK_HEADER_V100 + "\n");
  for (const sfen of Array.from(book.entries.keys()).sort()) {
    const entry = book.entries.get(sfen) as BookEntry;
    await writeEntry(output, sfen, entry);
  }
  output.end();
  await end;
}

export async function mergeYaneuraOuBook(
  input: Readable,
  bookPatch: YaneBook,
  output: Writable,
): Promise<void> {
  if (bookPatch.format !== "yane2016") {
    return Promise.reject(
      new Error(`Expected book format "yane2016" but got "${bookPatch.format}"`),
    );
  }
  const end = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  output.write(YANEURAOU_BOOK_HEADER_V100 + "\n");
  const patchKeys = Array.from(bookPatch.entries.keys()).sort();
  let patchIndex = 0;
  let lastPatchKey = "";
  try {
    await load(input, async (sfen, entry) => {
      for (; patchIndex < patchKeys.length; patchIndex++) {
        const patchKey = patchKeys[patchIndex];
        if (patchKey > sfen) {
          break;
        }
        let patch = bookPatch.entries.get(patchKey) as BookEntry;
        if (patchKey === sfen) {
          patch = mergeBookEntries(entry, patch) as BookEntry;
        }
        await writeEntry(output, patchKey, patch);
        lastPatchKey = patchKey;
      }
      if (sfen !== lastPatchKey) {
        await writeEntry(output, sfen, entry);
      }
    });
    for (; patchIndex < patchKeys.length; patchIndex++) {
      const patchKey = patchKeys[patchIndex];
      await writeEntry(output, patchKey, bookPatch.entries.get(patchKey) as BookEntry);
    }
    output.end();
  } catch (error) {
    output.destroy(new Error(`Failed to merge YaneuraOu book: ${error}`));
  }
  await end;
}

export async function validateBookPositionOrdering(input: Readable): Promise<boolean> {
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    let prev: string | undefined;
    let count = 0;
    for await (const line of reader) {
      if (!line.startsWith(SFENMarker)) {
        continue;
      }
      if (prev && prev >= line) {
        return false;
      }
      count++;
      if (count >= 10000) {
        break;
      }
      prev = line;
    }
    return true;
  } finally {
    reader.close();
  }
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

function findSFENMarker(buffer: Buffer, size: number, isFileHead: boolean): number {
  if (isFileHead) {
    // 通常はファイルの先頭にヘッダーがあるが、いきなり SFEN が来ても扱えるようにする。
    if (checkSFENMarker(0, buffer)) {
      return 0;
    } else if (
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf &&
      checkSFENMarker(3, buffer)
    ) {
      return 3;
    }
  }
  for (let i = 0; i < size - (SFENMarker.length + 1); i++) {
    if ((buffer[i] === LF || buffer[i] === CR) && checkSFENMarker(i + 1, buffer)) {
      return i + 1;
    }
  }
  return -1;
}

async function binarySearch(
  sfen: string,
  file: fs.promises.FileHandle,
  size: number,
): Promise<[number, number]> {
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
      const offset = findSFENMarker(buffer, read.bytesRead, head === 0);
      if (offset >= 0) {
        sfenOffset = head + offset;
        break;
      }
      head += bufferSize - (SFENMarker.length + 1);
    }
    if (sfenOffset < 0) {
      return [-1, 0];
    }

    // SFEN を読み込む
    const read = await file.read(buffer, 0, bufferSize, sfenOffset);
    const sfenLine = readLineFromBuffer(buffer, read.bytesRead);
    const [currentSFEN, ply] = normalizeSFEN(sfenLine);
    if (sfen === currentSFEN) {
      return [sfenOffset + sfenLine.length + 1, ply];
    }

    if (sfen < currentSFEN) {
      end = mid;
    } else {
      begin = sfenOffset + sfenLine.length + 1;
    }
  }
  return [-1, 0];
}

export async function searchYaneuraOuBookMovesOnTheFly(
  sfen: string,
  file: fs.promises.FileHandle,
  size: number,
): Promise<BookEntry | undefined> {
  const [offset, ply] = await binarySearch(sfen, file, size);
  if (offset < 0) {
    return;
  }

  const bufferSize = 8 * 1024;
  const buffer = Buffer.alloc(bufferSize);
  const read = await file.read(buffer, 0, bufferSize, offset);
  if (read.bytesRead === 0) {
    return;
  }
  let comment = "";
  const moves: BookMove[] = [];
  let i = 0;
  while (true) {
    const moveLine = readLineFromBuffer(buffer, read.bytesRead, i);
    i += moveLine.length + 1;
    if (i >= read.bytesRead) {
      break;
    }
    const parsed = parseLine(moveLine);
    if (parsed.type === "comment") {
      comment = appendCommentLine(comment, parsed.comment);
      continue;
    } else if (parsed.type === "move") {
      moves.push(parsed.move);
    } else {
      break;
    }
  }
  return { type: "normal", comment, moves, minPly: ply };
}
