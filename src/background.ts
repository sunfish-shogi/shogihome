"use strict";

import path from "path";
import { app, protocol, BrowserWindow } from "electron";
import { getAppState, sendError, setup } from "@/ipc/background";
import {
  loadWindowSetting,
  saveWindowSetting,
} from "@/ipc/background/settings";
import { buildWindowSetting } from "@/settings/window";
import { getAppLogger, shutdownLoggers } from "@/ipc/background/log";
import { quitAll as usiQuitAll } from "@/ipc/background/usi";
import { AppState } from "./store/state";

getAppLogger().info("start main process");
getAppLogger().info("process argv: %s", process.argv.join(" "));

const isDevelopment = process.env.npm_lifecycle_event === "electron:serve";
const isPreview = process.env.npm_lifecycle_event === "electron:preview";

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } },
]);

async function createWindow() {
  let setting = loadWindowSetting();

  getAppLogger().info("create BrowserWindow");

  const preloadPath =
    isDevelopment || isPreview ? "../packed/preload.js" : "./preload.js";

  // Create the browser window.
  const win = new BrowserWindow({
    width: setting.width,
    height: setting.height,
    fullscreen: setting.fullscreen,
    webPreferences: {
      preload: path.join(__dirname, preloadPath),
    },
  });
  if (setting.maximized) {
    win.maximize();
  }
  win.on("resized", () => {
    setting = buildWindowSetting(setting, win);
  });
  win.on("close", (event) => {
    if (getAppState() === AppState.CSA_GAME) {
      event.preventDefault();
      sendError(new Error("CSAプロトコル使用中はアプリを終了できません。"));
      return;
    }
    setting = buildWindowSetting(setting, win);
    saveWindowSetting(setting);
  });

  setup(win);

  if (isDevelopment) {
    getAppLogger().info("load dev server URL");
    await win.loadURL("http://localhost:5173"); // Open the DevTools.
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    getAppLogger().info("load app URL");
    // Load the index.html when not in development
    win.loadFile(path.join(__dirname, "../index.html"));
  }
}

app.enableSandbox();

app.on("will-quit", () => {
  getAppLogger().info("on will-quit");
  usiQuitAll();
  // プロセスを終了する前にログファイルの出力を完了する。
  shutdownLoggers();
});

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  getAppLogger().info("on window-all-closed");
  app.quit();
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    getAppLogger().info("install Vue3 Dev Tools");
    // Install Vue Devtools
    try {
      const installer = await import("electron-devtools-installer");
      await installer.default(installer.VUEJS3_DEVTOOLS);
    } catch (e: unknown) {
      getAppLogger().error(
        "Vue Devtools failed to install: %s",
        (e as Error).toString()
      );
    }
  }
  createWindow();
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        getAppLogger().info("on graceful-exit message");
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      getAppLogger().info("on SIGTERM");
      app.quit();
    });
  }
}
