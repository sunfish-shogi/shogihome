"use strict";

import { app, BrowserWindow, session, Menu, dialog } from "electron";
import { loadAppSettingsOnce } from "@/background/settings";
import {
  getAppLogger,
  LogDestination,
  setLogDestinations,
  shutdownLoggers,
} from "@/background/log";
import { isActiveSessionExists, quitAll as usiQuitAll } from "@/background/usi";
import { validateHTTPRequest } from "./window/security";
import { getPortableExeDir, isDevelopment, isPortable, isTest } from "@/background/proc/env";
import { setLanguage, t } from "@/common/i18n";
import { setInitialFilePath } from "./proc/args";
import contextMenu from "electron-context-menu";
import { LogType } from "@/common/log";
import { isLogEnabled } from "@/common/settings/app";
import { createWindow } from "./window/main";
import { spawn } from "child_process";

const appSettings = loadAppSettingsOnce();
for (const type of Object.values(LogType)) {
  const destinations: LogDestination[] = isLogEnabled(type, appSettings) ? ["file"] : ["stdout"];
  setLogDestinations(type, destinations, appSettings.logLevel);
}

getAppLogger().info(
  "start main process: %s %s %d",
  process.platform,
  process.execPath,
  process.pid,
);
getAppLogger().info("app: %s %s", app.getName(), app.getVersion(), app.getLocale());
getAppLogger().info("process argv: %s", process.argv.join(" "));
if (isPortable()) {
  getAppLogger().info("portable mode: %s", getPortableExeDir());
}

setLanguage(appSettings.language);

contextMenu({
  showCopyImage: false,
  showCopyLink: false,
  showSelectAll: false,
  showInspectElement: isDevelopment(),
  labels: {
    copy: t.copy,
    cut: t.cut,
    paste: t.paste,
  },
});

if (!appSettings.enableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}
app.enableSandbox();

app.once("will-finish-launching", () => {
  getAppLogger().info("on will-finish-launching");

  // macOS の Finder でファイルが開かれた場合には process.argv ではなく open-file イベントからパスを取得する必要がある。
  app.once("open-file", (event, path) => {
    getAppLogger().info("on open-file: %s", path);
    event.preventDefault();
    setInitialFilePath(path);
  });
});

const quitRetryInterval = 200;
const quitMaxWaitDuration = 5000;
let quitWaitElapsed = 0;
app.on("will-quit", (event) => {
  getAppLogger().info("on will-quit");

  // エンジンプロセスが残っている場合は全て終了する。
  if (isActiveSessionExists()) {
    if (quitWaitElapsed < quitMaxWaitDuration) {
      usiQuitAll();
      // 終了イベントをキャンセルして200ms後にやりなおす。
      event.preventDefault();
      setTimeout(() => {
        quitWaitElapsed += quitRetryInterval;
        app.quit();
      }, quitRetryInterval);
      return;
    }
    dialog.showMessageBoxSync({
      message:
        "一定時間内にエンジンプロセスが終了しませんでした。プロセスの状態を確認してください。\n" +
        "Some engine processes did not exit within a certain period. Please check the process status.",
    });
  }

  // プロセスを終了する前にログファイルの出力を完了する。
  shutdownLoggers();
});

function onMainWindowClosed() {
  app.quit();
}

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(onMainWindowClosed);
  }
});

app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});

async function installElectronDevTools() {
  const installer = await import("electron-devtools-installer");
  await installer.default(installer.VUEJS_DEVTOOLS);
}

// opens a new MacOS App Instance using shell command.
function openNewInstance() {
  const appPath = app.getPath("exe").replace("/Contents/MacOS/ShogiHome", "");
  const child = spawn("open", ["-jn", appPath], { detached: true, stdio: "ignore" });
  child.unref();
}

// MacOS dock menu for opening multiple ShogiHome Instances.
const dockMenu = Menu.buildFromTemplate([
  {
    label: t.openNewInstance,
    click() {
      openNewInstance();
    },
  },
]);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", () => {
  if (isDevelopment()) {
    getAppLogger().info("install Vue3 Dev Tools");
    // Install Vue DevTools
    installElectronDevTools().catch((e) => {
      getAppLogger().error(`failed to install Vue.js devtools: ${e}`);
      throw e;
    });
  }

  // Set dock menu (MacOS only)
  app.dock?.setMenu(dockMenu);

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    validateHTTPRequest(details.method, details.url);
    callback({});
  });
  createWindow(onMainWindowClosed);
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment() || isTest()) {
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
