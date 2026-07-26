import { emptyUSIEngine } from "@/common/settings/usi.js";
import {
  NextMoveGenerationSettings,
  defaultNextMoveGenerationSettings,
  validateNextMoveGenerationSettings,
} from "@/common/settings/nextmove.js";

function settings(override: Partial<NextMoveGenerationSettings>): NextMoveGenerationSettings {
  return {
    ...defaultNextMoveGenerationSettings(),
    usi: emptyUSIEngine(),
    sourceDirectory: "/path/to/directory",
    destinationFile: "/path/to/problems.json",
    ...override,
  };
}

describe("settings/nextmove", () => {
  it("validateNextMoveGenerationSettings", () => {
    expect(validateNextMoveGenerationSettings(settings({}))).toBeUndefined();
    expect(validateNextMoveGenerationSettings(settings({ usi: undefined }))).toBeInstanceOf(Error);
    expect(validateNextMoveGenerationSettings(settings({ sourceDirectory: "" }))).toBeInstanceOf(
      Error,
    );
  });

  it("validateNextMoveGenerationSettings/destinationFile", () => {
    expect(validateNextMoveGenerationSettings(settings({ destinationFile: "" }))).toBeInstanceOf(
      Error,
    );
    expect(
      validateNextMoveGenerationSettings(settings({ destinationFile: "/path/to/problems" })),
    ).toBeInstanceOf(Error);
    expect(
      validateNextMoveGenerationSettings(settings({ destinationFile: "/path/to/problems.txt" })),
    ).toBeInstanceOf(Error);
    expect(
      validateNextMoveGenerationSettings(settings({ destinationFile: "/path/to/problems.json" })),
    ).toBeUndefined();
  });
});
