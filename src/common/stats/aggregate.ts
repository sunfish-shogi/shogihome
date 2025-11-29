import { USIEngineStats } from "./usi";

export type USIEngineStatsListEntry = {
  uri: string;
  name: string;
  stats: USIEngineStats;
};

export type USIEngineStatsList = USIEngineStatsListEntry[];

export type StatsAggregate = {
  usiEngineStatsList: USIEngineStatsList;
};
