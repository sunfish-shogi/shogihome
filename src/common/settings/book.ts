import { detectRecordFileFormatByPath } from "@/common/file/record.js";
import { t } from "@/common/i18n/index.js";

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

export function validateBookImportSettings(settings: BookImportSettings): Error | undefined {
  if (settings.sourceType === SourceType.FILE) {
    if (!settings.sourceRecordFile) {
      return new Error(t.sourceRecordFileNotSet);
    }
    const format = detectRecordFileFormatByPath(settings.sourceRecordFile);
    if (!format) {
      return new Error(t.unexpectedRecordFileExtension(settings.sourceRecordFile));
    }
  } else if (settings.sourceType === SourceType.DIRECTORY) {
    if (!settings.sourceDirectory) {
      return new Error(t.sourceDirectoryNotSet);
    }
  } else {
    return new Error("invalid source type");
  }

  if (settings.minPly < 0) {
    return new Error("min ply must be greater than or equal to 0");
  }

  if (settings.maxPly < 0) {
    return new Error("max ply must be greater than or equal to 0");
  }

  if (settings.minPly > settings.maxPly) {
    return new Error(t.minPlyMustBeLessThanMaxPly);
  }

  if (settings.playerCriteria === PlayerCriteria.FILTER_BY_NAME) {
    if (!settings.playerName) {
      return new Error(t.playerNameNotSet);
    }
  }
}
