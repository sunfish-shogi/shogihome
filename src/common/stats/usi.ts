export type USIEngineStatsEntry = {
  // 起動に関する統計情報
  runCount: number;
  totalUptimeMs: number;

  // 対局に関する統計情報
  gameCount: number;
  totalReadyTimeMs: number;
  winCount: number;
  loseCount: number;
  drawCount: number;

  // 思考に関する統計情報
  goCount: number; // go ponder / go infinite / go mate を含まない
  goPonderCount: number;
  ponderHitCount: number;
  goInfiniteCount: number;
  goMateCount: number;
  totalGoTimeMs: number;
  totalMateTimeMs: number;
};

export function newUSIEngineStatsEntry(): USIEngineStatsEntry {
  return {
    runCount: 1,
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
  };
}

export type USIEngineStats = {
  earliestDate: string;
  latestDate: string;
  latest: USIEngineStatsEntry;
  daily: Map<string, USIEngineStatsEntry>;
  allTime: USIEngineStatsEntry;
};

export function newUSIEngineStats(firstEntry: USIEngineStatsEntry, date: string): USIEngineStats {
  const daily = new Map<string, USIEngineStatsEntry>();
  daily.set(date, firstEntry);

  return {
    earliestDate: date,
    latestDate: date,
    latest: firstEntry,
    daily: daily,
    allTime: { ...firstEntry },
  };
}

export function addUSIEngineStatsEntry(
  stats: USIEngineStats,
  entry: USIEngineStatsEntry,
  date: string,
) {
  if (stats.latestDate !== date) {
    stats.daily.set(date, entry);
  } else {
    const oldEntry = stats.daily.get(date);
    const newEntry = oldEntry ? addUSIEngineStatsEntryValues(oldEntry, entry) : entry;
    stats.daily.set(date, newEntry);
  }
  stats.latestDate = date;
  stats.latest = entry;
  stats.allTime = addUSIEngineStatsEntryValues(stats.allTime, entry);
}
