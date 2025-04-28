import fs from "node:fs";
import { Readable, Writable } from "node:stream";
import { AperyBook, BookEntry, BookMove, IDX_COUNT, IDX_SCORE, IDX_USI } from "./types.js";
import { fromAperyMove, toAperyMove } from "./apery_move.js";
import { hash } from "./apery_zobrist.js";

// Apery 定跡フォーマット
//
// BookEntry:
//   1. 64bits: Hash Key
//   2. 16bits: Move
//   3. 16bits: Count
//   4. 32bits: Score

function encodeEntry(hash: bigint, move: BookMove): Buffer {
  const binary = Buffer.alloc(16);
  binary.writeBigUInt64LE(hash, 0);
  const aperyMove = toAperyMove(move[IDX_USI]);
  binary.writeUInt16LE(aperyMove, 8);
  binary.writeUInt16LE(move[IDX_COUNT] || 0, 10);
  binary.writeInt32LE(move[IDX_SCORE] || 0, 12);
  return binary;
}

function decodeEntry(binary: Buffer, offset: number = 0): { hash: bigint; bookMove: BookMove } {
  const hash = binary.readBigUInt64LE(offset);
  const move = binary.readUInt16LE(offset + 8);
  const count = binary.readUInt16LE(offset + 10);
  const score = binary.readInt32LE(offset + 12);
  const usi = fromAperyMove(move);
  return {
    hash,
    bookMove: [usi, undefined, score, undefined, count, ""],
  };
}

export function loadAperyBook(input: Readable): Promise<AperyBook> {
  return new Promise((resolve, reject) => {
    const entries = new Map<bigint, BookEntry>();
    let entryCount = 0;
    let duplicateCount = 0;

    input.on("end", () => {
      resolve({ format: "apery", aperyEntries: entries, entryCount, duplicateCount });
    });
    input.on("error", reject);

    input.on("data", (chunk: Buffer) => {
      if (chunk.length % 16 !== 0) {
        input.destroy(new Error("Invalid Apery book format"));
        return;
      }
      for (let offset = 0; offset < chunk.length; offset += 16) {
        const { hash, bookMove } = decodeEntry(chunk, offset);
        const entry = entries.get(hash);
        if (entry) {
          if (entry.moves.some((m) => m[IDX_USI] === bookMove[IDX_USI])) {
            duplicateCount++;
          } else {
            entry.moves.push(bookMove);
          }
        } else {
          entries.set(hash, {
            comment: "",
            moves: [bookMove],
            minPly: 0,
          });
          entryCount++;
        }
      }
    });
  });
}

function compareHash(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function binarySearch(
  key: bigint,
  file: fs.promises.FileHandle,
  size: number,
): Promise<number> {
  const buffer = Buffer.alloc(8);
  let begin = 0;
  let end = size;
  while (begin < end) {
    // 範囲の中央を読み込む
    const mid = Math.floor((begin + end) / 2);
    for (let offset = mid - (mid % 16); offset >= begin; offset -= 16) {
      await file.read(buffer, 0, 8, offset);
      const comp = compareHash(key, buffer.readBigUInt64LE());
      if (comp < 0) {
        end = mid;
        break;
      } else if (comp > 0) {
        begin = offset + 16;
        break;
      } else if (offset === begin) {
        return offset;
      }
    }
  }
  return -1;
}

export async function searchAperyBookMovesOnTheFly(
  sfen: string,
  file: fs.promises.FileHandle,
  size: number,
): Promise<BookMove[]> {
  const key = hash(sfen);
  let offset = await binarySearch(key, file, size);
  if (offset < 0) {
    return [];
  }

  const bookMoves: BookMove[] = [];
  for (; offset < size; offset += 16) {
    const buffer = Buffer.alloc(16);
    await file.read(buffer, 0, 16, offset);
    if (buffer.readBigUInt64LE() !== key) {
      break;
    }
    bookMoves.push(decodeEntry(buffer).bookMove);
  }
  return bookMoves;
}

export function storeAperyBook(book: AperyBook, output: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);

    const keys = book.aperyEntries.keys();
    const orderedKeys = Array.from(keys).sort(compareHash);
    for (const key of orderedKeys) {
      const entry = book.aperyEntries.get(key) as BookEntry;
      for (const move of entry.moves) {
        output.write(encodeEntry(key, move));
      }
    }
    output.end();
  });
}
