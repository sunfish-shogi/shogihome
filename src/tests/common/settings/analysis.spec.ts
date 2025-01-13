import { AnalysisSettings, normalizeAnalysisSettings } from "@/common/settings/analysis";
import { CommentBehavior } from "@/common/settings/comment";
import * as uri from "@/common/uri";

describe("settings/analysis", () => {
  it("normalize", () => {
    const settings: AnalysisSettings = {
      usi: {
        uri: uri.ES_USI_ENGINE_PREFIX + "test-engine",
        name: "Test Engine",
        defaultName: "test engine",
        author: "test author",
        path: "/path/to/test-engine",
        options: {
          USI_Hash: { name: "USI_Hash", type: "spin", order: 1 },
        },
        labels: {},
        enableEarlyPonder: false,
      },
      startCriteria: {
        enableNumber: true,
        number: 10,
      },
      endCriteria: {
        enableNumber: true,
        number: 20,
      },
      perMoveCriteria: {
        maxSeconds: 10,
      },
      commentBehavior: CommentBehavior.APPEND,
    };
    const result = normalizeAnalysisSettings(settings);
    expect(result).toEqual(settings);
  });
});
