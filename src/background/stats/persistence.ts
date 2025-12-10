import path from "node:path";
import fs from "node:fs/promises";
import AsyncLock from "async-lock";
import { getAppPath } from "@/background/proc/path-electron.js";
import { exists } from "@/background/helpers/file.js";
import { writeFileAtomic } from "@/background/file/atomic.js";
import {
  addUSIEngineStatsEntry,
  newUSIEngineStats,
  newUSIEngineStatsEntry,
  USIEngineStatsEntry,
  USIEngineStatsMap,
} from "./types.js";
import { getDateString } from "@/common/helpers/datetime.js";

const lock = new AsyncLock();
const usiEngineStatsLockKey = "usi-engine-stats";

const usiEngineStatsFilePath = path.join(getAppPath("userData"), "usi_engine_stats.json");

function normalizeEntry(entry: Partial<USIEngineStatsEntry>): USIEngineStatsEntry {
  const template = newUSIEngineStatsEntry();
  return { ...template, ...entry };
}

export async function getUSIEngineStatsMap(): Promise<USIEngineStatsMap> {
  if (!(await exists(usiEngineStatsFilePath))) {
    return {};
  }
  const data = await fs.readFile(usiEngineStatsFilePath, "utf-8");
  return Object.fromEntries(
    Object.entries(JSON.parse(data) as USIEngineStatsMap).map(([key, value]) => [
      key,
      {
        earliestDate: value.earliestDate,
        latestDate: value.latestDate,
        latest: normalizeEntry(value.latest),
        daily: value.daily.map(([date, entry]) => [date, normalizeEntry(entry)]),
        allTime: normalizeEntry(value.allTime),
      },
    ]),
  );
}

export function updateUSIEngineStats(
  engineURI: string,
  newEntry: USIEngineStatsEntry,
  launchDate: Date,
) {
  return lock.acquire(usiEngineStatsLockKey, async () => {
    const date = getDateString(launchDate).replaceAll("/", "-");
    const statsMap = await getUSIEngineStatsMap();
    const stats = statsMap[engineURI];
    if (stats) {
      addUSIEngineStatsEntry(stats, newEntry, date);
    } else {
      const newStats = newUSIEngineStats(newEntry, date);
      statsMap[engineURI] = newStats;
    }
    await writeFileAtomic(usiEngineStatsFilePath, JSON.stringify(statsMap, undefined, 2), "utf-8");
  });
}
