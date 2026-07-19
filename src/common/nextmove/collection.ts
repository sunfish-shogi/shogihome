import { Position } from "tsshogi";

export const nextMoveCollectionFormat = "shogihome-next-move";
export const nextMoveCollectionVersion = 1;

export type NextMoveScoreSource = "research" | "comment";

export type NextMoveCandidate = {
  usi: string; // 指し手 (USI 形式)
  score?: number; // 先手から見た評価値
  mate?: number; // 詰み手数 (先手勝ちの場合に正)
  depth?: number; // 探索深さ
  accepted?: boolean; // 出題時に正解として扱うかどうか
  pv?: string[]; // 読み筋 (USI 形式・先頭は usi と同じ指し手)
};

export type NextMoveActualMove = {
  usi: string; // 指し手 (USI 形式)
  score?: number; // 先手から見た評価値
  mate?: number; // 詰み手数 (先手勝ちの場合に正)
  scoreSource?: NextMoveScoreSource; // 評価値の出所
};

export type NextMovePreviousMove = {
  usi: string; // 指し手 (USI 形式)
  sfen: string; // この指し手を指す前の局面 (手数は 1 に正規化)
};

export type NextMoveProblemAnalysis = {
  scoreBeforeMove?: number; // 実戦の手を指す直前の局面の評価値 (解析コメント由来)
  scoreAfterMove?: number; // 実戦の手を指した直後の局面の評価値 (解析コメント由来)
};

export type NextMoveProblemSource = {
  path?: string; // 棋譜ファイルのパス
  ply?: number; // 実戦の手の手数 (1 始まり)
  blackPlayer?: string; // 先手の対局者名
  whitePlayer?: string; // 後手の対局者名
  date?: string; // 対局日
};

export type NextMoveProblem = {
  sfen: string; // 出題局面 (手数は 1 に正規化)
  candidates: NextMoveCandidate[]; // 再探索で得られた候補手 (良い順)
  actualMove: NextMoveActualMove; // 実戦で指された手
  previousMove?: NextMovePreviousMove; // 出題局面に至る直前の指し手
  analysis?: NextMoveProblemAnalysis;
  source?: NextMoveProblemSource;
};

export type NextMoveCollectionEngineMetadata = {
  name?: string; // USI エンジン名
  multiPV?: number; // 再探索時の MultiPV 値
  maxSecondsPerPosition?: number; // 1 局面あたりの探索時間 (秒)
};

export type NextMoveCollectionCriteriaMetadata = {
  winRateDropThreshold?: number; // 悪手と判定する勝率下降幅 (%)
  adoptionWinRateDiff?: number; // 採用する最善手と実戦の手の勝率差 (%)
  acceptableWinRateDiff?: number; // 正解として扱う最善手との勝率差 (%)
  minWinRate?: number; // 逆転可能とみなす手番側勝率の下限 (%)
  coefficientInSigmoid?: number; // 勝率換算に使用したシグモイド係数
  minPly?: number;
  maxPly?: number;
};

export type NextMoveCollectionMetadata = {
  title?: string;
  createdAt?: string; // ISO 8601
  appVersion?: string;
  engine?: NextMoveCollectionEngineMetadata;
  criteria?: NextMoveCollectionCriteriaMetadata;
};

export type NextMoveCollection = {
  format: typeof nextMoveCollectionFormat;
  version: number;
  metadata?: NextMoveCollectionMetadata;
  problems: NextMoveProblem[];
};

/**
 * SFEN の手数フィールドを 1 に正規化します。
 */
export function normalizeProblemSFEN(sfen: string): string {
  const fields = sfen.trim().split(" ");
  return [fields[0], fields[1], fields[2], "1"].join(" ");
}

/**
 * 問題の重複判定に用いるキー (SFEN の手数フィールドを除いた部分) を返します。
 */
export function getProblemPositionKey(sfen: string): string {
  const fields = sfen.trim().split(" ");
  return [fields[0], fields[1], fields[2]].join(" ");
}

function validateProblem(problem: NextMoveProblem, index: number): void {
  const prefix = `problems[${index}]`;
  if (!problem || typeof problem !== "object") {
    throw new Error(`${prefix}: 不正な問題データです。`);
  }
  const position = Position.newBySFEN(problem.sfen);
  if (!position) {
    throw new Error(`${prefix}: 不正な SFEN です: ${problem.sfen}`);
  }
  if (!Array.isArray(problem.candidates) || problem.candidates.length === 0) {
    throw new Error(`${prefix}: candidates がありません。`);
  }
  const isValidMoveUSI = (usi: unknown): boolean => {
    if (typeof usi !== "string") {
      return false;
    }
    const move = position.createMoveByUSI(usi);
    return !!move && position.isValidMove(move);
  };
  for (const [candidateIndex, candidate] of problem.candidates.entries()) {
    if (!candidate || typeof candidate !== "object" || !isValidMoveUSI(candidate.usi)) {
      throw new Error(
        `${prefix}.candidates[${candidateIndex}]: 不正な指し手です: ${candidate?.usi}`,
      );
    }
  }
  if (!problem.actualMove || !isValidMoveUSI(problem.actualMove.usi)) {
    throw new Error(`${prefix}.actualMove: 不正な指し手です: ${problem.actualMove?.usi}`);
  }
  if (problem.previousMove !== undefined) {
    const previousMove = problem.previousMove;
    if (!previousMove || typeof previousMove !== "object") {
      throw new Error(`${prefix}.previousMove: 不正なデータです。`);
    }
    const previousPosition = Position.newBySFEN(previousMove.sfen);
    if (!previousPosition) {
      throw new Error(`${prefix}.previousMove: 不正な SFEN です: ${previousMove.sfen}`);
    }
    const move =
      typeof previousMove.usi === "string"
        ? previousPosition.createMoveByUSI(previousMove.usi)
        : null;
    if (!move || !previousPosition.doMove(move)) {
      throw new Error(`${prefix}.previousMove: 不正な指し手です: ${previousMove.usi}`);
    }
    if (getProblemPositionKey(previousPosition.sfen) !== getProblemPositionKey(problem.sfen)) {
      throw new Error(`${prefix}.previousMove: 指し手を進めた局面が出題局面と一致しません。`);
    }
  }
}

/**
 * JSON 文字列から次の一手問題集を読み込みます。
 * フォーマットが不正な場合は例外を投げます。
 */
export function parseNextMoveCollection(json: string): NextMoveCollection {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("JSON として解釈できませんでした。");
  }
  if (!data || typeof data !== "object") {
    throw new Error("次の一手問題集ではありません。");
  }
  const collection = data as NextMoveCollection;
  if (collection.format !== nextMoveCollectionFormat) {
    throw new Error("次の一手問題集ではありません。");
  }
  if (
    typeof collection.version !== "number" ||
    collection.version > nextMoveCollectionVersion ||
    collection.version < 1
  ) {
    throw new Error(`未対応のバージョンです: ${collection.version}`);
  }
  if (!Array.isArray(collection.problems)) {
    throw new Error("problems がありません。");
  }
  collection.problems.forEach((problem, index) => {
    validateProblem(problem, index);
  });
  return collection;
}

export function serializeNextMoveCollection(collection: NextMoveCollection): string {
  return JSON.stringify(collection, undefined, 2);
}
