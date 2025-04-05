import { generateRecordFileName, dirname, join, basename } from "@/renderer/helpers/path";
import { RecordMetadata, RecordMetadataKey } from "tsshogi";

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
    const meta = new RecordMetadata();
    expect(generateRecordFileName(meta)).toMatch(/^[0-9]{8}\.kif$/);
  });

  it("generateRecordFileName/withDate", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/09/30");
    expect(generateRecordFileName(meta)).toBe("20220930.kif");
  });

  it("generateRecordFileName/withStartDateTime", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.START_DATETIME, "2022/01/02 11:30");
    expect(generateRecordFileName(meta)).toBe("20220102_1130.kif");
  });

  it("generateRecordFileName/withTitle", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.START_DATETIME, "2022/01/02 11:30");
    meta.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    expect(generateRecordFileName(meta)).toBe("20220102_1130_My New Game.kif");
  });

  it("generateRecordFileName/withTournament", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.START_DATETIME, "2022/01/02 11:30");
    meta.setStandardMetadata(RecordMetadataKey.TOURNAMENT, "My Tournament");
    expect(generateRecordFileName(meta)).toBe("20220102_1130_My Tournament.kif");
  });

  it("generateRecordFileName/withPlayerName", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    meta.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(generateRecordFileName(meta)).toBe("20220101_先手の人_後手の人.kif");
  });

  it("generateRecordFileName/withTitleAndPlayerName", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    meta.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    meta.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(generateRecordFileName(meta)).toBe("20220101_My New Game_先手の人_後手の人.kif");
  });

  it("generateRecordFileName/escape", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "Foo:Bar<Baz");
    meta.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "Qux|Quux>Corge");
    expect(generateRecordFileName(meta)).toBe("20220101_Foo_Bar_Baz_Qux_Quux_Corge.kif");
  });

  it("generateRecordFileName/customTemplate", () => {
    const meta = new RecordMetadata();
    meta.setStandardMetadata(RecordMetadataKey.DATE, "2022/01/01");
    meta.setStandardMetadata(RecordMetadataKey.TITLE, "My New Game");
    meta.setStandardMetadata(RecordMetadataKey.BLACK_NAME, "先手の人");
    meta.setStandardMetadata(RecordMetadataKey.WHITE_NAME, "後手の人");
    expect(
      generateRecordFileName(meta, {
        template: "棋譜-{datetime}{_title}{_sente}{_gote}-{hex5}",
        extension: ".csa",
      }),
    ).toMatch(/^棋譜-20220101_My New Game_先手の人_後手の人-[0-9A-F]{5}\.csa$/);
    expect(
      generateRecordFileName(meta, { template: "{title_}{sente_}{gote_}{hex5}", extension: "jkf" }),
    ).toMatch(/^My New Game_先手の人_後手の人_[0-9A-F]{5}\.jkf$/);
  });
});
