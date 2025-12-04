import path from "node:path";
import fs from "node:fs/promises";
import { getAppPath } from "@/background/proc/path-electron.js";
import { exists } from "@/background/helpers/file.js";
import { writeFileAtomic } from "@/background/file/atomic.js";
import { sendError } from "@/background/window/ipc.js";
import {
  addUSIEngineStatsEntry,
  newUSIEngineStats,
  USIEngineStatsEntry,
  USIEngineStatsMap,
} from "./types.js";
import { getDateString } from "@/common/helpers/datetime.js";

const statsFilePath = path.join(getAppPath("userData"), "usi_engine_stats.json");

export async function getUSIEngineStatsMap(): Promise<USIEngineStatsMap> {
  if (!(await exists(statsFilePath))) {
    return {};
  }
  const data = await fs.readFile(statsFilePath, "utf-8");
  return JSON.parse(data) as USIEngineStatsMap;
}

export function updateUSIEngineStats(
  engineURI: string,
  newEntry: USIEngineStatsEntry,
  launchDate: Date,
) {
  const date = getDateString(launchDate).replaceAll("/", "-");
  getUSIEngineStatsMap().then((statsMap) => {
    const stats = statsMap[engineURI];
    if (stats) {
      addUSIEngineStatsEntry(stats, newEntry, date);
    } else {
      const newStats = newUSIEngineStats(newEntry, date);
      statsMap[engineURI] = newStats;
    }
    writeFileAtomic(statsFilePath, JSON.stringify(statsMap, undefined, 2), "utf-8").catch(
      sendError,
    );
  });
}
