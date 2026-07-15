import { RecordFileFormat, getStandardRecordFileFormats } from "@/common/file/record.js";
import { t } from "@/common/i18n/index.js";

// 連続棋譜解析に固有の設定のみを持つ。
// 解析条件 (エンジン・手数範囲・思考時間など) は通常の棋譜解析の設定 (AnalysisSettings) を共有する。
export type BatchAnalysisSettings = {
  source: string;
  sourceFormats: RecordFileFormat[];
  subdirectories: boolean;
  skipAnalyzed: boolean;
};

export function defaultBatchAnalysisSettings(): BatchAnalysisSettings {
  return {
    source: "",
    sourceFormats: getStandardRecordFileFormats(),
    subdirectories: true,
    skipAnalyzed: true,
  };
}

export function normalizeBatchAnalysisSettings(
  settings: BatchAnalysisSettings,
): BatchAnalysisSettings {
  return {
    source: settings.source ?? "",
    sourceFormats: settings.sourceFormats ?? getStandardRecordFileFormats(),
    subdirectories: settings.subdirectories ?? true,
    skipAnalyzed: settings.skipAnalyzed ?? true,
  };
}

export function validateBatchAnalysisSettings(settings: BatchAnalysisSettings): Error | undefined {
  if (!settings.source) {
    return new Error(t.sourceDirectoryNotSpecified);
  }
  if (settings.sourceFormats.length === 0) {
    return new Error(t.sourceFormatsNotSpecified);
  }
}
