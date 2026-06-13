import {
  PlayerCriteria,
  SourceType,
  defaultBookImportSettings,
  normalizeBookImportSettings,
  validateBookImportSettings,
} from "@/common/settings/book.js";

describe("settings/book", () => {
  it("validateBookImportSettings", () => {
    expect(
      validateBookImportSettings({
        sourceType: SourceType.DIRECTORY,
        sourceDirectory: "/path/to/directory",
        sourceRecordFile: "",
        minPly: 0,
        maxPly: 10,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeUndefined();
    expect(
      validateBookImportSettings({
        sourceType: SourceType.DIRECTORY,
        sourceDirectory: "",
        sourceRecordFile: "",
        minPly: 0,
        maxPly: 10,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeInstanceOf(Error);
    expect(
      validateBookImportSettings({
        sourceType: SourceType.DIRECTORY,
        sourceDirectory: "/path/to/directory",
        sourceRecordFile: "",
        minPly: 20,
        maxPly: 10,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeInstanceOf(Error);
    expect(
      validateBookImportSettings({
        sourceType: SourceType.DIRECTORY,
        sourceDirectory: "/path/to/directory",
        sourceRecordFile: "",
        minPly: 0,
        maxPly: 10,
        playerCriteria: PlayerCriteria.FILTER_BY_NAME,
        playerName: "player",
        importScore: true,
      }),
    ).toBeUndefined();
    expect(
      validateBookImportSettings({
        sourceType: SourceType.DIRECTORY,
        sourceDirectory: "/path/to/directory",
        sourceRecordFile: "",
        minPly: 0,
        maxPly: 10,
        playerCriteria: PlayerCriteria.FILTER_BY_NAME,
        importScore: true,
      }),
    ).toBeInstanceOf(Error);
    expect(
      validateBookImportSettings({
        sourceType: SourceType.FILE,
        sourceDirectory: "",
        sourceRecordFile: "/path/to/file.kif",
        minPly: 0,
        maxPly: 100,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeUndefined();
    expect(
      validateBookImportSettings({
        sourceType: SourceType.FILE,
        sourceDirectory: "",
        sourceRecordFile: "/path/to/file.csa",
        minPly: 0,
        maxPly: 100,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeUndefined();
    expect(
      validateBookImportSettings({
        sourceType: SourceType.FILE,
        sourceDirectory: "",
        sourceRecordFile: "/path/to/file.sfen",
        minPly: 0,
        maxPly: 100,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeUndefined();
    expect(
      validateBookImportSettings({
        sourceType: SourceType.FILE,
        sourceDirectory: "",
        sourceRecordFile: "/path/to/file.foo",
        minPly: 0,
        maxPly: 100,
        playerCriteria: PlayerCriteria.ALL,
        importScore: true,
      }),
    ).toBeInstanceOf(Error);
  });

  it("normalizeBookImportSettings", () => {
    // 全フィールドが揃っている場合はそのまま返る
    const full = {
      sourceType: SourceType.FILE,
      sourceDirectory: "/dir",
      sourceRecordFile: "/dir/game.kif",
      minPly: 5,
      maxPly: 50,
      playerCriteria: PlayerCriteria.BLACK,
      playerName: "Fujii",
      importScore: false,
    };
    expect(normalizeBookImportSettings(full)).toEqual(full);

    // importScore が欠けている古い設定ファイルはデフォルト値 true で補完される
    const legacy = {
      sourceType: SourceType.DIRECTORY,
      sourceDirectory: "/dir",
      sourceRecordFile: "",
      minPly: 0,
      maxPly: 100,
      playerCriteria: PlayerCriteria.ALL,
    };
    expect(normalizeBookImportSettings(legacy as never)).toEqual({
      ...defaultBookImportSettings(),
      ...legacy,
    });
  });
});
