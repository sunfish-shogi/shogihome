import fs from "node:fs";
import { BookEntry, YbbBook, mergeBookEntries } from "./types.js";
import { BookMove } from "@/common/book.js";
import { sfenToPackedSfen, packedSfenToSfen } from "./packed_sfen.js";
import { toYaneMove16, fromYaneMove16 } from "./yane_move.js";

const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

if (!IS_LITTLE_ENDIAN) {
  throw new Error("Big-endian platforms are not supported");
}

const MAGIC = "YANE-BINBOOK-V1\0";
const INDEX_HEADER_SIZE = 32; // magic(16) + record_count(8) + flags(8)
const RECORD_SIZE = 44; // packed_sfen(32) + moves_offset(8) + ply(2) + move_count(2)
const MOVE_ENTRY_SIZE_V0 = 4; // move16(2) + eval(2)
const MOVE_ENTRY_SIZE_V1 = 6; // move16(2) + eval(2) + depth(2)

async function readExact(
  file: fs.promises.FileHandle,
  buf: Buffer,
  offset: number,
  length: number,
  position: number,
): Promise<void> {
  const { bytesRead } = await file.read(buf, offset, length, position);
  if (bytesRead !== length) {
    throw new Error(
      `YBB read error: expected ${length} bytes at offset ${position}, got ${bytesRead}`,
    );
  }
}

function moveEntrySize(flags: bigint): number {
  return (flags & 1n) === 1n ? MOVE_ENTRY_SIZE_V1 : MOVE_ENTRY_SIZE_V0;
}

function packedSfenFromBuffer(buf: Buffer | Uint8Array, offset: number): Uint32Array {
  const words = new Uint32Array(8);
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 32);
  for (let i = 0; i < 8; i++) {
    words[i] = view.getUint32(i * 4, true);
  }
  return words;
}

function comparePackedSfen(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

function packedSfenToBytes(words: Uint32Array): Uint8Array {
  return new Uint8Array(words.buffer, words.byteOffset, 32);
}

function readMoves(buf: Buffer, moveCount: number, entrySize: number): BookMove[] {
  const moves: BookMove[] = [];
  for (let i = 0; i < moveCount; i++) {
    const off = i * entrySize;
    const move16 = buf.readUInt16LE(off);
    const score = buf.readInt16LE(off + 2);
    const depth = entrySize >= MOVE_ENTRY_SIZE_V1 ? buf.readUInt16LE(off + 4) : undefined;
    const usi = fromYaneMove16(move16);
    const move: BookMove = { usi, score };
    if (depth !== undefined && depth > 0) {
      move.depth = depth;
    }
    moves.push(move);
  }
  return moves;
}

export async function loadYbbBook(path: string): Promise<YbbBook> {
  const data = await fs.promises.readFile(path);
  const magic = data.toString("ascii", 0, 16);
  if (magic !== MAGIC) {
    throw new Error(`Invalid YBB magic: ${magic}`);
  }
  const view = new DataView(data.buffer, data.byteOffset);
  const recordCount = view.getBigUint64(16, true);
  const flags = view.getBigUint64(24, true);
  const entrySize = moveEntrySize(flags);
  const movesAreaStart = INDEX_HEADER_SIZE + Number(recordCount) * RECORD_SIZE;
  const entries = new Map<string, BookEntry>();

  for (let i = 0n; i < recordCount; i++) {
    const recOff = INDEX_HEADER_SIZE + Number(i) * RECORD_SIZE;
    const packedSfen = packedSfenFromBuffer(data, recOff);
    const movesRelOffset = Number(view.getBigUint64(recOff + 32, true));
    const ply = view.getUint16(recOff + 40, true);
    const moveCount = view.getUint16(recOff + 42, true);
    const sfen = packedSfenToSfen(packedSfen, 1);
    const movesAbsOffset = movesAreaStart + movesRelOffset;
    const movesBuf = data.subarray(movesAbsOffset, movesAbsOffset + moveCount * entrySize);
    const moves = readMoves(movesBuf, moveCount, entrySize);
    entries.set(sfen, { type: "normal", moves, minPly: ply });
  }

  return { format: "ybb", entries };
}

export type YbbOnTheFly = {
  format: "ybb";
  file: fs.promises.FileHandle;
  size: number;
  recordCount: bigint;
  flags: bigint;
  entries: Map<string, BookEntry>;
};

export async function openYbbBookOnTheFly(path: string): Promise<YbbOnTheFly> {
  const file = await fs.promises.open(path, "r");
  try {
    const stat = await file.stat();
    const headerBuf = Buffer.alloc(INDEX_HEADER_SIZE);
    await readExact(file, headerBuf, 0, INDEX_HEADER_SIZE, 0);
    const magic = headerBuf.toString("ascii", 0, 16);
    if (magic !== MAGIC) {
      throw new Error(`Invalid YBB magic: ${magic}`);
    }
    const view = new DataView(headerBuf.buffer, headerBuf.byteOffset);
    const recordCount = view.getBigUint64(16, true);
    const flags = view.getBigUint64(24, true);
    return {
      format: "ybb",
      file,
      size: stat.size,
      recordCount,
      flags,
      entries: new Map<string, BookEntry>(),
    };
  } catch (e) {
    await file.close();
    throw e;
  }
}

export async function searchYbbBookMovesOnTheFly(
  sfen: string,
  file: fs.promises.FileHandle,
  recordCount: bigint,
  flags: bigint,
): Promise<BookEntry | undefined> {
  if (recordCount === 0n) {
    return undefined;
  }
  const target = sfenToPackedSfen(sfen);
  const targetBytes = packedSfenToBytes(target);
  const entrySize = moveEntrySize(flags);
  const movesAreaStart = INDEX_HEADER_SIZE + Number(recordCount) * RECORD_SIZE;
  const recBuf = Buffer.alloc(RECORD_SIZE);

  let lo = 0n;
  let hi = recordCount - 1n;
  while (lo <= hi) {
    const mid = (lo + hi) / 2n;
    const offset = INDEX_HEADER_SIZE + Number(mid) * RECORD_SIZE;
    await readExact(file, recBuf, 0, RECORD_SIZE, offset);
    const cmp = comparePackedSfen(
      new Uint8Array(recBuf.buffer, recBuf.byteOffset, 32),
      targetBytes,
    );
    if (cmp === 0) {
      const view = new DataView(recBuf.buffer, recBuf.byteOffset);
      const movesRelOffset = Number(view.getBigUint64(32, true));
      const moveCount = view.getUint16(42, true);
      const ply = view.getUint16(40, true);
      if (moveCount === 0) {
        return { type: "normal", moves: [], minPly: ply };
      }
      const movesBuf = Buffer.alloc(moveCount * entrySize);
      await readExact(file, movesBuf, 0, movesBuf.length, movesAreaStart + movesRelOffset);
      const moves = readMoves(movesBuf, moveCount, entrySize);
      return { type: "normal", moves, minPly: ply };
    } else if (cmp < 0) {
      lo = mid + 1n;
    } else {
      if (mid === 0n) {
        break;
      }
      hi = mid - 1n;
    }
  }
  return undefined;
}

export async function loadYbbBookFull(
  file: fs.promises.FileHandle,
  recordCount: bigint,
  flags: bigint,
): Promise<Map<string, BookEntry>> {
  const entrySize = moveEntrySize(flags);
  const movesAreaStart = INDEX_HEADER_SIZE + Number(recordCount) * RECORD_SIZE;
  const entries = new Map<string, BookEntry>();
  const recBuf = Buffer.alloc(RECORD_SIZE);

  for (let i = 0n; i < recordCount; i++) {
    const recOff = INDEX_HEADER_SIZE + Number(i) * RECORD_SIZE;
    await readExact(file, recBuf, 0, RECORD_SIZE, recOff);
    const packedSfen = packedSfenFromBuffer(recBuf, 0);
    const view = new DataView(recBuf.buffer, recBuf.byteOffset);
    const movesRelOffset = Number(view.getBigUint64(32, true));
    const ply = view.getUint16(40, true);
    const moveCount = view.getUint16(42, true);
    const sfen = packedSfenToSfen(packedSfen, 1);
    if (moveCount > 0) {
      const movesBuf = Buffer.alloc(moveCount * entrySize);
      await readExact(file, movesBuf, 0, movesBuf.length, movesAreaStart + movesRelOffset);
      const moves = readMoves(movesBuf, moveCount, entrySize);
      entries.set(sfen, { type: "normal", moves, minPly: ply });
    }
  }
  return entries;
}

type SortedEntry = {
  packedBytes: Uint8Array;
  sfen: string;
};

export async function storeYbbBook(
  entries: Map<string, BookEntry>,
  outputPath: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const sorted: SortedEntry[] = [];
  let hasDepth = false;

  for (const [sfen, entry] of entries) {
    if (entry.moves.length === 0) {
      continue;
    }
    const packed = sfenToPackedSfen(sfen);
    sorted.push({ packedBytes: packedSfenToBytes(packed), sfen });
    if (!hasDepth) {
      for (const m of entry.moves) {
        if (m.depth !== undefined && m.depth > 0) {
          hasDepth = true;
          break;
        }
      }
    }
  }

  onProgress?.(0.1);
  sorted.sort((a, b) => comparePackedSfen(a.packedBytes, b.packedBytes));

  const flags = hasDepth ? 1n : 0n;
  const entrySize = hasDepth ? MOVE_ENTRY_SIZE_V1 : MOVE_ENTRY_SIZE_V0;
  const recordCount = BigInt(sorted.length);
  const movesStart = INDEX_HEADER_SIZE + sorted.length * RECORD_SIZE;

  const output = await fs.promises.open(outputPath, "w");
  try {
    const headerBuf = Buffer.alloc(INDEX_HEADER_SIZE);
    headerBuf.write(MAGIC, 0, 16, "ascii");
    const headerView = new DataView(headerBuf.buffer, headerBuf.byteOffset);
    headerView.setBigUint64(16, recordCount, true);
    headerView.setBigUint64(24, flags, true);
    await output.write(headerBuf, 0, INDEX_HEADER_SIZE, 0);

    let indexPos = INDEX_HEADER_SIZE;
    let movesPos = movesStart;
    const total = sorted.length;

    for (let idx = 0; idx < total; idx++) {
      if (onProgress && idx % 10000 === 0) {
        onProgress(0.2 + (0.8 * idx) / total);
      }
      const item = sorted[idx];
      const entry = entries.get(item.sfen)!;
      const moveCount = entry.moves.length;

      const recBuf = Buffer.alloc(RECORD_SIZE);
      recBuf.set(item.packedBytes, 0);
      const recView = new DataView(recBuf.buffer, recBuf.byteOffset);
      recView.setBigUint64(32, BigInt(movesPos - movesStart), true);
      recView.setUint16(40, entry.minPly ?? 1, true);
      recView.setUint16(42, moveCount, true);
      await output.write(recBuf, 0, RECORD_SIZE, indexPos);
      indexPos += RECORD_SIZE;

      const movesBuf = Buffer.alloc(moveCount * entrySize);
      for (let i = 0; i < moveCount; i++) {
        const m = entry.moves[i];
        const off = i * entrySize;
        movesBuf.writeUInt16LE(toYaneMove16(m.usi), off);
        movesBuf.writeInt16LE(m.score ?? 0, off + 2);
        if (hasDepth) {
          movesBuf.writeUInt16LE(m.depth ?? 0, off + 4);
        }
      }
      await output.write(movesBuf, 0, movesBuf.length, movesPos);
      movesPos += movesBuf.length;
    }
  } finally {
    await output.close();
  }
}

type SortedPatch = {
  packedBytes: Uint8Array;
  sfen: string;
  entry: BookEntry;
};

export async function mergeYbbBook(
  baseFile: fs.promises.FileHandle,
  baseRecordCount: bigint,
  baseFlags: bigint,
  patches: Map<string, BookEntry>,
  outputPath: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const sortedPatches: SortedPatch[] = [];
  for (const [sfen, entry] of patches) {
    const packed = sfenToPackedSfen(sfen);
    sortedPatches.push({ packedBytes: packedSfenToBytes(packed), sfen, entry });
  }
  sortedPatches.sort((a, b) => comparePackedSfen(a.packedBytes, b.packedBytes));

  const baseEntrySize = moveEntrySize(baseFlags);
  const baseMovesAreaStart = INDEX_HEADER_SIZE + Number(baseRecordCount) * RECORD_SIZE;
  const recBuf = Buffer.alloc(RECORD_SIZE);

  let outputHasDepth = (baseFlags & 1n) === 1n;
  if (!outputHasDepth) {
    for (const p of sortedPatches) {
      if (p.entry.moves.some((m) => m.depth !== undefined && m.depth > 0)) {
        outputHasDepth = true;
        break;
      }
    }
  }

  // Pass 1: count output records
  const pass1Total = Number(baseRecordCount) + sortedPatches.length;
  let outputRecordCount = 0n;
  let baseIdx = 0n;
  let patchIdx = 0;

  while (baseIdx < baseRecordCount || patchIdx < sortedPatches.length) {
    if (onProgress && Number(outputRecordCount) % 10000 === 0) {
      onProgress((0.1 * Number(outputRecordCount)) / pass1Total);
    }
    let cmp: number;
    if (baseIdx >= baseRecordCount) {
      cmp = 1;
    } else if (patchIdx >= sortedPatches.length) {
      cmp = -1;
    } else {
      const baseOff = INDEX_HEADER_SIZE + Number(baseIdx) * RECORD_SIZE;
      await readExact(baseFile, recBuf, 0, 32, baseOff);
      cmp = comparePackedSfen(
        new Uint8Array(recBuf.buffer, recBuf.byteOffset, 32),
        sortedPatches[patchIdx].packedBytes,
      );
    }

    if (cmp < 0) {
      baseIdx++;
    } else if (cmp > 0) {
      patchIdx++;
    } else {
      baseIdx++;
      patchIdx++;
    }
    outputRecordCount++;
  }

  onProgress?.(0.1);

  const outputFlags = outputHasDepth ? 1n : 0n;
  const outputEntrySize = outputHasDepth ? MOVE_ENTRY_SIZE_V1 : MOVE_ENTRY_SIZE_V0;
  const movesStart = INDEX_HEADER_SIZE + Number(outputRecordCount) * RECORD_SIZE;
  const outputTotal = Number(outputRecordCount);

  // Write header
  const output = await fs.promises.open(outputPath, "w");
  try {
    const headerBuf = Buffer.alloc(INDEX_HEADER_SIZE);
    headerBuf.write(MAGIC, 0, 16, "ascii");
    const headerView = new DataView(headerBuf.buffer, headerBuf.byteOffset);
    headerView.setBigUint64(16, outputRecordCount, true);
    headerView.setBigUint64(24, outputFlags, true);
    await output.write(headerBuf, 0, INDEX_HEADER_SIZE, 0);

    // Pass 2: interleaved index + moves write
    let indexPos = INDEX_HEADER_SIZE;
    let movesPos = movesStart;
    baseIdx = 0n;
    patchIdx = 0;
    let outputWritten = 0;

    while (baseIdx < baseRecordCount || patchIdx < sortedPatches.length) {
      if (onProgress && outputWritten % 10000 === 0) {
        onProgress(0.1 + (0.9 * outputWritten) / outputTotal);
      }
      let cmp: number;
      let baseMovesOffset = 0;
      let baseMoveCount = 0;

      if (baseIdx >= baseRecordCount) {
        cmp = 1;
      } else if (patchIdx >= sortedPatches.length) {
        cmp = -1;
      } else {
        const baseOff = INDEX_HEADER_SIZE + Number(baseIdx) * RECORD_SIZE;
        await readExact(baseFile, recBuf, 0, RECORD_SIZE, baseOff);
        const baseView = new DataView(recBuf.buffer, recBuf.byteOffset);
        baseMovesOffset = Number(baseView.getBigUint64(32, true));
        baseMoveCount = baseView.getUint16(42, true);
        cmp = comparePackedSfen(
          new Uint8Array(recBuf.buffer, recBuf.byteOffset, 32),
          sortedPatches[patchIdx].packedBytes,
        );
      }

      if (cmp < 0) {
        // base only — recBuf already contains the full record
        if (baseIdx >= baseRecordCount) {
          throw new Error("unreachable");
        }
        if (baseMoveCount === 0 && baseMovesOffset === 0 && cmp === -1) {
          // patchIdx >= sortedPatches.length case: recBuf not yet read
          const baseOff = INDEX_HEADER_SIZE + Number(baseIdx) * RECORD_SIZE;
          await readExact(baseFile, recBuf, 0, RECORD_SIZE, baseOff);
          const baseView = new DataView(recBuf.buffer, recBuf.byteOffset);
          baseMovesOffset = Number(baseView.getBigUint64(32, true));
          baseMoveCount = baseView.getUint16(42, true);
        }

        // Overwrite only moves_offset in recBuf, then write as-is
        const recView = new DataView(recBuf.buffer, recBuf.byteOffset);
        recView.setBigUint64(32, BigInt(movesPos - movesStart), true);
        await output.write(recBuf, 0, RECORD_SIZE, indexPos);

        const movesSize = baseMoveCount * baseEntrySize;
        const baseMoveBuf = Buffer.alloc(movesSize);
        await readExact(baseFile, baseMoveBuf, 0, movesSize, baseMovesAreaStart + baseMovesOffset);

        if (baseEntrySize === outputEntrySize) {
          await output.write(baseMoveBuf, 0, movesSize, movesPos);
          movesPos += movesSize;
        } else {
          const outMoves = Buffer.alloc(baseMoveCount * outputEntrySize);
          for (let i = 0; i < baseMoveCount; i++) {
            baseMoveBuf.copy(
              outMoves,
              i * outputEntrySize,
              i * baseEntrySize,
              i * baseEntrySize + baseEntrySize,
            );
          }
          await output.write(outMoves, 0, outMoves.length, movesPos);
          movesPos += outMoves.length;
        }
        indexPos += RECORD_SIZE;
        baseIdx++;
      } else if (cmp > 0) {
        // patch only
        const patch = sortedPatches[patchIdx];
        const moves = patch.entry.moves;
        const outRec = Buffer.alloc(RECORD_SIZE);
        outRec.set(patch.packedBytes, 0);
        const outView = new DataView(outRec.buffer, outRec.byteOffset);
        outView.setBigUint64(32, BigInt(movesPos - movesStart), true);
        outView.setUint16(40, patch.entry.minPly ?? 1, true);
        outView.setUint16(42, moves.length, true);
        await output.write(outRec, 0, RECORD_SIZE, indexPos);

        const outMoves = Buffer.alloc(moves.length * outputEntrySize);
        for (let i = 0; i < moves.length; i++) {
          const off = i * outputEntrySize;
          outMoves.writeUInt16LE(toYaneMove16(moves[i].usi), off);
          outMoves.writeInt16LE(moves[i].score ?? 0, off + 2);
          if (outputHasDepth) {
            outMoves.writeUInt16LE(moves[i].depth ?? 0, off + 4);
          }
        }
        await output.write(outMoves, 0, outMoves.length, movesPos);
        movesPos += outMoves.length;
        indexPos += RECORD_SIZE;
        patchIdx++;
      } else {
        // both: merge
        const patch = sortedPatches[patchIdx];
        const baseMoveBuf = Buffer.alloc(baseMoveCount * baseEntrySize);
        await readExact(
          baseFile,
          baseMoveBuf,
          0,
          baseMoveBuf.length,
          baseMovesAreaStart + baseMovesOffset,
        );
        const baseMoves = readMoves(baseMoveBuf, baseMoveCount, baseEntrySize);
        const baseEntry: BookEntry = { type: "normal", moves: baseMoves };
        const merged = mergeBookEntries(baseEntry, patch.entry) || { type: "normal", moves: [] };
        const moves = merged.moves;

        // reuse recBuf which has packed_sfen from the base record
        const outView = new DataView(recBuf.buffer, recBuf.byteOffset);
        outView.setBigUint64(32, BigInt(movesPos - movesStart), true);
        const basePly = outView.getUint16(40, true);
        const patchPly = patch.entry.minPly;
        if (patchPly !== undefined && patchPly < basePly) {
          outView.setUint16(40, patchPly, true);
        }
        outView.setUint16(42, moves.length, true);
        await output.write(recBuf, 0, RECORD_SIZE, indexPos);

        const outMoves = Buffer.alloc(moves.length * outputEntrySize);
        for (let i = 0; i < moves.length; i++) {
          const off = i * outputEntrySize;
          outMoves.writeUInt16LE(toYaneMove16(moves[i].usi), off);
          outMoves.writeInt16LE(moves[i].score ?? 0, off + 2);
          if (outputHasDepth) {
            outMoves.writeUInt16LE(moves[i].depth ?? 0, off + 4);
          }
        }
        await output.write(outMoves, 0, outMoves.length, movesPos);
        movesPos += outMoves.length;
        indexPos += RECORD_SIZE;
        baseIdx++;
        patchIdx++;
      }
      outputWritten++;
    }
  } finally {
    await output.close();
  }
}
