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

export type BookSettings = {
  sourceType: SourceType;
  sourceDirectory?: string;
  sourceRecordFile?: string;
  minPly: number;
  maxPly: number;
  playerCriteria: PlayerCriteria;
};

export function defaultBookSettings(): BookSettings {
  return {
    sourceType: SourceType.MEMORY,
    minPly: 0,
    maxPly: 100,
    playerCriteria: PlayerCriteria.ALL,
  };
}

export function normalizeBookSettings(settings: Partial<BookSettings>): BookSettings {
  return {
    ...defaultBookSettings(),
    ...settings,
  };
}
