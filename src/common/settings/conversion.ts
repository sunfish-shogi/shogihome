import { RecordFileFormat } from "@/common/file/record.js";
import { t } from "@/common/i18n/index.js";

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
  source: string;
  sourceFormats: RecordFileFormat[];
  subdirectories: boolean;
  destinationType: DestinationType;
  destination: string;
  createSubdirectories: boolean;
  destinationFormat: RecordFileFormat;
  fileNameConflictAction: FileNameConflictAction;
  singleFileDestination: string;
};

export function defaultBatchConversionSettings(): BatchConversionSettings {
  return {
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
  if (!settings.source) {
    return new Error(t.sourceDirectoryNotSpecified);
  }
  if (settings.sourceFormats.length === 0) {
    return new Error(t.sourceFormatsNotSpecified);
  }
  switch (settings.destinationType) {
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
