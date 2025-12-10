export type USIEngineStatsEntry = {
  // 起動
  runCount: number;
  totalUptimeMs: number;

  // 対局
  gameCount: number;
  totalReadyTimeMs: number;
  winCount: number;
  loseCount: number;
  drawCount: number;

  // 思考のインタラクション
  goCount: number; // go ponder / go infinite / go mate を含まない
  goPonderCount: number;
  ponderHitCount: number;
  goInfiniteCount: number;
  goMateCount: number;
  totalGoTimeMs: number;
  totalMateTimeMs: number;

  // ノード数
  totalNodeCount: number;
  maxNPS: number;
  npsSampleCount: number;
  meanNPS: number;

  // 深さ
  maxDepth: number;
  maxDepthTimeMs: number;
  maxSelDepth: number;
  depth20Count: number;
  depth20TotalTimeMs: number;
  depth30Count: number;
  depth30TotalTimeMs: number;
  depth40Count: number;
  depth40TotalTimeMs: number;
  depth50Count: number;
  depth50TotalTimeMs: number;

  // ハッシュ使用率
  maxHashUsagePercent: number;
  hashUsageSampleCount: number;
  meanHashUsagePercent: number;
  hashUsageOver50PercentCount: number;
  hashUsageOver70PercentCount: number;
  hashUsageOver90PercentCount: number;
};

export function newUSIEngineStatsEntry(): USIEngineStatsEntry {
  return {
    runCount: 0,
    totalUptimeMs: 0,
    gameCount: 0,
    totalReadyTimeMs: 0,
    winCount: 0,
    loseCount: 0,
    drawCount: 0,
    goCount: 0,
    goPonderCount: 0,
    ponderHitCount: 0,
    goInfiniteCount: 0,
    goMateCount: 0,
    totalGoTimeMs: 0,
    totalMateTimeMs: 0,
    totalNodeCount: 0,
    maxNPS: 0,
    npsSampleCount: 0,
    meanNPS: 0,
    maxDepth: 0,
    maxDepthTimeMs: 0,
    maxSelDepth: 0,
    depth20Count: 0,
    depth20TotalTimeMs: 0,
    depth30Count: 0,
    depth30TotalTimeMs: 0,
    depth40Count: 0,
    depth40TotalTimeMs: 0,
    depth50Count: 0,
    depth50TotalTimeMs: 0,
    maxHashUsagePercent: 0,
    hashUsageSampleCount: 0,
    meanHashUsagePercent: 0,
    hashUsageOver50PercentCount: 0,
    hashUsageOver70PercentCount: 0,
    hashUsageOver90PercentCount: 0,
  };
}

export type USIEngineStats = {
  earliestDate: string;
  latestDate: string;
  latest: USIEngineStatsEntry;
  daily: [string, USIEngineStatsEntry][];
  allTime: USIEngineStatsEntry;
};

export function newUSIEngineStats(firstEntry: USIEngineStatsEntry, date: string): USIEngineStats {
  return {
    earliestDate: date,
    latestDate: date,
    latest: firstEntry,
    daily: [[date, firstEntry]],
    allTime: { ...firstEntry },
  };
}

function addUSIEngineStatsEntryValues(
  a: USIEngineStatsEntry,
  b: USIEngineStatsEntry,
): USIEngineStatsEntry {
  return {
    runCount: a.runCount + b.runCount,
    totalUptimeMs: a.totalUptimeMs + b.totalUptimeMs,
    gameCount: a.gameCount + b.gameCount,
    totalReadyTimeMs: a.totalReadyTimeMs + b.totalReadyTimeMs,
    winCount: a.winCount + b.winCount,
    loseCount: a.loseCount + b.loseCount,
    drawCount: a.drawCount + b.drawCount,
    goCount: a.goCount + b.goCount,
    goPonderCount: a.goPonderCount + b.goPonderCount,
    ponderHitCount: a.ponderHitCount + b.ponderHitCount,
    goInfiniteCount: a.goInfiniteCount + b.goInfiniteCount,
    goMateCount: a.goMateCount + b.goMateCount,
    totalGoTimeMs: a.totalGoTimeMs + b.totalGoTimeMs,
    totalMateTimeMs: a.totalMateTimeMs + b.totalMateTimeMs,
    totalNodeCount: a.totalNodeCount + b.totalNodeCount,
    maxNPS: Math.max(a.maxNPS, b.maxNPS),
    npsSampleCount: a.npsSampleCount + b.npsSampleCount,
    meanNPS:
      a.npsSampleCount + b.npsSampleCount === 0
        ? 0
        : (a.meanNPS * a.npsSampleCount + b.meanNPS * b.npsSampleCount) /
          (a.npsSampleCount + b.npsSampleCount),
    maxDepth: Math.max(a.maxDepth, b.maxDepth),
    maxDepthTimeMs: a.maxDepth >= b.maxDepth ? a.maxDepthTimeMs : b.maxDepthTimeMs,
    maxSelDepth: Math.max(a.maxSelDepth, b.maxSelDepth),
    depth20Count: a.depth20Count + b.depth20Count,
    depth20TotalTimeMs: a.depth20TotalTimeMs + b.depth20TotalTimeMs,
    depth30Count: a.depth30Count + b.depth30Count,
    depth30TotalTimeMs: a.depth30TotalTimeMs + b.depth30TotalTimeMs,
    depth40Count: a.depth40Count + b.depth40Count,
    depth40TotalTimeMs: a.depth40TotalTimeMs + b.depth40TotalTimeMs,
    depth50Count: a.depth50Count + b.depth50Count,
    depth50TotalTimeMs: a.depth50TotalTimeMs + b.depth50TotalTimeMs,
    maxHashUsagePercent: Math.max(a.maxHashUsagePercent, b.maxHashUsagePercent),
    hashUsageSampleCount: a.hashUsageSampleCount + b.hashUsageSampleCount,
    meanHashUsagePercent:
      a.hashUsageSampleCount + b.hashUsageSampleCount === 0
        ? 0
        : (a.meanHashUsagePercent * a.hashUsageSampleCount +
            b.meanHashUsagePercent * b.hashUsageSampleCount) /
          (a.hashUsageSampleCount + b.hashUsageSampleCount),
    hashUsageOver50PercentCount: a.hashUsageOver50PercentCount + b.hashUsageOver50PercentCount,
    hashUsageOver70PercentCount: a.hashUsageOver70PercentCount + b.hashUsageOver70PercentCount,
    hashUsageOver90PercentCount: a.hashUsageOver90PercentCount + b.hashUsageOver90PercentCount,
  };
}

export function addUSIEngineStatsEntry(
  stats: USIEngineStats,
  entry: USIEngineStatsEntry,
  date: string,
) {
  if (stats.latestDate !== date) {
    stats.daily.unshift([date, entry]);
  } else {
    const oldEntry = stats.daily[0][1];
    const newEntry = oldEntry ? addUSIEngineStatsEntryValues(oldEntry, entry) : entry;
    stats.daily[0][1] = newEntry;
  }
  if (stats.daily.length > 5) {
    stats.daily.pop();
  }
  stats.latestDate = date;
  stats.latest = entry;
  stats.allTime = addUSIEngineStatsEntryValues(stats.allTime, entry);
}

export type USIEngineStatsMap = { [key: string]: USIEngineStats };
export type PartialUSIEngineStatsMap = { [key: string]: Partial<USIEngineStats> };
