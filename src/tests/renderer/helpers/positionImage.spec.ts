import { Record, importKIF } from "tsshogi";
import { PositionImageHeaderType } from "@/common/settings/app.js";
import {
  buildPositionImageHeader,
  usesBookmark,
  usesCustomText,
} from "@/renderer/helpers/positionImage.js";

const testRecord = () => {
  const record = importKIF(`
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/0:00:00)
   2 ８四歩(83)   ( 0:00/0:00:00)
   3 ２五歩(26)   ( 0:00/0:00:00)
`) as Record;
  record.goto(3);
  return record;
};

describe("helpers/positionImage", () => {
  it("buildPositionImageHeader", () => {
    const record = testRecord();
    const build = (type: PositionImageHeaderType) =>
      buildPositionImageHeader(record, type, { bookmark: "第1図", custom: "テーマ図" });
    expect(build(PositionImageHeaderType.NONE)).toBe("");
    expect(build(PositionImageHeaderType.BOOKMARK)).toBe("第1図");
    expect(build(PositionImageHeaderType.CUSTOM)).toBe("テーマ図");
    expect(build(PositionImageHeaderType.LAST_MOVE)).toBe("☗２五歩まで");
    expect(build(PositionImageHeaderType.PLY_AND_LAST_MOVE)).toBe("3手目 ☗２五歩まで");
    expect(build(PositionImageHeaderType.BOOKMARK_AND_LAST_MOVE)).toBe("第1図 は ☗２五歩まで");
    expect(build(PositionImageHeaderType.CUSTOM_AND_LAST_MOVE)).toBe("テーマ図 は ☗２五歩まで");
    expect(build(PositionImageHeaderType.BRACKETED_BOOKMARK)).toBe("【第1図】");
    expect(build(PositionImageHeaderType.BRACKETED_CUSTOM)).toBe("【テーマ図】");
    expect(build(PositionImageHeaderType.BRACKETED_LAST_MOVE)).toBe("【☗２五歩まで】");
    expect(build(PositionImageHeaderType.BRACKETED_PLY_AND_LAST_MOVE)).toBe(
      "【3手目 ☗２五歩まで】",
    );
    expect(build(PositionImageHeaderType.BRACKETED_BOOKMARK_AND_LAST_MOVE)).toBe(
      "【第1図 は ☗２五歩まで】",
    );
    expect(build(PositionImageHeaderType.BRACKETED_CUSTOM_AND_LAST_MOVE)).toBe(
      "【テーマ図 は ☗２五歩まで】",
    );
  });

  it("buildPositionImageHeader/emptyText", () => {
    const record = testRecord();
    // しおりと自由入力の間でフォールバックしない。
    const build = (type: PositionImageHeaderType) =>
      buildPositionImageHeader(record, type, { bookmark: "", custom: "テーマ図" });
    expect(build(PositionImageHeaderType.BOOKMARK)).toBe("");
    expect(build(PositionImageHeaderType.BRACKETED_BOOKMARK)).toBe("");
    expect(build(PositionImageHeaderType.BOOKMARK_AND_LAST_MOVE)).toBe("☗２五歩まで");
    expect(build(PositionImageHeaderType.BRACKETED_BOOKMARK_AND_LAST_MOVE)).toBe("【☗２五歩まで】");
  });

  it("buildPositionImageHeader/noLastMove", () => {
    const record = new Record();
    const build = (type: PositionImageHeaderType) =>
      buildPositionImageHeader(record, type, { bookmark: "第1図", custom: "テーマ図" });
    // 最終手が無い場合は手番を表示し、手数は表示しない。
    expect(build(PositionImageHeaderType.NONE)).toBe("");
    expect(build(PositionImageHeaderType.LAST_MOVE)).toBe("先手番");
    expect(build(PositionImageHeaderType.PLY_AND_LAST_MOVE)).toBe("先手番");
    expect(build(PositionImageHeaderType.BOOKMARK_AND_LAST_MOVE)).toBe("第1図 は 先手番");
    expect(build(PositionImageHeaderType.BRACKETED_PLY_AND_LAST_MOVE)).toBe("【先手番】");
  });

  it("usesBookmark/usesCustomText", () => {
    expect(usesBookmark(PositionImageHeaderType.BOOKMARK)).toBe(true);
    expect(usesBookmark(PositionImageHeaderType.BRACKETED_BOOKMARK_AND_LAST_MOVE)).toBe(true);
    expect(usesBookmark(PositionImageHeaderType.CUSTOM)).toBe(false);
    expect(usesBookmark(PositionImageHeaderType.NONE)).toBe(false);
    expect(usesCustomText(PositionImageHeaderType.CUSTOM)).toBe(true);
    expect(usesCustomText(PositionImageHeaderType.BRACKETED_CUSTOM_AND_LAST_MOVE)).toBe(true);
    expect(usesCustomText(PositionImageHeaderType.BOOKMARK)).toBe(false);
    expect(usesCustomText(PositionImageHeaderType.PLY_AND_LAST_MOVE)).toBe(false);
  });
});
