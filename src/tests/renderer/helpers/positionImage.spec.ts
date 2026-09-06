import { Record, importKIF } from "tsshogi";
import { PositionImageHeaderType } from "@/common/settings/app.js";
import { buildPositionImageHeader } from "@/renderer/helpers/positionImage.js";

describe("helpers/positionImage", () => {
  it("buildPositionImageHeader/lastMoveExists", () => {
    const record = importKIF(`
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/0:00:00)
   2 ８四歩(83)   ( 0:00/0:00:00)
   3 ２五歩(26)   ( 0:00/0:00:00)
`) as Record;
    record.goto(3);
    const build = (type: PositionImageHeaderType, custom: string = "") =>
      buildPositionImageHeader(record, type, custom);
    expect(build(PositionImageHeaderType.NONE)).toBe("");
    expect(build(PositionImageHeaderType.PLY_AND_LAST_MOVE)).toBe("3手目 ☗２五歩まで");
    expect(build(PositionImageHeaderType.LAST_MOVE)).toBe("☗２五歩まで");
    expect(build(PositionImageHeaderType.CUSTOM, "第1図")).toBe("第1図");
    expect(build(PositionImageHeaderType.CUSTOM_AND_LAST_MOVE, "第1図")).toBe(
      "第1図 は ☗２五歩まで",
    );
    // 入力テキストが空の場合
    expect(build(PositionImageHeaderType.CUSTOM)).toBe("3手目 ☗２五歩まで");
    expect(build(PositionImageHeaderType.CUSTOM_AND_LAST_MOVE)).toBe("☗２五歩まで");
    // 括弧付き
    expect(build(PositionImageHeaderType.BRACKETED_PLY_AND_LAST_MOVE)).toBe(
      "【3手目 ☗２五歩まで】",
    );
    expect(build(PositionImageHeaderType.BRACKETED_LAST_MOVE)).toBe("【☗２五歩まで】");
    expect(build(PositionImageHeaderType.BRACKETED_CUSTOM, "第1図")).toBe("【第1図】");
    expect(build(PositionImageHeaderType.BRACKETED_CUSTOM_AND_LAST_MOVE, "第1図")).toBe(
      "【第1図 は ☗２五歩まで】",
    );
  });

  it("buildPositionImageHeader/bookmark", () => {
    const record = importKIF(`
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/0:00:00)
`) as Record;
    record.goto(1);
    record.current.bookmark = "第2図";
    // しおりが設定されている場合は入力テキストよりも優先する。
    expect(buildPositionImageHeader(record, PositionImageHeaderType.CUSTOM, "第1図")).toBe("第2図");
    expect(
      buildPositionImageHeader(record, PositionImageHeaderType.CUSTOM_AND_LAST_MOVE, "第1図"),
    ).toBe("第2図 は ☗２六歩まで");
  });

  it("buildPositionImageHeader/noLastMove", () => {
    const record = new Record();
    expect(buildPositionImageHeader(record, PositionImageHeaderType.NONE, "第1図")).toBe("");
    expect(buildPositionImageHeader(record, PositionImageHeaderType.PLY_AND_LAST_MOVE, "")).toBe(
      "先手番",
    );
    expect(buildPositionImageHeader(record, PositionImageHeaderType.LAST_MOVE, "")).toBe("先手番");
    expect(
      buildPositionImageHeader(record, PositionImageHeaderType.CUSTOM_AND_LAST_MOVE, "第1図"),
    ).toBe("第1図 は 先手番");
    expect(
      buildPositionImageHeader(record, PositionImageHeaderType.BRACKETED_PLY_AND_LAST_MOVE, ""),
    ).toBe("【先手番】");
  });
});
