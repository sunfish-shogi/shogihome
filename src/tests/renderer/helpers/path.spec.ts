import { generateRecordFileName, dirname, join, basename } from "@/renderer/helpers/path.js";
import { Move, Record, RecordMetadataKey, SpecialMoveType } from "tsshogi";

describe("helpers/path", () => {
  it("basename", () => {
    expect(basename("/home/user/foo/bar.baz")).toBe("bar.baz");
    expect(basename("C:\\\\foo\\bar.baz")).toBe("bar.baz");
    expect(basename("file:///home/user/foo/bar.baz")).toBe("bar.baz");
  });

  it("dirname", () => {
    expect(dirname("/home/user/foo/bar.baz")).toBe("/home/user/foo");
    expect(dirname("C:\\\\foo\\bar.baz")).toBe("C:\\\\foo");
    expect(dirname("file:///home/user/foo/bar.baz")).toBe("file:///home/user/foo");
  });

  it("join", () => {
    expect(join("/home/user/foo", "bar/baz.qux")).toBe("/home/user/foo/bar/baz.qux");
    expect(join("/home/user/foo/", "/bar/baz.qux")).toBe("/home/user/foo/bar/baz.qux");
    expect(join("./foo/", "/bar/baz.qux")).toBe("./foo/bar/baz.qux");
    expect(join("C:\\\\Users\\foo\\", "\\bar\\baz.qux")).toBe("C:\\\\Users\\foo\\bar\\baz.qux");
  });

  it("generateRecordFileName/emptyMetadata", () => {
    const record = new Record();
    expect(generateRecordFileName(record)).toMatch(/^[0-9]{8}\.kif$/);
  });

  it("generateRecordFileName/withDate", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/09/30");
    expect(generateRecordFileName(record)).toBe("20220930.kif");
  });

  it("generateRecordFileName/withStartDateTime", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.START_DATETIME, "2022/01/02 11:30");
    expect(generateRecordFileName(record)).toBe("20220102_1130.kif");
  });

  it("generateRecordFileName/withTitle", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.START_DATETIME, "2022/01/02 11:30");
    record.metadata.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    expect(generateRecordFileName(record)).toBe("20220102_1130_My New Game.kif");
  });

  it("generateRecordFileName/withTournament", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.START_DATETIME, "2022/01/02 11:30");
    record.metadata.setStandardMetadata(RecordMetadataKey.TOURNAMENT, "My Tournament");
    expect(generateRecordFileName(record)).toBe("20220102_1130_My Tournament.kif");
  });

  it("generateRecordFileName/withPlayerName", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(generateRecordFileName(record)).toBe("20220101_先手の人_後手の人.kif");
  });

  it("generateRecordFileName/withTitleAndPlayerName", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(generateRecordFileName(record)).toBe("20220101_My New Game_先手の人_後手の人.kif");
  });

  it("generateRecordFileName/escape", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "Foo:Bar<Baz");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "Qux|Quux>Corge");
    expect(generateRecordFileName(record)).toBe("20220101_Foo_Bar_Baz_Qux_Quux_Corge.kif");
  });

  it("generateRecordFileName/customTemplate", () => {
    const record = new Record();
    record.metadata.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    record.metadata.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    record.append(record.position.createMoveByUSI("7g7f") as Move);
    record.append(record.position.createMoveByUSI("3c3d") as Move);
    record.append(record.position.createMoveByUSI("2g2f") as Move);
    record.append(SpecialMoveType.RESIGN);
    expect(
      generateRecordFileName(record, {
        template: "棋譜-{datetime}{_title}{_sente}{_gote}-{hex5}",
        extension: ".csa",
      }),
    ).toMatch(/^棋譜-20220101_My New Game_先手の人_後手の人-[0-9A-F]{5}\.csa$/);
    expect(
      generateRecordFileName(record, {
        template: "{title_}{sente_}{gote_}{hex5}",
        extension: "jkf",
      }),
    ).toMatch(/^My New Game_先手の人_後手の人_[0-9A-F]{5}\.jkf$/);
    expect(
      generateRecordFileName(record, {
        template: "{title_}{sente_}{gote_}{ply}手",
        extension: ".kifu",
      }),
    ).toMatch(/^My New Game_先手の人_後手の人_3手.kifu$/);
  });
});
