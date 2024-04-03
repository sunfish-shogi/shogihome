import { RecordFileFormat } from "@/common/file/record";
import { t } from "@/common/i18n";

export enum DestinationType {
  DIRECTORY = "directory",
  SINGLE_FILE = "singleFile",
}

export enum FileNameConflictAction {
  OVERWRITE = "overwrite",
  NUMBER_SUFFIX = "numberSuffix",
  SKIP = "skip",
}

export type BatchConversionSetting = {
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

export function defaultBatchConversionSetting(): BatchConversionSetting {
  return {
    source: "",
    sourceFormats: [".kif", ".kifu", ".ki2", ".ki2u", ".csa", ".jkf"],
    subdirectories: true,
    destinationType: DestinationType.DIRECTORY,
    destination: "",
    createSubdirectories: true,
    destinationFormat: ".kif",
    fileNameConflictAction: FileNameConflictAction.NUMBER_SUFFIX,
    singleFileDestination: "",
  };
}

export function normalizeBatchConversionSetting(
  setting: BatchConversionSetting,
): BatchConversionSetting {
  return {
    ...defaultBatchConversionSetting(),
    ...setting,
  };
}

export function validateBatchConversionSetting(setting: BatchConversionSetting): Error | undefined {
  if (!setting.source) {
    return new Error(t.sourceDirectoryNotSpecified);
  }
  if (setting.sourceFormats.length === 0) {
    return new Error(t.sourceFormatsNotSpecified);
  }
  switch (setting.destinationType) {
    case DestinationType.DIRECTORY:
      if (!setting.destination) {
        return new Error(t.destinationDirectoryNotSpecified);
      }
      break;
    case DestinationType.SINGLE_FILE:
      if (!setting.singleFileDestination) {
        return new Error(t.destinationFileNotSpecified);
      }
      break;
    default:
      return new Error("Invalid destination type.");
  }
}
