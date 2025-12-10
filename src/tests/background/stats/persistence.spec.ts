import path from "node:path";
import fs from "node:fs";
import { updateUSIEngineStats } from "@/background/stats/persistence";
import { newUSIEngineStatsEntry } from "@/background/stats/types";
import { getTempPathForTesting } from "@/background/proc/env";

const usiEngineStatsFilePath = path.join(
  getTempPathForTesting(),
  "userData",
  "usi_engine_stats.json",
);

describe("stats/persistence", () => {
  beforeEach(() => {
    fs.rmSync(usiEngineStatsFilePath, { force: true });
  });

  it("updateUSIEngineStats", async () => {
    await updateUSIEngineStats(
      "es://usi-engine/foo",
      { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 12030 },
      new Date("2024-01-01T12:34:56Z"),
    );
    const data1 = fs.readFileSync(usiEngineStatsFilePath, "utf-8");
    expect(JSON.parse(data1)).toEqual({
      "es://usi-engine/foo": {
        earliestDate: "2024-01-01",
        latestDate: "2024-01-01",
        allTime: { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 12030 },
        daily: [["2024-01-01", { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 12030 }]],
        latest: { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 12030 },
      },
    });

    await updateUSIEngineStats(
      "es://usi-engine/foo",
      { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 11410 },
      new Date("2024-01-02T12:34:56Z"),
    );
    const data2 = fs.readFileSync(usiEngineStatsFilePath, "utf-8");
    expect(JSON.parse(data2)).toEqual({
      "es://usi-engine/foo": {
        earliestDate: "2024-01-01",
        latestDate: "2024-01-02",
        allTime: { ...newUSIEngineStatsEntry(), runCount: 2, totalUptimeMs: 23440 },
        daily: [
          ["2024-01-02", { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 11410 }],
          ["2024-01-01", { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 12030 }],
        ],
        latest: { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 11410 },
      },
    });

    await updateUSIEngineStats(
      "es://usi-engine/bar",
      { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 25920 },
      new Date("2024-01-02T12:34:56Z"),
    );
    const data3 = fs.readFileSync(usiEngineStatsFilePath, "utf-8");
    expect(JSON.parse(data3)).toEqual({
      "es://usi-engine/foo": {
        earliestDate: "2024-01-01",
        latestDate: "2024-01-02",
        allTime: { ...newUSIEngineStatsEntry(), runCount: 2, totalUptimeMs: 23440 },
        daily: [
          ["2024-01-02", { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 11410 }],
          ["2024-01-01", { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 12030 }],
        ],
        latest: { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 11410 },
      },
      "es://usi-engine/bar": {
        earliestDate: "2024-01-02",
        latestDate: "2024-01-02",
        allTime: { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 25920 },
        daily: [["2024-01-02", { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 25920 }]],
        latest: { ...newUSIEngineStatsEntry(), runCount: 1, totalUptimeMs: 25920 },
      },
    });
  });
});
