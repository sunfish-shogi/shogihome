import {
  ResearchSettings,
  normalizeResearchSettings,
  validateResearchSettings,
} from "@/common/settings/research.js";
import * as uri from "@/common/uri.js";

describe("settings/research", () => {
  it("normalize", () => {
    const settings: ResearchSettings = {
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
      secondaries: [],
      enableMaxSeconds: false,
      maxSeconds: 10,
      overrideMultiPV: false,
      multiPV: 1,
    };
    const result = normalizeResearchSettings(settings);
    expect(result).toStrictEqual(settings);
  });

  it("validate/ok", () => {
    const settings: ResearchSettings = {
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
      secondaries: [],
      enableMaxSeconds: false,
      maxSeconds: 10,
      overrideMultiPV: false,
      multiPV: 1,
    };
    expect(validateResearchSettings(settings)).toBeUndefined();
  });

  it("validate/invalidEngine", () => {
    const settings: ResearchSettings = {
      secondaries: [],
      enableMaxSeconds: false,
      maxSeconds: 10,
      overrideMultiPV: false,
      multiPV: 1,
    };
    expect(validateResearchSettings(settings)).toBeInstanceOf(Error);
  });

  it("validate/invalidSecondaryEngine", () => {
    const settings: ResearchSettings = {
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
      secondaries: [{}],
      enableMaxSeconds: false,
      maxSeconds: 10,
      overrideMultiPV: false,
      multiPV: 1,
    };
    expect(validateResearchSettings(settings)).toBeInstanceOf(Error);
  });
});
