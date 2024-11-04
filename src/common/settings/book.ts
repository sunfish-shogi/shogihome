export enum SourceType {
  MEMORY = "memory",
  DIRECTORY = "directory",
  FILE = "file",
}

export enum PlayerCriteria {
  ALL = "all",
  BLACK = "black",
  WHITE = "white",
  FILTER_BY_NAME = "filterByName",
}

export type BookImportSettings = {
  sourceType: SourceType;
  sourceDirectory: string;
  sourceRecordFile: string;
  minPly: number;
  maxPly: number;
  playerCriteria: PlayerCriteria;
  playerName?: string;
};

export function defaultBookImportSettings(): BookImportSettings {
  return {
    sourceType: SourceType.MEMORY,
    sourceDirectory: "",
    sourceRecordFile: "",
    minPly: 0,
    maxPly: 100,
    playerCriteria: PlayerCriteria.ALL,
  };
}

export function normalizeBookImportSettings(
  settings: Partial<BookImportSettings>,
): BookImportSettings {
  return {
    ...defaultBookImportSettings(),
    ...settings,
  };
}
