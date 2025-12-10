import {
  addUSIEngineStatsEntry,
  newUSIEngineStatsEntry,
  USIEngineStats,
  USIEngineStatsEntry,
} from "@/background/stats/types";

describe("stats/types", () => {
  it("addUSIEngineStatsEntry", () => {
    const testCases: {
      stats: USIEngineStats;
      entry: USIEngineStatsEntry;
      date: string;
      expected: USIEngineStats;
    }[] = [
      {
        stats: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-01",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [["2024-01-01", { ...newUSIEngineStatsEntry() }]],
          latest: { ...newUSIEngineStatsEntry() },
        },
        entry: { ...newUSIEngineStatsEntry() },
        date: "2024-01-02",
        expected: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-02",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [
            ["2024-01-02", { ...newUSIEngineStatsEntry() }],
            ["2024-01-01", { ...newUSIEngineStatsEntry() }],
          ],
          latest: { ...newUSIEngineStatsEntry() },
        },
      },
      {
        stats: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-01",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [["2024-01-01", { ...newUSIEngineStatsEntry() }]],
          latest: { ...newUSIEngineStatsEntry() },
        },
        entry: { ...newUSIEngineStatsEntry() },
        date: "2024-01-01",
        expected: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-01",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [["2024-01-01", { ...newUSIEngineStatsEntry() }]],
          latest: { ...newUSIEngineStatsEntry() },
        },
      },
      {
        stats: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-05",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [
            ["2024-01-05", { ...newUSIEngineStatsEntry() }],
            ["2024-01-03", { ...newUSIEngineStatsEntry() }],
            ["2024-01-02", { ...newUSIEngineStatsEntry() }],
            ["2024-01-01", { ...newUSIEngineStatsEntry() }],
          ],
          latest: { ...newUSIEngineStatsEntry() },
        },
        entry: { ...newUSIEngineStatsEntry() },
        date: "2024-01-06",
        expected: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-06",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [
            ["2024-01-06", { ...newUSIEngineStatsEntry() }],
            ["2024-01-05", { ...newUSIEngineStatsEntry() }],
            ["2024-01-03", { ...newUSIEngineStatsEntry() }],
            ["2024-01-02", { ...newUSIEngineStatsEntry() }],
            ["2024-01-01", { ...newUSIEngineStatsEntry() }],
          ],
          latest: { ...newUSIEngineStatsEntry() },
        },
      },
      {
        stats: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-06",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [
            ["2024-01-06", { ...newUSIEngineStatsEntry() }],
            ["2024-01-05", { ...newUSIEngineStatsEntry() }],
            ["2024-01-03", { ...newUSIEngineStatsEntry() }],
            ["2024-01-02", { ...newUSIEngineStatsEntry() }],
            ["2024-01-01", { ...newUSIEngineStatsEntry() }],
          ],
          latest: { ...newUSIEngineStatsEntry() },
        },
        entry: { ...newUSIEngineStatsEntry() },
        date: "2024-01-07",
        expected: {
          earliestDate: "2024-01-01",
          latestDate: "2024-01-07",
          allTime: { ...newUSIEngineStatsEntry() },
          daily: [
            ["2024-01-07", { ...newUSIEngineStatsEntry() }],
            ["2024-01-06", { ...newUSIEngineStatsEntry() }],
            ["2024-01-05", { ...newUSIEngineStatsEntry() }],
            ["2024-01-03", { ...newUSIEngineStatsEntry() }],
            ["2024-01-02", { ...newUSIEngineStatsEntry() }],
          ],
          latest: { ...newUSIEngineStatsEntry() },
        },
      },
    ];
    for (const { stats, entry, date, expected } of testCases) {
      const copy = JSON.parse(JSON.stringify(stats)) as USIEngineStats;
      addUSIEngineStatsEntry(copy, entry, date);
      expect(copy).toEqual(expected);
    }
  });
});
