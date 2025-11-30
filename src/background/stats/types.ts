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
