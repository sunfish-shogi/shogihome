import { RecordFileFormat } from "@/common/file/record.js";
import {
  defaultBatchAnalysisSettings,
  normalizeBatchAnalysisSettings,
  validateBatchAnalysisSettings,
} from "@/common/settings/batch_analysis.js";

describe("settings/batch_analysis", () => {
  it("normalize", () => {
    const settings = {
      source: "/path/to/records",
      sourceFormats: [RecordFileFormat.KIF],
      subdirectories: false,
      skipAnalyzed: false,
    };
    expect(normalizeBatchAnalysisSettings(settings)).toStrictEqual(settings);
  });

  it("normalize/partial", () => {
    const settings = normalizeBatchAnalysisSettings(
      {} as ReturnType<typeof defaultBatchAnalysisSettings>,
    );
    expect(settings).toStrictEqual(defaultBatchAnalysisSettings());
  });

  it("validate/ok", () => {
    expect(
      validateBatchAnalysisSettings({
        ...defaultBatchAnalysisSettings(),
        source: "/path/to/records",
      }),
    ).toBeUndefined();
  });

  it("validate/no-source", () => {
    expect(
      validateBatchAnalysisSettings({
        ...defaultBatchAnalysisSettings(),
        source: "",
      }),
    ).toBeInstanceOf(Error);
  });

  it("validate/no-formats", () => {
    expect(
      validateBatchAnalysisSettings({
        ...defaultBatchAnalysisSettings(),
        source: "/path/to/records",
        sourceFormats: [],
      }),
    ).toBeInstanceOf(Error);
  });
});
