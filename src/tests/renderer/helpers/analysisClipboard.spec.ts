import { exportBOD, Record } from "tsshogi";
import { formatAnalysisClipboard } from "@/renderer/helpers/analysisClipboard.js";
import { USIPlayerMonitor } from "@/renderer/store/usi.js";
import { t } from "@/common/i18n/index.js";
import { SCORE_MATE_INFINITE, USIInfoCommand } from "@/common/game/usi.js";

describe("helpers/analysisClipboard", () => {
  const createMonitor = (record: Record, info: USIInfoCommand = {}) => {
    const monitor = new USIPlayerMonitor(1, "Engine A");
    monitor.update(record.position.sfen, { pv: ["7g7f", "3c3d"], ...info }, 15);
    return monitor;
  };

  it("combines the prompt, current BOD, scores and PVs without changing the record", () => {
    const record = new Record();
    const sfen = record.position.sfen;
    const monitor = createMonitor(record, {
      scoreCP: 120,
      depth: 20,
      seldepth: 30,
      nodes: 123456,
    });
    const text = formatAnalysisClipboard(record, [monitor], "説明してください。\n具体的に。");
    expect(text).toBe(
      `説明してください。\n具体的に。\n\n## BOD\n${exportBOD(record).trimEnd()}\n\n` +
        `## ${t.pv}\n${t.analysisCopyScoreNote}\n\n` +
        `### ${t.engineName}: Engine A\nMultiPV: 1 | ${t.score}: cp 120 | ` +
        `${t.depth}: 20 | seldepth: 30 | ${t.nodes}: 123456\n${t.pv}: ▲７六歩△３四歩`,
    );
    expect(record.position.sfen).toBe(sfen);
    expect(record.current.ply).toBe(0);
  });

  it("uses the current board and leaves white-to-move scores unchanged", () => {
    const record = new Record();
    record.append(record.position.createMoveByUSI("7g7f")!);
    const monitor = createMonitor(record, { pv: ["3c3d"], scoreCP: -80 });
    const text = formatAnalysisClipboard(record, [monitor], "");
    expect(text).toContain(exportBOD(record).trimEnd());
    expect(text).toContain("後手番");
    expect(text).toContain("cp -80");
    expect(text).toContain("△３四歩");
    expect(text).toContain(t.analysisCopyScoreNote);
  });

  it("groups engines and copies the latest MultiPV candidates in rank order", () => {
    const record = new Record();
    const a = createMonitor(record, { multipv: 1, scoreCP: 50 });
    a.update(record.position.sfen, { multipv: 2, pv: ["2g2f"], scoreCP: 30 }, 15);
    a.update(record.position.sfen, { multipv: 1, pv: ["7g7f"], scoreCP: 70 }, 15);
    const b = createMonitor(record, { scoreCP: 90 });
    b.name = "Engine B";
    const text = formatAnalysisClipboard(record, [a, b], "")!;
    expect(text.indexOf("MultiPV: 1")).toBeLessThan(text.indexOf("MultiPV: 2"));
    expect(text.indexOf("MultiPV: 2")).toBeLessThan(text.indexOf("Engine B"));
    expect(text).toContain("cp 70");
    expect(text).toContain("cp 30");
    expect(text).toContain("cp 90");
    expect(text).not.toContain("cp 50");
  });

  it("excludes other positions, empty PVs and pondering sessions", () => {
    const record = new Record();
    const stale = createMonitor(record);
    const other = new Record();
    other.append(other.position.createMoveByUSI("2g2f")!);
    expect(formatAnalysisClipboard(other, [stale], "prompt")).toBeUndefined();
    const empty = createMonitor(record, { pv: [], scoreCP: 50 });
    const pondering = createMonitor(record);
    pondering.ponderMove = "☗７六歩";
    expect(formatAnalysisClipboard(record, [empty, pondering], "prompt")).toBeUndefined();
    const valid = createMonitor(record);
    valid.name = "Valid engine";
    const text = formatAnalysisClipboard(record, [empty, pondering, valid], "")!;
    expect(text).toContain("Valid engine");
    expect(text).not.toContain("Engine A");
  });

  it("copies more than 15 moves even when display text is truncated", () => {
    const record = new Record();
    const pv = [
      "9g9f",
      "9c9d",
      "8g8f",
      "8c8d",
      "7g7f",
      "7c7d",
      "6g6f",
      "6c6d",
      "5g5f",
      "5c5d",
      "4g4f",
      "4c4d",
      "3g3f",
      "3c3d",
      "2g2f",
      "2c2d",
    ];
    const monitor = createMonitor(record, { pv });
    expect(monitor.latestInfo[0].text).toContain("...");
    const text = formatAnalysisClipboard(record, [monitor], "")!;
    expect(text).toContain("▲２六歩△２四歩");
    expect(text).not.toContain("...");
    expect(text).not.toContain(t.analysisCopyTruncatedPV);
  });

  it.each([
    [{ scoreCP: 0 }, "cp 0"],
    [{ scoreCP: 120, lowerbound: true }, "cp >= 120"],
    [{ scoreCP: -80, upperbound: true }, "cp <= -80"],
    [{ scoreMate: 5 }, "mate 5"],
    [{ scoreMate: -6 }, "mate -6"],
    [{ scoreMate: 0 }, "mate 0"],
    [{ scoreMate: SCORE_MATE_INFINITE }, "mate +"],
    [{ scoreMate: -SCORE_MATE_INFINITE }, "mate -"],
    [{ scoreMate: 7, lowerbound: true }, "mate >= 7"],
    [{}, t.unknown],
  ] satisfies [USIInfoCommand, string][])("formats score %j", (info, expected) => {
    const record = new Record();
    const text = formatAnalysisClipboard(record, [createMonitor(record, info)], "");
    expect(text).toContain(`${t.score}: ${expected}\n`);
    expect(text).not.toContain("undefined");
  });

  it("marks partial invalid PVs and skips PVs without any valid move", () => {
    const record = new Record();
    const partial = createMonitor(record, { pv: ["7g7f", "invalid", "3c3d"] });
    const text = formatAnalysisClipboard(record, [partial], "");
    expect(text).toContain(`▲７六歩 (${t.analysisCopyTruncatedPV})`);
    expect(text).not.toContain("△３四歩");
    const invalid = createMonitor(record, { pv: ["invalid"] });
    expect(formatAnalysisClipboard(record, [invalid], "")).toBeUndefined();
  });

  it("allows an empty prompt and returns nothing without analysis", () => {
    const record = new Record();
    expect(formatAnalysisClipboard(record, [createMonitor(record)], " \n ")).toMatch(/^## BOD/);
    expect(formatAnalysisClipboard(record, [], "prompt")).toBeUndefined();
  });
});
