import fs from "node:fs";
import events from "node:events";
import { Readable, Writable } from "node:stream";
import {
  AperyBook,
  BookEntry,
  BookMove,
  IDX_COUNT,
  IDX_SCORE,
  IDX_USI,
  mergeBookEntries,
} from "./types.js";
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

async function load(
  input: Readable,
  nextEntry: (hash: bigint, bookMove: BookEntry) => Promise<void>,
): Promise<void> {
  let lastHash = BigInt(0);
  let entry: BookEntry | undefined;
  for await (const chunk of input) {
    if (chunk.length % 16 !== 0) {
      throw new Error("Invalid Apery book format");
    }
    for (let offset = 0; offset < chunk.length; offset += 16) {
      const { hash, bookMove } = decodeEntry(chunk, offset);
      if (entry && lastHash !== hash) {
        await nextEntry(lastHash, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = { type: "normal", comment: "", moves: [bookMove], minPly: 0 };
        lastHash = hash;
      } else if (!entry.moves.some((m) => m[IDX_USI] === bookMove[IDX_USI])) {
        entry.moves.push(bookMove);
      }
    }
  }
  if (entry) {
    await nextEntry(lastHash, entry);
  }
}

export async function loadAperyBook(input: Readable): Promise<AperyBook> {
  const entries = new Map<bigint, BookEntry>();
  await load(input, async (hash, entry) => {
    entries.set(hash, entry);
  });
  return { format: "apery", entries };
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
): Promise<BookEntry | undefined> {
  const key = hash(sfen);
  let offset = await binarySearch(key, file, size);
  if (offset < 0) {
    return;
  }

  const moves: BookMove[] = [];
  for (; offset < size; offset += 16) {
    const buffer = Buffer.alloc(16);
    await file.read(buffer, 0, 16, offset);
    if (buffer.readBigUInt64LE() !== key) {
      break;
    }
    moves.push(decodeEntry(buffer).bookMove);
  }
  return {
    type: "normal",
    comment: "",
    moves,
    minPly: 0,
  };
}

async function writeBookMove(output: Writable, key: bigint, bookMove: BookMove) {
  if (!output.write(encodeEntry(key, bookMove))) {
    await events.once(output, "drain");
  }
}

async function writeBookMoves(output: Writable, key: bigint, bookMoves: BookMove[]) {
  for (const bookMove of bookMoves) {
    await writeBookMove(output, key, bookMove);
  }
}

export async function storeAperyBook(book: AperyBook, output: Writable): Promise<void> {
  const end = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  const keys = book.entries.keys();
  const orderedKeys = Array.from(keys).sort(compareHash);
  for (const key of orderedKeys) {
    const entry = book.entries.get(key) as BookEntry;
    await writeBookMoves(output, key, entry.moves);
  }
  output.end();
  await end;
}

export async function mergeAperyBook(
  input: Readable,
  bookPatch: AperyBook,
  output: Writable,
): Promise<void> {
  const end = new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  const keys = bookPatch.entries.keys();
  const patchKeys = Array.from(keys).sort(compareHash);
  let patchIndex = 0;
  let lastPatchKey = BigInt(0);
  try {
    await load(input, async (key, entry) => {
      for (; patchIndex < patchKeys.length; patchIndex++) {
        const patchKey = patchKeys[patchIndex];
        if (patchKey > key) {
          break;
        }
        let patch = bookPatch.entries.get(patchKey) as BookEntry;
        if (patchKey === key) {
          patch = mergeBookEntries(entry, patch) as BookEntry;
        }
        await writeBookMoves(output, patchKey, patch.moves);
        lastPatchKey = patchKey;
      }
      if (key != lastPatchKey) {
        await writeBookMoves(output, key, entry.moves);
      }
    });
    for (; patchIndex < patchKeys.length; patchIndex++) {
      const patchKey = patchKeys[patchIndex];
      const entry = bookPatch.entries.get(patchKey);
      if (entry) {
        await writeBookMoves(output, patchKey, entry.moves);
      }
    }
    output.end();
  } catch (error) {
    output.destroy(new Error(`Failed to merge Apery book: ${error}`));
  }
  await end;
}
