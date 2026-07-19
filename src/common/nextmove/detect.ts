import { Color, ImmutableRecord, Move, RecordMetadataKey } from "tsshogi";
import { parseComment } from "@/common/record/comment.js";
import { scoreToPercentage } from "@/common/record/score.js";
import { PlayerCriteria } from "@/common/settings/book.js";
import { NextMoveCandidate } from "./collection.js";

export type BlunderDetectionCriteria = {
  winRateDropThreshold: number; // 悪手と判定する勝率の下降幅 (%)
  minWinRate: number; // 対象とする手番側勝率の下限 (%)。これ未満の劣勢局面は除外する。
  coefficientInSigmoid: number; // 評価値を勝率に換算するシグモイド係数
  minPly: number; // 対象とする手数の下限
  maxPly: number; // 対象とする手数の上限
  playerCriteria: PlayerCriteria; // 対象とする対局者
  playerName?: string; // 対局者名 (FILTER_BY_NAME の場合のみ・部分一致)
};

export type BlunderCandidate = {
  ply: number; // 実戦の手の手数 (1 始まり)
  scoreBeforeMove: number; // 直前局面の評価値 (先手視点)
  scoreAfterMove: number; // 直後局面の評価値 (先手視点)
};

function getScoreFromComment(comment: string): number | undefined {
  if (!comment) {
    return undefined;
  }
  const data = parseComment(comment);
  return data.researchInfo?.score ?? data.playerSearchInfo?.score;
}

function matchPlayerCriteria(
  record: ImmutableRecord,
  color: Color,
  criteria: BlunderDetectionCriteria,
): boolean {
  switch (criteria.playerCriteria) {
    case PlayerCriteria.ALL:
      return true;
    case PlayerCriteria.BLACK:
      return color === Color.BLACK;
    case PlayerCriteria.WHITE:
      return color === Color.WHITE;
    case PlayerCriteria.FILTER_BY_NAME: {
      if (!criteria.playerName) {
        return false;
      }
      const key =
        color === Color.BLACK ? RecordMetadataKey.BLACK_NAME : RecordMetadataKey.WHITE_NAME;
      const name = record.metadata.getStandardMetadata(key);
      return !!name && name.includes(criteria.playerName);
    }
  }
}

/**
 * 先手視点の評価値を手番側から見た勝率 (%) に換算します。
 */
function winRateFromBlackScore(blackScore: number, color: Color, coefficient: number): number {
  const sign = color === Color.BLACK ? 1 : -1;
  return scoreToPercentage(blackScore * sign, coefficient);
}

/**
 * 棋譜の解析コメントを使って悪手 (手番側から見て勝率が閾値以上下降した指し手) を検出します。
 * 分岐は対象とせず、現在選択されている手順のみを走査します。
 *
 * 勝率が下限 (minWinRate) を下回る劣勢局面は対象外とします。これは上下界を対称に扱わないための
 * 措置で、優勢な局面での悪手 (勝ちを逃した局面) は重要である一方、劣勢からの逆転は相手依存で
 * 重要度が低いという考えに基づきます。
 */
export function detectBlunders(
  record: ImmutableRecord,
  criteria: BlunderDetectionCriteria,
): BlunderCandidate[] {
  const results: BlunderCandidate[] = [];
  const nodes = record.moves;
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const move = node.move;
    if (!(move instanceof Move)) {
      continue;
    }
    if (node.ply < criteria.minPly || node.ply > criteria.maxPly) {
      continue;
    }
    if (!matchPlayerCriteria(record, move.color, criteria)) {
      continue;
    }
    const scoreBeforeMove = getScoreFromComment(nodes[i - 1].comment);
    const scoreAfterMove = getScoreFromComment(node.comment);
    if (scoreBeforeMove === undefined || scoreAfterMove === undefined) {
      continue;
    }
    const winRateBefore = winRateFromBlackScore(
      scoreBeforeMove,
      move.color,
      criteria.coefficientInSigmoid,
    );
    const winRateAfter = winRateFromBlackScore(
      scoreAfterMove,
      move.color,
      criteria.coefficientInSigmoid,
    );
    // すでに手番側が劣勢な局面 (劣勢からの逆転は相手依存) は対象外とする。
    if (winRateBefore < criteria.minWinRate) {
      continue;
    }
    if (winRateBefore - winRateAfter < criteria.winRateDropThreshold) {
      continue;
    }
    results.push({ ply: node.ply, scoreBeforeMove, scoreAfterMove });
  }
  return results;
}

export type AdoptionCriteria = {
  adoptionWinRateDiff: number; // 最善手と実戦の手の勝率差の閾値 (%)
  acceptableWinRateDiff: number; // 正解として扱う最善手との勝率差 (%)
  minWinRate: number; // 逆転可能とみなす手番側勝率の下限 (%)。最善手を指してもこれ未満なら除外。
  coefficientInSigmoid: number; // 評価値を勝率に換算するシグモイド係数
};

export type AdoptionResult = {
  adopted: boolean;
  candidates: NextMoveCandidate[]; // accepted フラグを設定した候補手
};

// 詰みを評価値に換算する際の基準値。通常の評価値より十分に大きな値を使う。
const mateScoreBase = 10000000;

/**
 * 候補手の良さを手番側から見た数値に変換します。
 * 詰みは通常の評価値より優先され、手数が短いほど良い (負けの詰みは手数が長いほど良い) とします。
 */
function candidateValue(
  color: Color,
  entry: { score?: number; mate?: number },
): number | undefined {
  const sign = color === Color.BLACK ? 1 : -1;
  if (entry.mate !== undefined) {
    const mate = entry.mate * sign;
    return mate > 0 ? mateScoreBase - mate : -mateScoreBase - mate;
  }
  if (entry.score !== undefined) {
    return entry.score * sign;
  }
  return undefined;
}

/**
 * 候補手の良さを手番側から見た勝率 (%) に変換します。
 */
function candidateWinRate(
  color: Color,
  entry: { score?: number; mate?: number },
  coefficient: number,
): number | undefined {
  const value = candidateValue(color, entry);
  return value === undefined ? undefined : scoreToPercentage(value, coefficient);
}

/**
 * MultiPV 再探索の結果から問題として採用するかどうかを判定し、
 * 正解として扱う候補手に accepted フラグを設定します。
 *
 * - 最善手が実戦の手と一致する場合は不採用とします。
 * - 最善手を指しても手番側の勝率が minWinRate を下回る場合 (すでに逆転困難な局面) は不採用とします。
 * - 最善手と実戦の手の勝率差が閾値未満の場合は不採用とします。
 * - すべての候補手が正解となる場合 (どの手を指しても大差ない場合) は不採用とします。
 */
export function judgeProblemAdoption(params: {
  color: Color; // 出題局面の手番
  candidates: NextMoveCandidate[]; // 良い順に並んだ候補手 (評価値は先手視点)
  actualMove: { usi: string; score?: number; mate?: number }; // 実戦の手 (評価値は先手視点)
  criteria: AdoptionCriteria;
}): AdoptionResult {
  const { color, actualMove, criteria } = params;
  const coefficient = criteria.coefficientInSigmoid;
  const candidates = params.candidates.map((candidate) => ({ ...candidate, accepted: false }));
  const result: AdoptionResult = { adopted: false, candidates };
  if (candidates.length === 0) {
    return result;
  }
  const best = candidates[0];
  const bestWinRate = candidateWinRate(color, best, coefficient);
  if (bestWinRate === undefined) {
    return result;
  }
  candidates[0].accepted = true;
  // 最善手を尽くしても手番側が劣勢な局面は、すでに逆転困難なため問題として採用しない。
  if (bestWinRate < criteria.minWinRate) {
    return result;
  }
  for (let i = 1; i < candidates.length; i++) {
    const winRate = candidateWinRate(color, candidates[i], coefficient);
    candidates[i].accepted =
      winRate !== undefined && bestWinRate - winRate <= criteria.acceptableWinRateDiff;
  }
  if (best.usi === actualMove.usi) {
    return result;
  }
  // 実戦の手が候補手に含まれる場合は再探索の評価値を優先する。
  const actualCandidate = candidates.find((candidate) => candidate.usi === actualMove.usi);
  const actualWinRate = candidateWinRate(color, actualCandidate || actualMove, coefficient);
  if (actualWinRate === undefined) {
    return result;
  }
  if (bestWinRate - actualWinRate < criteria.adoptionWinRateDiff) {
    return result;
  }
  if (candidates.every((candidate) => candidate.accepted)) {
    return result;
  }
  result.adopted = true;
  return result;
}
