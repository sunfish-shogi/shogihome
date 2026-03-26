import { BookFormatApery, BookFormatSbk, BookFormatYane2016, BookMove } from "@/common/book.js";

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
  EvaluationValue: number;
  Depth: number;
  SelDepth: number;
  Nodes: bigint;
  Variation?: string;
  EngineName?: string;
};

export type BookEntry = {
  type: BookEntryType;
  moves: BookMove[]; // この局面に対する定跡手
  minPly?: number; // 初期局面からの手数
  comment?: string; // 局面に対するコメント
  games?: number; // 対局数 (SBK)
  wonBlack?: number; // 先手勝ち数 (SBK)
  wonWhite?: number; // 後手勝ち数 (SBK)
  sbkEvals?: SbkEval[]; // エンジン解析結果 (SBK)
};

export type BookEntryType = "normal" | "patch";

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
    baseMovesMap.set(move.usi, move);
  }
  const patchMovesMap = new Map<string, BookMove>();
  for (const move of patch.moves) {
    patchMovesMap.set(move.usi, move);
  }
  const moves = base.moves.map((move) => {
    const p = patchMovesMap.get(move.usi);
    if (p) {
      return {
        usi: p.usi,
        usi2: p.usi2 !== undefined ? p.usi2 : move.usi2,
        score: p.score !== undefined ? p.score : move.score,
        depth: p.depth !== undefined ? p.depth : move.depth,
        count: p.count !== undefined ? p.count + (move.count || 0) : move.count,
        comment: p.comment || move.comment,
        evaluation: p.evaluation,
      };
    }
    return move;
  });
  for (const move of patch.moves) {
    if (!baseMovesMap.has(move.usi)) {
      moves.push(move);
    }
  }

  return {
    type: "normal",
    comment: patch.comment || base.comment,
    moves,
    minPly: Math.min(base.minPly ?? 0, patch.minPly ?? 0),
  };
}
