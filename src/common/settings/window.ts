export type WindowSettings = {
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
};

export function defaultWindowSettings(): WindowSettings {
  return {
    width: 1000,
    height: 800,
    maximized: false,
    fullscreen: false,
  };
}

export function normalizeWindowSettings(settings: WindowSettings): WindowSettings {
  return {
    ...defaultWindowSettings(),
    ...settings,
    width: Math.max(200, settings.width),
    height: Math.max(150, settings.height),
  };
}

interface Window {
  isMaximized(): boolean;
  isFullScreen(): boolean;
  getBounds(): {
    height: number;
    width: number;
  };
}

export function buildWindowSettings(latest: WindowSettings, win: Window): WindowSettings {
  const normal = !win.isMaximized() && !win.isFullScreen();
  return {
    height: normal ? win.getBounds().height : latest.height,
    width: normal ? win.getBounds().width : latest.width,
    maximized: win.isMaximized(),
    fullscreen: win.isFullScreen(),
  };
}
