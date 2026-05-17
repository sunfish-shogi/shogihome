import events from "node:events";
import fs from "node:fs";
import { Writable } from "node:stream";
import { ImmutablePosition, InitialPositionSFEN, Move, Position } from "tsshogi";
import { BinaryWriter } from "@bufbuild/protobuf/wire";
import {
  SBookMove as SBookMoveProto,
  SBookMoveEvaluation,
  SBookState,
  SBook,
  SBookMove,
} from "./proto/sbk.js";
import { BookEntry, mergeBookEntries, SbkBook, SbkEval, SbkOnTheFlyLUT } from "./types.js";
import { fromSbkMove, toSbkMove } from "./sbk_move.js";
import { BookMove } from "@/common/book.js";
import {
  packPositionToPackedSfen,
  packSfenToPackedSfen,
  unpackPackedSfenToSfen,
} from "./packed_sfen.js";

const SBK_ON_THE_FLY_ROW_SIZE = 9; // 8 words packed-sfen + 1 word offset

function readVarint(data: Uint8Array, offset: number): [value: number, nextOffset: number] {
  let value = 0;
  let shift = 0;
  for (let i = 0; i < 10; i++) {
    if (offset >= data.length) {
      throw new Error("Invalid protobuf: unexpected EOF while reading varint");
    }
    const byte = data[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return [value, offset];
    }
    shift += 7;
  }
  throw new Error("Invalid protobuf: varint is too long");
}

function skipField(data: Uint8Array, offset: number, wireType: number): number {
  switch (wireType) {
    case 0: {
      const [, next] = readVarint(data, offset);
      return next;
    }
    case 1:
      return offset + 8;
    case 2: {
      const [length, next] = readVarint(data, offset);
      return next + length;
    }
    case 5:
      return offset + 4;
    default:
      throw new Error(`Unsupported protobuf wire type: ${wireType}`);
  }
}

function scanSBookTopLevel(data: Uint8Array): {
  stateCount: number;
  sbkAuthor?: string;
  sbkDescription?: string;
} {
  let stateCount = 0;
  let sbkAuthor: string | undefined;
  let sbkDescription: string | undefined;
  let offset = 0;
  while (offset < data.length) {
    const [tag, next] = readVarint(data, offset);
    offset = next;
    if (tag === 0) {
      break;
    }
    const field = tag >>> 3;
    const wireType = tag & 0x7;

    if ((field === 1 || field === 2) && wireType === 2) {
      const [length, textOffset] = readVarint(data, offset);
      const end = textOffset + length;
      if (end > data.length) {
        throw new Error("Invalid protobuf: truncated field payload");
      }
      const text = Buffer.from(data.subarray(textOffset, end)).toString("utf-8");
      if (field === 1) {
        sbkAuthor = text;
      } else {
        sbkDescription = text;
      }
      offset = end;
      continue;
    }
    if (field === 3 && wireType === 2) {
      const [stateLength, stateOffset] = readVarint(data, offset);
      offset = stateOffset + stateLength;
      if (offset > data.length) {
        throw new Error("Invalid protobuf: truncated SBookState payload");
      }
      stateCount++;
      continue;
    }
    offset = skipField(data, offset, wireType);
  }
  return { stateCount, sbkAuthor, sbkDescription };
}

function writeRowMetadata(table: Uint32Array, rowOffset: number, fileOffset: number) {
  table[rowOffset + 8] = fileOffset >>> 0;
}

function readSfenAtRow(table: Uint32Array, row: number): string {
  const rowOffset = row * SBK_ON_THE_FLY_ROW_SIZE;
  const packedSfen = table.subarray(rowOffset, rowOffset + 8);
  return unpackPackedSfenToSfen(packedSfen);
}

function readRowOffset(table: Uint32Array, row: number): number {
  return table[row * SBK_ON_THE_FLY_ROW_SIZE + 8];
}

function compareRowPacked(table: Uint32Array, row: number, packedSfen: Uint32Array): number {
  const rowOffset = row * SBK_ON_THE_FLY_ROW_SIZE;
  for (let i = 0; i < 8; i++) {
    const a = table[rowOffset + i];
    const b = packedSfen[i];
    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

function swapRows(table: Uint32Array, rowA: number, rowB: number, tempRow: Uint32Array): void {
  if (rowA === rowB) {
    return;
  }
  const offsetA = rowA * SBK_ON_THE_FLY_ROW_SIZE;
  const offsetB = rowB * SBK_ON_THE_FLY_ROW_SIZE;
  tempRow.set(table.subarray(offsetA, offsetA + SBK_ON_THE_FLY_ROW_SIZE));
  table.copyWithin(offsetA, offsetB, offsetB + SBK_ON_THE_FLY_ROW_SIZE);
  table.set(tempRow, offsetB);
}

function sortRows(
  table: Uint32Array,
  rowCount: number,
  compare: (table: Uint32Array, row: number, pivot: Uint32Array) => number,
): void {
  if (rowCount <= 1) {
    return;
  }
  const ranges: number[] = [0, rowCount - 1];
  const pivot = new Uint32Array(8);
  const tempRow = new Uint32Array(SBK_ON_THE_FLY_ROW_SIZE);

  while (ranges.length > 0) {
    const right = ranges.pop() as number;
    const left = ranges.pop() as number;
    if (left >= right) {
      continue;
    }
    const pivotIndex = left + Math.floor((right - left) / 2);
    const pivotOffset = pivotIndex * SBK_ON_THE_FLY_ROW_SIZE;
    pivot.set(table.subarray(pivotOffset, pivotOffset + 8));

    let i = left;
    let j = right;
    while (i <= j) {
      while (compare(table, i, pivot) < 0) {
        i++;
      }
      while (compare(table, j, pivot) > 0) {
        j--;
      }
      if (i <= j) {
        swapRows(table, i, j, tempRow);
        i++;
        j--;
      }
    }

    if (left < j && i < right) {
      const leftLength = j - left;
      const rightLength = right - i;
      if (leftLength > rightLength) {
        ranges.push(left, j, i, right);
      } else {
        ranges.push(i, right, left, j);
      }
    } else if (left < j) {
      ranges.push(left, j);
    } else if (i < right) {
      ranges.push(i, right);
    }
  }
}

function sortRowsByPackedSfen(table: Uint32Array, rowCount: number): void {
  sortRows(table, rowCount, compareRowPacked);
}

function sortRowsByOffset(table: Uint32Array, rowCount: number): void {
  sortRows(table, rowCount, (table, row, pivot) => {
    const offset = readRowOffset(table, row);
    const pivotOffset = readRowOffset(pivot, 0);
    if (offset === pivotOffset) {
      return 0;
    }
    return offset < pivotOffset ? -1 : 1;
  });
}

function isPackedZeroRow(table: Uint32Array, row: number): boolean {
  const rowOffset = row * SBK_ON_THE_FLY_ROW_SIZE;
  for (let i = 0; i < 8; i++) {
    if (table[rowOffset + i] !== 0) {
      return false;
    }
  }
  return true;
}

function isVisited(visitedBits: Uint8Array, stateIndex: number): boolean {
  const bit = 1 << (stateIndex & 7);
  return (visitedBits[stateIndex >> 3] & bit) !== 0;
}

function setVisited(visitedBits: Uint8Array, stateIndex: number): void {
  const bit = 1 << (stateIndex & 7);
  visitedBits[stateIndex >> 3] |= bit;
}

function buildBookEntryFromState(state: SBookState, sfen: string): BookEntry | undefined {
  if (
    state.Moves.length === 0 &&
    state.Evals.length === 0 &&
    !state.Comment &&
    !state.Games &&
    !state.WonBlack &&
    !state.WonWhite
  ) {
    return;
  }
  const pos = Position.newBySFEN(sfen);
  if (!pos) {
    return;
  }
  const bookMoves: BookMove[] = state.Moves.map((m) => {
    const move: BookMove = {
      usi: fromSbkMove(pos, m.Move).usi,
    };
    if (m.Weight) {
      move.count = m.Weight;
    }
    if (m.Evaluation !== SBookMoveEvaluation.None) {
      move.sbkEval = m.Evaluation;
    }
    return move;
  });

  const sbkEvals: SbkEval[] = state.Evals.map((e) => ({
    EvaluationValue: e.EvaluationValue,
    Depth: e.Depth,
    SelDepth: e.SelDepth,
    Nodes: e.Nodes,
    Variation: e.Variation || undefined,
    EngineName: e.EngineName || undefined,
  }));

  const bookEntry: BookEntry = {
    type: "normal",
    moves: bookMoves,
  };
  if (state.Comment) {
    bookEntry.comment = state.Comment;
  }
  if (state.Games) {
    bookEntry.games = state.Games;
  }
  if (state.WonBlack) {
    bookEntry.wonBlack = state.WonBlack;
  }
  if (state.WonWhite) {
    bookEntry.wonWhite = state.WonWhite;
  }
  if (sbkEvals.length > 0) {
    bookEntry.sbkEvals = sbkEvals;
  }
  return bookEntry;
}

function decodeStateAt(data: Uint8Array, stateTagOffset: number): SBookState {
  const [tag, afterTag] = readVarint(data, stateTagOffset);
  if (tag !== 26) {
    throw new Error(`Invalid SBookState tag: ${tag}`);
  }
  const [payloadLength, payloadOffset] = readVarint(data, afterTag);
  const end = payloadOffset + payloadLength;
  if (end > data.length) {
    throw new Error("Invalid sbk: truncated SBookState payload");
  }
  return SBookState.decode(data.subarray(payloadOffset, end));
}

function buildStateOffsetTable(data: Uint8Array, table: Uint32Array, rowCount: number): void {
  let offset = 0;
  let row = 0;
  while (offset < data.length) {
    const tagOffset = offset;
    const [tag, next] = readVarint(data, offset);
    offset = next;
    if (tag === 0) {
      break;
    }
    const field = tag >>> 3;
    const wireType = tag & 0x7;
    if (field === 3 && wireType === 2) {
      const [stateLength, payloadOffset] = readVarint(data, offset);
      if (row >= rowCount) {
        throw new Error("Invalid sbk: state count mismatch");
      }
      const rowOffset = row * SBK_ON_THE_FLY_ROW_SIZE;
      writeRowMetadata(table, rowOffset, tagOffset);
      offset = payloadOffset + stateLength;
      if (offset > data.length) {
        throw new Error("Invalid sbk: truncated SBookState payload");
      }
      row++;
      continue;
    }
    offset = skipField(data, offset, wireType);
  }
  if (row !== rowCount) {
    throw new Error("Invalid sbk: failed to build state offset table");
  }
}

function setPackedSfenForRow(table: Uint32Array, row: number, position: ImmutablePosition): void {
  try {
    table.set(packPositionToPackedSfen(position), row * SBK_ON_THE_FLY_ROW_SIZE);
  } catch {
    // ignore invalid sfen for packed conversion
  }
}

function fillPackedSfenByTraversal(data: Uint8Array, table: Uint32Array, stateCount: number): void {
  const visitedBits = new Uint8Array(Math.ceil(stateCount / 8));

  for (let rootIndex = 0; rootIndex < stateCount; rootIndex++) {
    if (isVisited(visitedBits, rootIndex)) {
      continue;
    }
    const rootOffset = readRowOffset(table, rootIndex);
    const rootState = decodeStateAt(data, rootOffset);

    // Position を持たない State は他の State からの遷移により解決される
    // ただし、BookConv の実装では先頭の State が Position を持たない場合に平手初期局面とみなしているのでそれに倣う
    if (!rootState.Position) {
      if (rootIndex !== 0) {
        continue;
      }
      rootState.Position = InitialPositionSFEN.STANDARD;
    }

    const pos = Position.newBySFEN(rootState.Position);
    if (!pos) {
      continue;
    }

    const rootMoves = rootState.Moves.map((m) => fromSbkMove(pos, m.Move));
    const stack: { state: SBookState; moves: Move[]; index: number; lastMove?: Move }[] = [
      { state: rootState, moves: rootMoves, index: 0 },
    ];
    setPackedSfenForRow(table, rootIndex, pos);
    setVisited(visitedBits, rootIndex);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.moves.length) {
        stack.pop();
        if (frame.lastMove) {
          pos.undoMove(frame.lastMove);
        }
        continue;
      }
      const sbkMove = frame.state.Moves[frame.index];
      const move = frame.moves[frame.index];
      frame.index++;

      const nextStateIndex = sbkMove.NextStateId;
      if (
        nextStateIndex < 0 ||
        nextStateIndex >= stateCount ||
        isVisited(visitedBits, nextStateIndex)
      ) {
        continue;
      }
      if (!pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      const nextStateOffset = readRowOffset(table, nextStateIndex);
      const nextState = decodeStateAt(data, nextStateOffset);
      setPackedSfenForRow(table, nextStateIndex, pos);
      const nextMoves = nextState.Moves.map((m) => fromSbkMove(pos, m.Move));
      stack.push({ state: nextState, moves: nextMoves, index: 0, lastMove: move });
      setVisited(visitedBits, nextStateIndex);
    }
  }
}

function buildSbkOnTheFlyIndex(rawData: Uint8Array): SbkOnTheFlyLUT {
  const { stateCount } = scanSBookTopLevel(rawData);
  const table = new Uint32Array(stateCount * SBK_ON_THE_FLY_ROW_SIZE);
  const indexToOffset = new Uint32Array(stateCount);

  buildStateOffsetTable(rawData, table, stateCount);
  fillPackedSfenByTraversal(rawData, table, stateCount);
  for (let i = 0; i < stateCount; i++) {
    indexToOffset[i] = readRowOffset(table, i);
  }
  sortRowsByPackedSfen(table, stateCount);

  let firstNonZeroRow = 0;
  while (firstNonZeroRow < stateCount && isPackedZeroRow(table, firstNonZeroRow)) {
    firstNonZeroRow++;
  }
  return {
    table,
    rowCount: stateCount,
    firstNonZeroRow,
    indexToOffset,
  };
}

export async function loadSbkBookOnTheFly(path: string): Promise<SbkBook> {
  const rawData = await fs.promises.readFile(path);
  const { sbkAuthor, sbkDescription } = scanSBookTopLevel(rawData);
  return {
    format: "sbk",
    entries: new Map<string, BookEntry>(),
    sbkIndex: buildSbkOnTheFlyIndex(rawData),
    sbkAuthor,
    sbkDescription,
    rawData,
  };
}

async function decodeStateAtFile(data: Uint8Array, stateTagOffset: number): Promise<SBookState> {
  const [tag, afterTag] = readVarint(data, stateTagOffset);
  if (tag !== 26) {
    throw new Error(`Invalid SBookState tag: ${tag}`);
  }
  const [payloadLength, payloadOffset] = readVarint(data, afterTag);
  const payload = data.subarray(payloadOffset, payloadOffset + payloadLength);
  return SBookState.decode(payload);
}

function searchOnTheFlyRow(sfen: string, index: SbkOnTheFlyLUT): number | undefined {
  let packed: Uint32Array;
  try {
    packed = packSfenToPackedSfen(sfen);
  } catch {
    return;
  }
  let left = index.firstNonZeroRow;
  let right = index.rowCount;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compareRowPacked(index.table, mid, packed);
    if (cmp < 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  if (left < index.rowCount && compareRowPacked(index.table, left, packed) === 0) {
    return left;
  }
}

export async function searchSbkBookEntryOnTheFly(
  sfen: string,
  data: Uint8Array,
  index: SbkOnTheFlyLUT,
): Promise<BookEntry | undefined> {
  const row = searchOnTheFlyRow(sfen, index);
  if (row === undefined) {
    return;
  }
  const offset = readRowOffset(index.table, row);
  const state = await decodeStateAtFile(data, offset);
  return buildBookEntryFromState(state, sfen);
}

export async function loadSbkBook(data: Buffer | Uint8Array | string): Promise<SbkBook> {
  if (typeof data === "string") {
    data = await fs.promises.readFile(data);
  }
  const book = SBook.decode(data);

  // BookConv の実装では先頭の State が Position を持たない場合に平手初期局面とみなしているのでそれに倣う
  if (book.BookStates.length > 0 && !book.BookStates[0].Position) {
    book.BookStates[0].Position = InitialPositionSFEN.STANDARD;
  }

  const entries = new Map<string, BookEntry>();
  function addEntry(sfen: string, state: SBookState, moves: Move[]) {
    // 何も情報を持たないリーフノードを除外
    if (
      state.Moves.length === 0 &&
      state.Evals.length === 0 &&
      !state.Comment &&
      !state.Games &&
      !state.WonBlack &&
      !state.WonWhite
    ) {
      return;
    }

    const bookMoves: BookMove[] = state.Moves.map((m, index) => {
      const bookMove: BookMove = {
        usi: moves[index].usi,
      };
      if (m.Weight) {
        bookMove.count = m.Weight;
      }
      if (m.Evaluation !== SBookMoveEvaluation.None) {
        bookMove.sbkEval = m.Evaluation;
      }
      return bookMove;
    });

    const sbkEvals: SbkEval[] = state.Evals.map((e) => ({
      EvaluationValue: e.EvaluationValue,
      Depth: e.Depth,
      SelDepth: e.SelDepth,
      Nodes: e.Nodes,
      Variation: e.Variation || undefined,
      EngineName: e.EngineName || undefined,
    }));

    const bookEntry: BookEntry = {
      type: "normal",
      moves: bookMoves,
    };
    if (state.Comment) {
      bookEntry.comment = state.Comment;
    }
    if (state.Games) {
      bookEntry.games = state.Games;
    }
    if (state.WonBlack) {
      bookEntry.wonBlack = state.WonBlack;
    }
    if (state.WonWhite) {
      bookEntry.wonWhite = state.WonWhite;
    }
    if (sbkEvals.length > 0) {
      bookEntry.sbkEvals = sbkEvals;
    }
    entries.set(sfen, bookEntry);
  }

  const visitedStateIds = new Set<number>();
  for (const rootState of book.BookStates) {
    if (!rootState.Position || visitedStateIds.has(rootState.Id)) {
      continue;
    }
    const pos = Position.newBySFEN(rootState.Position);
    if (!pos) {
      continue;
    }
    const stack: { state: SBookState; moves: Move[]; index: number; lastMove?: Move }[] = [];
    const moves = rootState.Moves.map((m) => fromSbkMove(pos, m.Move));
    stack.push({ state: rootState, moves, index: 0 });
    addEntry(rootState.Position, rootState, moves);
    visitedStateIds.add(rootState.Id);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.moves.length) {
        stack.pop();
        if (frame.lastMove) {
          pos.undoMove(frame.lastMove);
        }
        continue;
      }
      const sbkMove = frame.state.Moves[frame.index];
      const move = frame.moves[frame.index];
      frame.index++;
      const nextStateId = sbkMove.NextStateId;
      if (visitedStateIds.has(nextStateId)) {
        continue;
      }
      if (!pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      const nextState = book.BookStates[nextStateId];
      if (!nextState) {
        pos.undoMove(move);
        continue;
      }
      const nextSfen = pos.sfen;
      const nextMoves = nextState.Moves.map((m) => fromSbkMove(pos, m.Move));
      stack.push({ state: nextState, moves: nextMoves, index: 0, lastMove: move });
      addEntry(nextSfen, nextState, nextMoves);
      visitedStateIds.add(nextStateId);
    }
  }

  return { format: "sbk", entries, sbkAuthor: book.Author, sbkDescription: book.Description };
}

function entryToSbkState(
  id: number,
  entry: BookEntry,
  sfen: string,
  usiToNextId: Map<string, number>,
  withPosition: boolean,
): SBookState {
  const pos = Position.newBySFEN(sfen);
  const sbkMoves: SBookMove[] = [];
  if (pos) {
    for (const bookMove of entry.moves) {
      const move = pos.createMoveByUSI(bookMove.usi);
      if (!move) {
        continue;
      }
      const sbkMove: SBookMove = {
        Move: toSbkMove(move),
        Evaluation: bookMove.sbkEval || SBookMoveEvaluation.None,
        Weight: bookMove.count ?? 0,
        NextStateId: usiToNextId.get(bookMove.usi) ?? -1,
      };
      sbkMoves.push(sbkMove);
    }
  }
  return {
    Id: id,
    // ShogiGUI のハッシュ関数が非公開のため BoardKey と HandKey は省略
    // 定義上は required だが BookConv が 0 を出力しているので問題ないと思われる
    BoardKey: 0n,
    HandKey: 0,
    Games: entry.games ?? 0,
    WonBlack: entry.wonBlack ?? 0,
    WonWhite: entry.wonWhite ?? 0,
    Position: withPosition ? sfen : "",
    Comment: entry.comment || undefined,
    Moves: sbkMoves,
    Evals: (entry.sbkEvals ?? []).map((e) => ({
      EvaluationValue: e.EvaluationValue,
      Depth: e.Depth,
      SelDepth: e.SelDepth,
      Nodes: e.Nodes,
      Variation: e.Variation ?? "",
      EngineName: e.EngineName ?? "",
    })),
  };
}

async function storeSbkBookOnTheFly(
  book: Required<Pick<SbkBook, "rawData" | "sbkIndex">> & SbkBook,
  output: Writable,
): Promise<void> {
  if (!book.rawData || !book.sbkIndex) {
    throw new Error("rawData and sbkIndex are required to store sbk book on the fly");
  }

  try {
    // in-memory 内で遷移元が存在する局面
    const inMemoryRef = new Set<string>();

    // 元の SBK に存在しない局面
    const newSfens = new Set<string>();

    // 新たにルートになる局面
    const rootSfens = new Set<string>();

    for (const [sfen, entry] of book.entries) {
      const pos = Position.newBySFEN(sfen);
      if (!pos) {
        continue; // ShogiHome で生成した SFEN がパースできないのはおかしいので例外を投げた方が良いかもしれない
      }

      // 遷移先の局面を列挙する
      for (const bookMove of entry.moves) {
        const move = pos.createMoveByUSI(bookMove.usi);
        if (!move) {
          continue; // ShogiHome で生成した USI がパースできないのはおかしいので例外を投げた方が良いかもしれない
        }
        if (!pos.doMove(move, { ignoreValidation: true })) {
          continue; // ShogiHome で生成した USI が非合法手なのはおかしいので例外を投げた方が良いかもしれない
        }
        inMemoryRef.add(pos.sfen);
        pos.undoMove(move);
      }

      // 元の SBK を検索する
      const sbkEntry = await searchSbkBookEntryOnTheFly(sfen, book.rawData, book.sbkIndex);

      // 元の SBK に存在しない局面
      if (!sbkEntry) {
        newSfens.add(sfen);
        continue;
      }

      // 元の SBK にあったが in-memory では削除された指し手
      const removedMoves = sbkEntry.moves.filter((m) => {
        return !entry.moves.some((bm) => bm.usi === m.usi);
      });
      for (const bookMove of removedMoves) {
        const move = pos.createMoveByUSI(bookMove.usi);
        if (!move) {
          continue;
        }
        if (!pos.doMove(move, { ignoreValidation: true })) {
          continue;
        }
        // 遷移元の指し手が削除された場合はルート局面として扱う
        // 実際には他の遷移元が存在する可能性があるが遷移元の厳密な特定は負荷が高いため SFEN を記述する形で妥協する
        rootSfens.add(pos.sfen);
        pos.undoMove(move);
      }
    }

    // in-memory の参照先が元の SBK に存在しない場合はは newSfens に追加
    for (const sfen of inMemoryRef) {
      if (newSfens.has(sfen)) {
        continue;
      }
      if (searchOnTheFlyRow(sfen, book.sbkIndex) === undefined) {
        newSfens.add(sfen);
      }
    }

    // in-memory で遷移元が存在せず、かつ元の SBK にも存在しない局面はルート局面として扱う
    for (const [sfen] of book.entries) {
      if (!inMemoryRef.has(sfen) && newSfens.has(sfen)) {
        rootSfens.add(sfen);
      }
    }

    // 新しい SFEN に ID を割り当てる
    const newSfenToId = new Map<string, number>();
    let nextId = book.sbkIndex.rowCount;
    for (const sfen of newSfens) {
      newSfenToId.set(sfen, nextId++);
    }

    // 局面と usi に対して遷移先の ID を解決する
    const sfenAndUsiToNextId = new Map<string, Map<string, number>>();
    for (const [sfen, entry] of book.entries) {
      const pos = Position.newBySFEN(sfen);
      if (!pos) {
        continue;
      }
      const usiToNextId = new Map<string, number>();
      for (const bookMove of entry.moves) {
        const move = pos.createMoveByUSI(bookMove.usi);
        if (!move) {
          continue;
        }
        if (!pos.doMove(move, { ignoreValidation: true })) {
          continue;
        }
        const nextSfen = pos.sfen;
        let nextId = newSfenToId.get(nextSfen);
        if (nextId === undefined) {
          const row = searchOnTheFlyRow(nextSfen, book.sbkIndex);
          if (row !== undefined) {
            const offset = readRowOffset(book.sbkIndex.table, row);
            const state = await decodeStateAtFile(book.rawData, offset);
            nextId = state.Id;
          }
        }
        if (typeof nextId === "number") {
          usiToNextId.set(bookMove.usi, nextId);
        }
        pos.undoMove(move);
      }
      sfenAndUsiToNextId.set(sfen, usiToNextId);
    }

    // 書き出し中のみオフセット順に整列する
    sortRowsByOffset(book.sbkIndex.table, book.sbkIndex.rowCount);

    // データ全体を一気に encode するとメモリを大量に消費してしまうため、チャンク単位で書き出す。
    const CHUNK_SIZE = 64 * 1024;
    const pendingChunks: Uint8Array[] = [];
    let pendingSize = 0;

    async function flush() {
      if (pendingChunks.length === 0) {
        return;
      }
      const combined = Buffer.concat(pendingChunks);
      pendingChunks.length = 0;
      pendingSize = 0;
      if (!output.write(combined)) {
        await events.once(output, "drain");
      }
    }

    async function writeBytes(bytes: Uint8Array) {
      pendingChunks.push(bytes);
      pendingSize += bytes.length;
      if (pendingSize >= CHUNK_SIZE) {
        await flush();
      }
    }

    const headerWriter = new BinaryWriter();
    if (book.sbkAuthor) {
      headerWriter.uint32(10).string(book.sbkAuthor);
    }
    if (book.sbkDescription) {
      headerWriter.uint32(18).string(book.sbkDescription);
    }
    await writeBytes(headerWriter.finish());

    // 元の SBK に存在する局面を書き出す
    for (let id = 0; id < book.sbkIndex.rowCount; id++) {
      const sfen = readSfenAtRow(book.sbkIndex.table, id);
      const patch = book.entries.get(sfen);
      let state: SBookState;
      if (!patch) {
        // 元の SBK を変更無しで書き出す
        const offset = readRowOffset(book.sbkIndex.table, id);
        state = await decodeStateAtFile(book.rawData, offset);
      } else if (patch.type === "normal") {
        // in-memory のデータを書き出す
        const withPosition = rootSfens.has(sfen);
        const usiToNextId = sfenAndUsiToNextId.get(sfen) ?? new Map<string, number>();
        state = entryToSbkState(id, patch, sfen, usiToNextId, withPosition);
      } else {
        // 元の SBK にパッチを当てて書き出す
        const offset = readRowOffset(book.sbkIndex.table, id);
        state = await decodeStateAtFile(book.rawData, offset);
        const baseEntry = buildBookEntryFromState(state, sfen);
        const entry = mergeBookEntries(baseEntry, patch);
        if (entry) {
          const withPosition = !!state.Position || rootSfens.has(sfen);
          const usiToNextId = sfenAndUsiToNextId.get(sfen) ?? new Map<string, number>();
          state = entryToSbkState(id, entry, sfen, usiToNextId, withPosition);
        }
      }

      const stateWriter = new BinaryWriter();
      SBookState.encode(state, stateWriter.uint32(26).fork()).join();
      await writeBytes(stateWriter.finish());
    }

    // 新たに追加された局面を書き出す
    // Set の反復順序は毎回同じであることが保証されるため ID の割り当てと書き出しの順序が一致する
    for (const sfen of newSfens) {
      const id = newSfenToId.get(sfen) as number;
      const entry = book.entries.get(sfen)!;
      const withPosition = rootSfens.has(sfen);
      const usiToNextId = sfenAndUsiToNextId.get(sfen) ?? new Map<string, number>();
      const state = entryToSbkState(id, entry, sfen, usiToNextId, withPosition);

      const stateWriter = new BinaryWriter();
      SBookState.encode(state, stateWriter.uint32(26).fork()).join();
      await writeBytes(stateWriter.finish());
    }
  } finally {
    // Packed-SFEN 順に戻す
    sortRowsByPackedSfen(book.sbkIndex.table, book.sbkIndex.rowCount);
  }
}

async function storeSbkBookFromInMemoryMap(book: SbkBook, output: Writable): Promise<void> {
  // SFEN の記述を最小限にしてデータを削減するためにルートではないノードを列挙する。
  const nonRootSfens = new Set<string>();

  // 局面と指し手のデコードの負荷が高いため、DFS の過程で局面と指し手を列挙しておく。
  const sfenToEdges = new Map<string, [BookMove, number, string][]>();

  // リーフノード
  const leafSfens = new Set<string>();

  // 変更があったノードのマップを構築する。
  // SFEN の読み取りコストを削減するために DFS で探索する。
  for (const [rootSfen, rootEntry] of book.entries) {
    // DFS で訪問したことがある局面はそれ以上調べる必要がない。
    // ここで訪問済みでないノードはルートノードになる可能性があるが、
    // 他のノードからの探索がおわるまではルートノードかどうかが確定しない。
    if (sfenToEdges.has(rootSfen)) {
      continue; // 訪問済み
    }
    // newBySFEN は負荷が高いため、DFS の開始点だけで呼び出して残りは差分計算をする。
    const pos = Position.newBySFEN(rootSfen);
    if (!pos) {
      continue;
    }
    // ルートノードを特定するためにエッジを経由して到達可能な子ノードを DFS で列挙する。
    const stack: { sfen: string; bookMoves: BookMove[]; index: number; lastMove?: Move }[] = [
      { sfen: rootSfen, bookMoves: rootEntry.moves, index: 0 },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.bookMoves.length) {
        stack.pop();
        if (frame.lastMove) {
          pos.undoMove(frame.lastMove);
        }
        continue;
      }
      const bookMove = frame.bookMoves[frame.index];
      frame.index++;
      const move = pos.createMoveByUSI(bookMove.usi);
      if (!move || !pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      let edges = sfenToEdges.get(frame.sfen);
      if (!edges) {
        edges = [];
        sfenToEdges.set(frame.sfen, edges);
      }
      const nextSfen = pos.sfen;
      edges.push([bookMove, toSbkMove(move), nextSfen]);
      const nextEntry = book.entries.get(nextSfen);
      if (!nextEntry) {
        // エントリーに含まれないリーフノード
        // SBK の場合は出力に含める
        pos.undoMove(move);
        leafSfens.add(nextSfen);
        continue;
      }
      if (nextSfen !== rootSfen) {
        // SFEN を省略してよいノード
        nonRootSfens.add(nextSfen);
      }
      if (sfenToEdges.has(nextSfen)) {
        pos.undoMove(move);
        continue; // 訪問済み
      }
      stack.push({ sfen: nextSfen, bookMoves: nextEntry.moves, index: 0, lastMove: move });
    }
  }

  // ノードに ID を割り当てる。
  // ID は書き出す時の順序と一致しなければならない。
  // ルートノードを先頭に書かないと ShogiGUI で正しく読み込まれない。
  let newId = 0;
  const sfenToId = new Map<string, number>();
  for (const [sfen] of book.entries) {
    if (!nonRootSfens.has(sfen)) {
      sfenToId.set(sfen, newId++);
    }
  }
  for (const [sfen] of book.entries) {
    if (nonRootSfens.has(sfen)) {
      sfenToId.set(sfen, newId++);
    }
  }
  for (const sfen of leafSfens) {
    sfenToId.set(sfen, newId++);
  }

  // データ全体を一気に encode するとメモリを大量に消費してしまうため、チャンク単位で書き出す。
  const CHUNK_SIZE = 64 * 1024;
  const pendingChunks: Uint8Array[] = [];
  let pendingSize = 0;

  async function flush() {
    if (pendingChunks.length === 0) {
      return;
    }
    const combined = Buffer.concat(pendingChunks);
    pendingChunks.length = 0;
    pendingSize = 0;
    if (!output.write(combined)) {
      await events.once(output, "drain");
    }
  }

  async function writeBytes(bytes: Uint8Array) {
    pendingChunks.push(bytes);
    pendingSize += bytes.length;
    if (pendingSize >= CHUNK_SIZE) {
      await flush();
    }
  }

  const headerWriter = new BinaryWriter();
  if (book.sbkAuthor) {
    headerWriter.uint32(10).string(book.sbkAuthor);
  }
  if (book.sbkDescription) {
    headerWriter.uint32(18).string(book.sbkDescription);
  }
  await writeBytes(headerWriter.finish());

  async function writeState(sfen: string, entry: BookEntry): Promise<void> {
    const edges = sfenToEdges.get(sfen) ?? [];
    const sbkMoves: SBookMoveProto[] = edges.map(([bookMove, move, nextSfen]) => ({
      Move: move,
      Evaluation: bookMove.sbkEval || SBookMoveEvaluation.None,
      Weight: bookMove.count ?? 0,
      // 存在しない局面に対して BookConv は -1 を出力している
      // ただし、リーフノードを全て書き出しているので -1 が使われることはないはず
      NextStateId: sfenToId.get(nextSfen) ?? -1,
    }));

    const state: SBookState = {
      Id: sfenToId.get(sfen)!,
      // ShogiGUI のハッシュ関数が非公開のため BoardKey と HandKey は省略
      // 定義上は required だが BookConv が 0 を出力しているので問題ないと思われる
      BoardKey: 0n,
      HandKey: 0,
      Games: entry.games ?? 0,
      WonBlack: entry.wonBlack ?? 0,
      WonWhite: entry.wonWhite ?? 0,
      // 他のエントリーから参照されているノードの Position は省略
      Position: nonRootSfens.has(sfen) ? undefined : sfen,
      Comment: entry.comment || undefined,
      Moves: sbkMoves,
      Evals: (entry.sbkEvals ?? []).map((e) => ({
        EvaluationValue: e.EvaluationValue,
        Depth: e.Depth,
        SelDepth: e.SelDepth,
        Nodes: e.Nodes,
        Variation: e.Variation ?? "",
        EngineName: e.EngineName ?? "",
      })),
    };

    const stateWriter = new BinaryWriter();
    SBookState.encode(state, stateWriter.uint32(26).fork()).join();
    await writeBytes(stateWriter.finish());
  }

  for (const [sfen, entry] of book.entries) {
    if (!nonRootSfens.has(sfen)) {
      await writeState(sfen, entry);
    }
  }
  for (const [sfen, entry] of book.entries) {
    if (nonRootSfens.has(sfen)) {
      await writeState(sfen, entry);
    }
  }
  for (const sfen of leafSfens) {
    await writeState(sfen, { type: "normal", moves: [] });
  }

  await flush();
  output.end();
  await events.once(output, "finish");
}

export async function storeSbkBook(book: SbkBook, output: Writable): Promise<void> {
  if (book.sbkIndex && book.rawData) {
    const onTheFlyBook = {
      ...book,
      sbkIndex: book.sbkIndex,
      rawData: book.rawData,
    };
    await storeSbkBookOnTheFly(onTheFlyBook, output);
  } else {
    await storeSbkBookFromInMemoryMap(book, output);
  }
}
