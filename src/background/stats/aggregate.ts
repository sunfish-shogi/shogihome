import { StatsAggregate, USIEngineStatsList } from "@/common/stats/aggregate";
import { loadUSIEngines } from "@/background/settings";
import { getStats as getUSIEngineStats } from "./usi";

export async function getStatsAggregate(): Promise<StatsAggregate> {
  const usiEngines = await loadUSIEngines();
  const usiEngineStatsList: USIEngineStatsList = [];
  for (const engine of usiEngines.engineList) {
    const stats = getUSIEngineStats(engine.uri);
    if (stats) {
      usiEngineStatsList.push({
        uri: engine.uri,
        name: engine.name,
        stats: stats,
      });
    }
  }
  return {
    usiEngineStatsList: usiEngineStatsList,
  };
}
