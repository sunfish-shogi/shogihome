export const Z_VALUE_95 = 1.96;
export const Z_VALUE_99 = 2.58;

export function calculateZValue(x: number, n: number, p: number) {
  return Math.abs(x - n * p) / Math.sqrt(p * (1 - p) * n);
}

export function calculateEloRatingFromWinRate(winRate: number) {
  return 400 * Math.log10(winRate / (1 - winRate));
}

export function calculateWinRateConfidenceInterval(zValue: number, winRate: number, n: number) {
  return zValue * Math.sqrt((winRate * (1 - winRate)) / n);
}
