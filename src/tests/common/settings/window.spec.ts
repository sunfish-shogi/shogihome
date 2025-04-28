import { buildWindowSettings, normalizeWindowSettings } from "@/common/settings/window.js";

describe("settings/window", () => {
  it("buildWindowSettings", () => {
    const baseSettings = {
      width: 1000,
      height: 800,
      maximized: true,
      fullscreen: false,
    };
    expect(
      buildWindowSettings(baseSettings, {
        isMaximized: () => false,
        isFullScreen: () => false,
        getBounds() {
          return {
            width: 1100,
            height: 900,
          };
        },
      }),
    ).toStrictEqual({
      width: 1100,
      height: 900,
      maximized: false,
      fullscreen: false,
    });
    expect(
      buildWindowSettings(baseSettings, {
        isMaximized: () => true,
        isFullScreen: () => false,
        getBounds() {
          return {
            width: 1100,
            height: 900,
          };
        },
      }),
    ).toStrictEqual({
      width: 1000,
      height: 800,
      maximized: true,
      fullscreen: false,
    });
    expect(
      buildWindowSettings(baseSettings, {
        isMaximized: () => false,
        isFullScreen: () => true,
        getBounds() {
          return {
            width: 1100,
            height: 900,
          };
        },
      }),
    ).toStrictEqual({
      width: 1000,
      height: 800,
      maximized: false,
      fullscreen: true,
    });
  });

  it("normalize", () => {
    const settings = {
      width: 2000,
      height: 1500,
      maximized: true,
      fullscreen: true,
    };
    const result = normalizeWindowSettings(settings);
    expect(result).toStrictEqual(settings);

    expect(
      normalizeWindowSettings({
        width: 0,
        height: 0,
        maximized: false,
        fullscreen: false,
      }),
    ).toEqual({
      width: 200,
      height: 150,
      maximized: false,
      fullscreen: false,
    });
  });
});
