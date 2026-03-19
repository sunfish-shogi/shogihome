import {
  BookFormatApery,
  BookFormatSbk,
  BookFormatYane2016,
  BookMove as CommonBookMove,
  SbkMoveEvalution,
} from "@/common/book.js";

export type YaneBook = {
  format: BookFormatYane2016;
  entries: Map<string, BookEntry>;
};

export type AperyBook = {
  format: BookFormatApery;
  entries: Map<bigint, BookEntry>;
};

export type SbkBook = {
  format: BookFormatSbk;
  entries: Map<string, BookEntry>;
  sbkAuthor?: string;
  sbkDescription?: string;
};

export type Book = YaneBook | AperyBook | SbkBook;

export type SbkEval = {
  EvalutionValue: number;
  Depth: number;
  SelDepth: number;
  Nodes: bigint;
  Variation?: string;
  EngineName?: string;
};

export type BookEntry = {
  type: BookEntryType;
  comment: string; // 局面に対するコメント
  moves: BookMove[]; // この局面に対する定跡手
  minPly: number; // 初期局面からの手数
  games?: number; // 対局数 (SBK)
  wonBlack?: number; // 先手勝ち数 (SBK)
  wonWhite?: number; // 後手勝ち数 (SBK)
  sbkEvals?: SbkEval[]; // エンジン解析結果 (SBK)
};

export type BookEntryType = "normal" | "patch";

export type BookMove = [
  usi: string,
  usi2: string | undefined,
  score: number | undefined,
  depth: number | undefined,
  count: number | undefined,
  comment: string,
  evalution: SbkMoveEvalution, // (SBK)
];

export const IDX_USI = 0;
export const IDX_USI2 = 1;
export const IDX_SCORE = 2;
export const IDX_DEPTH = 3;
export const IDX_COUNT = 4;
export const IDX_COMMENTS = 5;
export const IDX_EVALUTION = 6;

export function arrayMoveToCommonBookMove(move: BookMove): CommonBookMove {
  return {
    usi: move[IDX_USI],
    usi2: move[IDX_USI2],
    score: move[IDX_SCORE],
    depth: move[IDX_DEPTH],
    count: move[IDX_COUNT],
    comment: move[IDX_COMMENTS],
    evalution: move[IDX_EVALUTION],
  };
}

export function commonBookMoveToArray(move: CommonBookMove): BookMove {
  return [
    move.usi,
    move.usi2,
    move.score,
    move.depth,
    move.count,
    move.comment,
    move.evalution ?? SbkMoveEvalution.None,
  ];
}

export function mergeBookEntries(
  base: BookEntry | undefined,
  patch: BookEntry | undefined,
): BookEntry | undefined {
  if (patch?.type === "normal") {
    return patch;
  }
  if (!base) {
    if (!patch) {
      return;
    }
    return {
      ...patch,
      type: "normal",
    };
  }
  if (!patch) {
    return base;
  }

  const baseMovesMap = new Map<string, BookMove>();
  for (const move of base.moves) {
    baseMovesMap.set(move[IDX_USI], move);
  }
  const patchMovesMap = new Map<string, BookMove>();
  for (const move of patch.moves) {
    patchMovesMap.set(move[IDX_USI], move);
  }
  const moves = base.moves.map((move) => {
    const p = patchMovesMap.get(move[IDX_USI]);
    if (p) {
      return [
        p[IDX_USI],
        p[IDX_USI2] !== undefined ? p[IDX_USI2] : move[IDX_USI2],
        p[IDX_SCORE] !== undefined ? p[IDX_SCORE] : move[IDX_SCORE],
        p[IDX_DEPTH] !== undefined ? p[IDX_DEPTH] : move[IDX_DEPTH],
        p[IDX_COUNT] !== undefined ? p[IDX_COUNT] + (move[IDX_COUNT] || 0) : move[IDX_COUNT],
        p[IDX_COMMENTS] || move[IDX_COMMENTS],
        p[IDX_EVALUTION],
      ] as BookMove;
    }
    return move;
  });
  for (const move of patch.moves) {
    if (!baseMovesMap.has(move[IDX_USI])) {
      moves.push(move);
    }
  }

  return {
    type: "normal",
    comment: patch.comment || base.comment,
    moves,
    minPly: Math.min(base.minPly, patch.minPly),
  };
}
