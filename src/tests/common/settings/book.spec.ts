import { PlayerCriteria, SourceType, validateBookImportSettings } from "@/common/settings/book.js";

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
      }),
    ).toBeInstanceOf(Error);
    expect(
      validateBookImportSettings({
        sourceType: SourceType.MEMORY,
        sourceDirectory: "",
        sourceRecordFile: "",
        minPly: 0,
        maxPly: 100,
        playerCriteria: PlayerCriteria.ALL,
      }),
    ).toBeInstanceOf(Error);
  });
});
