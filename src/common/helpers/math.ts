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

// 重みに比例した確率で要素を 1 つ選択する。
// 重みの合計が 0 以下の場合は先頭の要素を返す。
export function selectWeightedRandom<T>(items: T[], getWeight: (item: T) => number): T {
  const weights = items.map((item) => Math.max(getWeight(item), 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return items[0];
  }
  let remaining = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    remaining -= weights[i];
    if (remaining < 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}
