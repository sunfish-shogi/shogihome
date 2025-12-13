import { RecordFileFormat } from "@/common/file/record.js";
import { t } from "@/common/i18n/index.js";

export enum SourceType {
  DIRECTORY = "directory",
  SINGLE_FILE = "singleFile",
}

export enum DestinationType {
  DIRECTORY = "directory",
  SINGLE_FILE = "singleFile",
}

export enum FileNameConflictAction {
  OVERWRITE = "overwrite",
  NUMBER_SUFFIX = "numberSuffix",
  SKIP = "skip",
}

export type BatchConversionSettings = {
  sourceType: SourceType;
  source: string;
  sourceFormats: RecordFileFormat[];
  subdirectories: boolean;
  singleFileSource: string;
  destinationType: DestinationType;
  destination: string;
  createSubdirectories: boolean;
  destinationFormat: RecordFileFormat;
  fileNameConflictAction: FileNameConflictAction;
  singleFileDestination: string;
};

export function defaultBatchConversionSettings(): BatchConversionSettings {
  return {
    sourceType: SourceType.DIRECTORY,
    source: "",
    sourceFormats: [
      RecordFileFormat.KIF,
      RecordFileFormat.KIFU,
      RecordFileFormat.KI2,
      RecordFileFormat.KI2U,
      RecordFileFormat.CSA,
      RecordFileFormat.JKF,
    ],
    subdirectories: true,
    singleFileSource: "",
    destinationType: DestinationType.DIRECTORY,
    destination: "",
    createSubdirectories: true,
    destinationFormat: RecordFileFormat.KIF,
    fileNameConflictAction: FileNameConflictAction.NUMBER_SUFFIX,
    singleFileDestination: "",
  };
}

export function normalizeBatchConversionSettings(
  settings: BatchConversionSettings,
): BatchConversionSettings {
  return {
    ...defaultBatchConversionSettings(),
    ...settings,
  };
}

export function validateBatchConversionSettings(
  settings: BatchConversionSettings,
): Error | undefined {
  switch (settings.sourceType) {
    case SourceType.DIRECTORY:
      if (!settings.source) {
        return new Error(t.sourceDirectoryNotSpecified);
      }
      if (settings.sourceFormats.length === 0) {
        return new Error(t.sourceFormatsNotSpecified);
      }
      break;
    case SourceType.SINGLE_FILE:
      if (!settings.singleFileSource.endsWith(".sfen")) {
        return new Error(t.sourceFileMustBeSFEN);
      }
      break;
    default:
      return new Error("Invalid source type.");
  }
  const destinationType =
    settings.sourceType === SourceType.SINGLE_FILE
      ? DestinationType.DIRECTORY
      : settings.destinationType;
  switch (destinationType) {
    case DestinationType.DIRECTORY:
      if (!settings.destination) {
        return new Error(t.destinationDirectoryNotSpecified);
      }
      break;
    case DestinationType.SINGLE_FILE:
      if (!settings.singleFileDestination) {
        return new Error(t.destinationFileNotSpecified);
      }
      break;
    default:
      return new Error("Invalid destination type.");
  }
}
