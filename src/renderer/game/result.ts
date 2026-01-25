import {
  calculateEloRatingFromWinRate,
  calculateWinRateConfidenceInterval,
  calculateZValue,
  Z_VALUE_95,
  Z_VALUE_99,
} from "@/common/helpers/math.js";

export type PlayerGameResults = {
  name: string;
  win: number;
  winBlack: number;
  winWhite: number;
};

export type GameResults = {
  player1: PlayerGameResults;
  player2: PlayerGameResults;
  draw: number;
  invalid: number;
  total: number;
};

export function newGameResults(name1: string, name2: string): GameResults {
  return {
    player1: { name: name1, win: 0, winBlack: 0, winWhite: 0 },
    player2: { name: name2, win: 0, winBlack: 0, winWhite: 0 },
    draw: 0,
    invalid: 0,
    total: 0,
  };
}

export type GameStatistics = {
  rating: number;
  ratingLower: number;
  ratingUpper: number;
  npIsGreaterThan5: boolean;
  zValue: number;
  significance5pc: boolean;
  significance1pc: boolean;
};

export function calculateGameStatistics(results: GameResults): GameStatistics {
  const n = results.player1.win + results.player2.win;
  const wins = Math.max(results.player1.win, results.player2.win);
  const winRate = wins / n;
  const winRateCI = calculateWinRateConfidenceInterval(Z_VALUE_95, winRate, n);
  const rating = calculateEloRatingFromWinRate(winRate);
  const ratingLower = calculateEloRatingFromWinRate(winRate - winRateCI);
  const ratingUpper = calculateEloRatingFromWinRate(winRate + winRateCI);
  const zValue = Math.abs(calculateZValue(results.player1.win, n, 0.5));
  return {
    rating,
    ratingLower,
    ratingUpper,
    npIsGreaterThan5: n > 10,
    zValue,
    significance5pc: zValue > Z_VALUE_95,
    significance1pc: zValue > Z_VALUE_99,
  };
}

export type SPRTResult = "accept" | "reject" | "inconclusive";

export type SPRTSummary = {
  elo0: number;
  elo1: number;
  alpha: number;
  beta: number;
  pentanomial: {
    loseLose: number;
    loseDraw: number;
    drawDrawOrWinLose: number;
    winDraw: number;
    winWin: number;
  };
  llr: number;
  lowerBound: number;
  upperBound: number;
  result: SPRTResult;
};
