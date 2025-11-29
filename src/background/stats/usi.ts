import {
  addUSIEngineStatsEntry,
  newUSIEngineStats,
  USIEngineStats,
  USIEngineStatsEntry,
} from "@/common/stats/usi";

const statsMap: Map<string, USIEngineStats> = new Map();

export function getStats(uri: string): USIEngineStats | undefined {
  return statsMap.get(uri);
}

export function addStatsEntry(uri: string, entry: USIEngineStatsEntry, launchDate: Date) {
  const date = launchDate.toISOString().substring(0, 10);
  const stats = statsMap.get(uri);
  if (stats) {
    addUSIEngineStatsEntry(stats, entry, date);
    return;
  }
  const newStats = newUSIEngineStats(entry, date);
  statsMap.set(uri, newStats);
}
