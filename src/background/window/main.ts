import { app, BrowserWindow } from "electron";
import {
  getAppState,
  isClosable,
  onClose,
  openRecord,
  sendError,
  setupIPC,
} from "@/background/window/ipc.js";
import { loadWindowSettings, saveWindowSettings } from "@/background/settings.js";
import { buildWindowSettings } from "@/common/settings/window.js";
import { getAppLogger } from "@/background/log.js";
import { AppState } from "@/common/control/state.js";
import { getPreloadPath, isDevelopment, isTest } from "@/background/proc/env.js";
import { checkUpdates } from "@/background/version.js";
import { setupMenu } from "@/background/window/menu.js";
import { t } from "@/common/i18n/index.js";
import { ghioDomain } from "@/common/links/github.js";

export function createWindow(onClosed: () => void) {
  let settings = loadWindowSettings();

  getAppLogger().info("create BrowserWindow");

  // Create the browser window.
  const win = new BrowserWindow({
    width: settings.width,
    height: settings.height,
    fullscreenable: true,
    fullscreen: settings.fullscreen,
    webPreferences: {
      preload: getPreloadPath(),
      // 対局や棋譜解析の用途では処理の遅延が致命的なのでスロットリングを無効にする。
      backgroundThrottling: false,
    },
    backgroundColor: "#888",
  });
  if (settings.maximized) {
    win.maximize();
  }
  win.on("resized", () => {
    settings = buildWindowSettings(settings, win);
  });
  win.on("close", (event) => {
    if (getAppState() === AppState.CSA_GAME) {
      event.preventDefault();
      sendError(new Error(t.youCanNotCloseAppWhileCSAOnlineGame));
      return;
    }
    if (!isClosable()) {
      event.preventDefault();
      onClose();
      return;
    }
    settings = buildWindowSettings(settings, win);
    saveWindowSettings(settings);
    onClosed();
  });

  setupIPC(win);
  setupMenu(win);

  if (isDevelopment() || isTest()) {
    // Development
    getAppLogger().info("load dev server URL");
    win
      .loadURL("http://localhost:5173")
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
    getAppLogger().info("load app URL");
    win.loadURL("app://bundle/index.html").catch((e) => {
      getAppLogger().error(`failed to load app URL: ${e}`);
      throw e;
    });
  }

  win.once("ready-to-show", () => {
    // レンダラー側の準備ができたら uncaughtException はレンダラーへ送る。
    process.on("uncaughtException", (e, origin) => {
      // ホストの解決ができない場合に uncaughtException が発生する。
      // github.io へのアクセスは更新確認以外に無いので、ここでエラー文言を付け加える。
      if (e instanceof Error && e.message === `getaddrinfo ENOTFOUND ${ghioDomain}`) {
        sendError(new Error(`${t.failedToCheckUpdates}: ${e}`));
        return;
      }
      sendError(new Error(`${origin} ${e}`));
    });

    // macOS では起動後に Finder からファイルを開こうとすると既に存在するプロセスに対して open-file イベントが発生する。
    app.on("open-file", (event, path) => {
      getAppLogger().info("on open-file: %s", path);
      event.preventDefault();
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
      openRecord(path);
    });

    checkUpdates().catch((e) => {
      getAppLogger().error(`${t.failedToCheckUpdates}: ${e}`);
    });
  });
}
