import { BookMove as CommonBookMove } from "@/common/book.js";

export type BookFormatYane2016 = "yane2016";
export type BookFormatApery = "apery";
export type BookFormat = BookFormatYane2016 | BookFormatApery;

type BookCommon = {
  entryCount: number;
  duplicateCount: number;
};

export type YaneBook = BookCommon & {
  format: BookFormatYane2016;
  yaneEntries: { [sfen: string]: BookEntry };
};

export type AperyBook = BookCommon & {
  format: BookFormatApery;
  aperyEntries: Map<bigint, BookEntry>;
};

export type Book = YaneBook | AperyBook;

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
