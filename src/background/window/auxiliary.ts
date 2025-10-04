import { BrowserWindow } from "electron";
import { getPreloadPath, isDevelopment, isTest } from "@/background/proc/env.js";
import { getAppLogger } from "@/background/log.js";

export function createAuxiliaryWindow(
  name: string,
  query: Record<string, string>,
  parent: BrowserWindow,
  onClosed: (webContentsID: number) => void,
): BrowserWindow {
  const win = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
      // NOTE: 現状、子ウィンドウではタイマーの実行が抑制されても困るケースが無いので、スロットリングは有効(デフォルト)にしておく。
      //backgroundThrottling: false,
    },
    backgroundColor: "#888",
  });
  win.menuBarVisible = false;
  win.once("ready-to-show", () => {
    win.webContents.setZoomLevel(parent.webContents.getZoomLevel());
  });

  win.on("close", () => {
    onClosed(win.webContents.id);
  });

  const params = new URLSearchParams(query);
  if (isDevelopment() || isTest()) {
    // Development
    getAppLogger().info("load dev server URL (%s)", name);
    win
      .loadURL("http://localhost:5173/" + name + "?" + params.toString())
      .then(() => {
        if (!process.env.IS_TEST) {
          win.webContents.openDevTools();
        }
      })
      .catch((e) => {
        getAppLogger().error(`failed to load dev server URL: ${e}`);
        throw e;
      });
  } else {
    // Preview or Production
    getAppLogger().info("load app URL (%s)", name);
    win.loadURL(`app://bundle/${name}.html?${params.toString()}`).catch((e) => {
      getAppLogger().error(`failed to load app URL: ${e}`);
      throw e;
    });
  }
  return win;
}
