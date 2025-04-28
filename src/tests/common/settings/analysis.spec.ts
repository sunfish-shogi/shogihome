import {
  AnalysisSettings,
  normalizeAnalysisSettings,
  validateAnalysisSettings,
} from "@/common/settings/analysis.js";
import { CommentBehavior } from "@/common/settings/comment.js";
import * as uri from "@/common/uri.js";

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
      descending: true,
      commentBehavior: CommentBehavior.APPEND,
    };
    const result = normalizeAnalysisSettings(settings);
    expect(result).toEqual(settings);
  });

  it("validate", () => {
    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: false, number: 0 },
        endCriteria: { enableNumber: false, number: 0 },
        perMoveCriteria: { maxSeconds: 0 },
        descending: false,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeUndefined();

    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: true, number: 30 },
        endCriteria: { enableNumber: true, number: 120 },
        perMoveCriteria: { maxSeconds: 0 },
        descending: true,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeUndefined();

    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: true, number: 30 },
        endCriteria: { enableNumber: true, number: 30 },
        perMoveCriteria: { maxSeconds: 0 },
        descending: true,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeUndefined();

    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: true, number: 0 },
        endCriteria: { enableNumber: false, number: 0 },
        perMoveCriteria: { maxSeconds: 0 },
        descending: true,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeInstanceOf(Error);

    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: false, number: 0 },
        endCriteria: { enableNumber: true, number: 0 },
        perMoveCriteria: { maxSeconds: 0 },
        descending: true,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeInstanceOf(Error);

    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: true, number: 30 },
        endCriteria: { enableNumber: true, number: 29 },
        perMoveCriteria: { maxSeconds: 0 },
        descending: true,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeInstanceOf(Error);

    expect(
      validateAnalysisSettings({
        startCriteria: { enableNumber: true, number: 30 },
        endCriteria: { enableNumber: true, number: 120 },
        perMoveCriteria: { maxSeconds: -1 },
        descending: true,
        commentBehavior: CommentBehavior.INSERT,
      }),
    ).toBeInstanceOf(Error);
  });
});
