import { defaultRecordFileName } from "@/helpers/path";
import { RecordMetadata, RecordMetadataKey } from "@/shogi";

describe("helpers/path", () => {
  it("defaultRecordFileName/emptyMetadata", async () => {
    const meta = new RecordMetadata();
    expect(defaultRecordFileName(meta)).toMatch(/^[0-9]{8}\.kif$/);
  });

  it("defaultRecordFileName/withDate", async () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/09/30");
    expect(defaultRecordFileName(meta)).toBe("20220930.kif");
  });

  it("defaultRecordFileName/withStartDateTime", async () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(
      RecordMetadataKey.START_DATETIME,
      "2022/01/02 11:30"
    );
    expect(defaultRecordFileName(meta)).toBe("20220102_1130.kif");
  });

  it("defaultRecordFileName/withTitle", async () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(
      RecordMetadataKey.START_DATETIME,
      "2022/01/02 11:30"
    );
    meta.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    expect(defaultRecordFileName(meta)).toBe("20220102_1130_My New Game.kif");
  });

  it("defaultRecordFileName/withTournament", async () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(
      RecordMetadataKey.START_DATETIME,
      "2022/01/02 11:30"
    );
    meta.setStandardMetadata(RecordMetadataKey.TOURNAMENT, "My Tournament");
    expect(defaultRecordFileName(meta)).toBe("20220102_1130_My Tournament.kif");
  });

  it("defaultRecordFileName/withPlayerName", async () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    meta.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(defaultRecordFileName(meta)).toBe("20220101_先手の人_後手の人.kif");
  });

  it("defaultRecordFileName/withTitleAndPlayerName", async () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    meta.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    meta.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(defaultRecordFileName(meta)).toBe(
      "20220101_My New Game_先手の人_後手の人.kif"
    );
  });
});
