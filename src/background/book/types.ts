import { BookMove as CommonBookMove } from "@/common/book";

export const MOVE_NONE = "none";

export type Book = {
  entries: { [sfen: string]: BookEntry };
  entryCount: number;
  duplicateCount: number;
};

export type BookEntry = {
  comment: string; // 局面に対するコメント
  moves: BookMove[]; // この局面に対する定跡手
  minPly: number; // 初期局面からの手数
};

export type BookMove = [
  usi: string,
  usi2: string | undefined,
  score: number | undefined,
  depth: number | undefined,
  count: number | undefined,
  comment: string,
];

export const IDX_USI = 0;
export const IDX_USI2 = 1;
export const IDX_SCORE = 2;
export const IDX_DEPTH = 3;
export const IDX_COUNT = 4;
export const IDX_COMMENTS = 5;

export function compareMoves(a: BookMove, b: BookMove): number {
  if (a[IDX_SCORE] !== undefined && b[IDX_SCORE] !== undefined && a[IDX_SCORE] !== b[IDX_SCORE]) {
    return b[IDX_SCORE] - a[IDX_SCORE];
  }
  if (a[IDX_COUNT] !== undefined && b[IDX_COUNT] !== undefined && a[IDX_COUNT] !== b[IDX_COUNT]) {
    return b[IDX_COUNT] - a[IDX_COUNT];
  }
  return 0;
}

export function arrayMoveToCommonBookMove(move: BookMove): CommonBookMove {
  return {
    usi: move[IDX_USI],
    usi2: move[IDX_USI2],
    score: move[IDX_SCORE],
    depth: move[IDX_DEPTH],
    count: move[IDX_COUNT],
    comment: move[IDX_COMMENTS],
  };
}

export function commonBookMoveToArray(move: CommonBookMove): BookMove {
  return [move.usi, move.usi2, move.score, move.depth, move.count, move.comment];
}
