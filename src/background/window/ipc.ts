import {
  BrowserWindow,
  dialog,
  FileFilter,
  ipcMain,
  powerSaveBlocker,
  shell,
  WebContents,
} from "electron";
import { Background, Renderer } from "@/common/ipc/channel.js";
import path from "node:path";
import { promises as fs } from "node:fs";
import url from "node:url";
import {
  loadAnalysisSettings,
  loadAppSettings,
  loadBatchConversionSettings,
  loadBookImportSettings,
  loadCSAGameSettingsHistory,
  loadGameSettings,
  loadLayoutProfileList,
  loadMateSearchSettings,
  loadResearchSettings,
  loadUSIEngines,
  saveAnalysisSettings,
  saveAppSettings,
  saveBatchConversionSettings,
  saveBookImportSettings,
  saveCSAGameSettingsHistory,
  saveGameSettings,
  saveLayoutProfileList,
  saveMateSearchSettings,
  saveResearchSettings,
  saveUSIEngines,
} from "@/background/settings.js";
import { USIEngine, USIEngines } from "@/common/settings/usi.js";
import { MenuEvent } from "@/common/control/menu.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import { AppState, ResearchState } from "@/common/control/state.js";
import {
  gameover as usiGameover,
  getUSIEngineInfo as usiGetUSIEngineInfo,
  setOption as usiSetOption,
  go as usiGo,
  goPonder as usiGoPonder,
  goInfinite as usiGoInfinite,
  goMate as usiGoMate,
  ponderHit as usiPonderHit,
  quit as usiQuit,
  sendOptionButtonSignal as usiSendOptionButtonSignal,
  setupPlayer as usiSetupPlayer,
  ready as usiReady,
  stop as usiStop,
  collectSessionStates as collectUSISessionStates,
  getCommandHistory as getUSICommandHistory,
  invokeCommand as invokeUSICommand,
  setHandlers as setUSIHandlers,
} from "@/background/usi/index.js";
import { GameResult } from "@/common/game/result.js";
import { LogLevel, LogType } from "@/common/log.js";
import { getAppLogger, getFilePath as getLogFilePath } from "@/background/log.js";
import {
  login as csaLogin,
  logout as csaLogout,
  agree as csaAgree,
  doMove as csaDoMove,
  resign as csaResign,
  win as csaWin,
  stop as csaStop,
  collectSessionStates as collectCSASessionStates,
  getCommandHistory as getCSACommandHistory,
  invokeCommand as invokeCSACommand,
  setHandlers,
} from "@/background/csa/index.js";
import {
  CSAGameResult,
  CSAGameSummary,
  CSAPlayerStates,
  CSASpecialMove,
} from "@/common/game/csa.js";
import { CSAServerSettings } from "@/common/settings/csa.js";
import { isEncryptionAvailable } from "@/background/helpers/encrypt.js";
import { validateIPCSender } from "./security.js";
import { t } from "@/common/i18n/index.js";
import { Rect } from "@/common/assets/geometry.js";
import { exportCaptureJPEG, exportCapturePNG } from "@/background/image/capture.js";
import { cropPieceImage } from "@/background/image/cropper.js";
import { getRelativeEnginePath, resolveEnginePath } from "@/background/usi/path.js";
import { fileURLToPath } from "@/background/helpers/url.js";
import { AppSettingsUpdate } from "@/common/settings/app.js";
import { convertRecordFiles } from "@/background/file/conversion.js";
import { BatchConversionSettings } from "@/common/settings/conversion.js";
import {
  addHistory,
  clearHistory,
  getHistory,
  loadBackup,
  saveBackup,
} from "@/background/file/history.js";
import { getAppPath } from "@/background/proc/path-electron.js";
import { isSupportedRecordFilePath } from "@/background/file/extensions.js";
import { readStatus as readVersionStatus } from "@/background/version.js";
import { sendTestNotification } from "./debug.js";
import { SessionStates } from "@/common/advanced/monitor.js";
import { createCommandWindow } from "./prompt.js";
import { PromptTarget } from "@/common/advanced/prompt.js";
import { Command, CommandType } from "@/common/advanced/command.js";
import { fetch } from "@/background/helpers/http.js";
import * as uri from "@/common/uri.js";
import { openPath } from "@/background/helpers/electron.js";
import {
  clearBook,
  getBookFormat,
  importBookMoves,
  isBookUnsaved,
  openBook,
  removeBookMove,
  saveBook,
  searchBookMoves,
  updateBookMove,
  updateBookMoveOrder,
} from "@/background/book/index.js";
import { BookLoadingOptions, BookMove } from "@/common/book.js";
import { Message } from "@/common/message.js";
import { RecordFileFormat } from "@/common/file/record.js";
import { LayoutProfileList } from "@/common/settings/layout.js";
import { ProcessArgs } from "@/common/ipc/process.js";
import { createDesktopShortcut } from "@/background/file/shortcuts.js";
import { escapeFileName } from "@/common/file/path.js";
import { collectOSState } from "@/background/proc/state.js";

const isWindows = process.platform === "win32";

let mainWindow: BrowserWindow;
let appState = AppState.NORMAL;
let closable = false;

export function setupIPC(win: BrowserWindow): void {
  mainWindow = win;
}

export function getAppState(): AppState {
  return appState;
}

export function isClosable(): boolean {
  return closable;
}

let processArgs: ProcessArgs = {};
let layoutURI = uri.ES_STANDARD_LAYOUT_PROFILE;

export function setProcessArgs(args: ProcessArgs) {
  processArgs = args;
  if (args.layoutProfile) {
    layoutURI = args.layoutProfile.uri;
  }
}

ipcMain.handle(Background.FETCH_PROCESS_ARGS, (event) => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(processArgs);
});

const onUpdateAppStateHandlers: ((
  state: AppState,
  researchState: ResearchState,
  busy: boolean,
) => void)[] = [];

export function onUpdateAppState(
  handler: (state: AppState, researchState: ResearchState, busy: boolean) => void,
): void {
  onUpdateAppStateHandlers.push(handler);
}

ipcMain.on(
  Background.UPDATE_APP_STATE,
  (event, state: AppState, researchState: ResearchState, busy: boolean) => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug(`change app state: AppState=${state} BusyState=${busy}`);
    appState = state;
    for (const handler of onUpdateAppStateHandlers) {
      handler(state, researchState, busy);
    }
  },
);

ipcMain.on(Background.OPEN_EXPLORER, async (event, targetPath: string) => {
  validateIPCSender(event.senderFrame);
  try {
    const fullPath = resolveEnginePath(targetPath);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      await openPath(fullPath);
    } else {
      await openPath(path.dirname(fullPath));
    }
  } catch {
    sendError(new Error(t.failedToOpenDirectory(targetPath)));
  }
});

ipcMain.on(Background.OPEN_WEB_BROWSER, (event, url: string) => {
  validateIPCSender(event.senderFrame);
  shell.openExternal(url);
});

ipcMain.handle(
  Background.SHOW_OPEN_RECORD_DIALOG,
  async (event, formats: RecordFileFormat[]): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const appSettings = await loadAppSettings();
    getAppLogger().debug("show open-record dialog");
    const ret = await showOpenDialog(["openFile"], appSettings.lastRecordFilePath, [
      {
        name: t.recordFile,
        extensions: formats.map((format) => format.slice(1)),
      },
    ]);
    if (ret) {
      updateAppSettings({ lastRecordFilePath: ret });
    }
    return ret;
  },
);

ipcMain.handle(Background.OPEN_RECORD, async (event, path: string) => {
  validateIPCSender(event.senderFrame);
  if (!isSupportedRecordFilePath(path)) {
    throw new Error(t.fileExtensionNotSupported);
  }
  getAppLogger().debug(`open record: ${path}`);
  return fs.readFile(path);
});
//@LoveKapibarasan
ipcMain.handle(Background.LIST_FILES, async (event, dir: string): Promise<string[]> => {
  validateIPCSender(event.senderFrame);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name));
});
//=====

async function showOpenDialog(
  properties: ("openFile" | "createDirectory" | "openDirectory" | "noResolveAliases")[],
  defaultPath?: string,
  filters?: FileFilter[],
  buttonLabel?: string,
): Promise<string> {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("Failed to open dialog by unexpected error.");
  }
  const ret = await dialog.showOpenDialog(win, {
    defaultPath,
    properties,
    filters,
    buttonLabel,
  });
  getAppLogger().debug(`open dialog result: ${JSON.stringify(ret)}`);
  if (ret.canceled || ret.filePaths.length !== 1) {
    return "";
  }
  return ret.filePaths[0];
}

// NOTE: This function mutates filters.
async function showSaveDialog(
  defaultPath: string,
  filters: FileFilter[],
  buttonLabel?: string,
): Promise<string> {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("failed to open dialog by unexpected error.");
  }
  filters.sort((lhs, rhs) => {
    return defaultPath.endsWith("." + lhs.extensions[0])
      ? -1
      : defaultPath.endsWith("." + rhs.extensions[0])
        ? 1
        : 0;
  });
  getAppLogger().debug("show save dialog");
  const ret = await dialog.showSaveDialog(win, {
    defaultPath: defaultPath,
    properties: ["createDirectory", "showOverwriteConfirmation"],
    filters,
    buttonLabel,
  });
  getAppLogger().debug(`save dialog result: ${JSON.stringify(ret)}`);
  return (!ret.canceled && ret.filePath) || "";
}

ipcMain.handle(
  Background.SHOW_SAVE_RECORD_DIALOG,
  async (event, defaultPath: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      throw new Error("failed to open dialog by unexpected error.");
    }
    const appSettings = await loadAppSettings();
    const filters = [
      { name: "KIF (Shift_JIS)", extensions: ["kif"] },
      { name: "KIF (UTF-8)", extensions: ["kifu"] },
      { name: "KI2 (Shift_JIS)", extensions: ["ki2"] },
      { name: "KI2 (UTF-8)", extensions: ["ki2u"] },
      { name: "CSA", extensions: ["csa"] },
      { name: "JSON Kifu Format", extensions: ["jkf"] },
    ];
    const result = await showSaveDialog(
      path.resolve(path.dirname(appSettings.lastRecordFilePath), defaultPath),
      filters,
    );
    if (result) {
      updateAppSettings({ lastRecordFilePath: result });
    }
    return result;
  },
);

ipcMain.handle(
  Background.SAVE_RECORD,
  async (event, filePath: string, data: Uint8Array): Promise<void> => {
    validateIPCSender(event.senderFrame);
    if (!isSupportedRecordFilePath(filePath)) {
      throw new Error(t.fileExtensionNotSupported);
    }
    getAppLogger().debug(`save record: ${filePath} (${data.length} bytes)`);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
  },
);

ipcMain.handle(Background.SHOW_SELECT_FILE_DIALOG, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("failed to open dialog by unexpected error.");
  }
  const appSettings = await loadAppSettings();
  getAppLogger().debug("show select-file dialog");
  const ret = await showOpenDialog(["openFile"], appSettings.lastOtherFilePath);
  if (ret) {
    updateAppSettings({ lastOtherFilePath: ret });
  }
  return ret;
});

ipcMain.handle(
  Background.SHOW_SELECT_DIRECTORY_DIALOG,
  async (event, defaultPath?: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug("show select-directory dialog");
    const ret = await showOpenDialog(["createDirectory", "openDirectory"], defaultPath);
    return ret;
  },
);

ipcMain.handle(
  Background.SHOW_SELECT_IMAGE_DIALOG,
  async (event, defaultURL?: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      throw new Error("failed to open dialog by unexpected error.");
    }
    getAppLogger().debug("show select-image dialog");
    const ret = await showOpenDialog(
      ["openFile"],
      defaultURL && fileURLToPath(defaultURL, getAppPath("pictures")),
      [{ name: t.imageFile, extensions: ["png", "jpg", "jpeg"] }],
    );
    return ret !== "" ? url.pathToFileURL(ret).toString() : "";
  },
);

ipcMain.handle(
  Background.SHOW_SAVE_MERGED_RECORD_DIALOG,
  async (event, defaultPath: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    const win = BrowserWindow.getFocusedWindow();
    if (!win) {
      throw new Error("failed to open dialog by unexpected error.");
    }
    const filters = [{ name: "SFEN", extensions: ["sfen"] }];
    return await showSaveDialog(path.resolve(defaultPath), filters, "OK");
  },
);

ipcMain.handle(Background.LOAD_REMOTE_TEXT_FILE, async (event, url: string) => {
  validateIPCSender(event.senderFrame);
  return await fetch(url);
});

ipcMain.handle(
  Background.CROP_PIECE_IMAGE,
  async (event, srcURL: string, deleteMargin: boolean): Promise<string> => {
    validateIPCSender(event.senderFrame);
    return await cropPieceImage(srcURL, { deleteMargin });
  },
);

ipcMain.handle(Background.EXPORT_CAPTURE_AS_PNG, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  const filePath = await exportCapturePNG(mainWindow.webContents, new Rect(json));
  if (filePath) {
    updateAppSettings({ lastImageExportFilePath: filePath });
  }
});

ipcMain.handle(Background.EXPORT_CAPTURE_AS_JPEG, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  const filePath = await exportCaptureJPEG(mainWindow.webContents, new Rect(json));
  if (filePath) {
    updateAppSettings({ lastImageExportFilePath: filePath });
  }
});

ipcMain.handle(Background.CONVERT_RECORD_FILES, async (event, json: string): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const settings = JSON.parse(json) as BatchConversionSettings;
  return JSON.stringify(await convertRecordFiles(settings, sendProgress));
});

ipcMain.handle(
  Background.SHOW_SELECT_SFEN_DIALOG,
  async (event, lastPath: string): Promise<string> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug("show select-SFEN dialog");
    const ret = await showOpenDialog(["openFile"], lastPath, [
      { name: "SFEN", extensions: ["sfen"] },
    ]);
    return ret;
  },
);

ipcMain.handle(Background.LOAD_SFEN_FILE, async (event, path: string): Promise<string[]> => {
  validateIPCSender(event.senderFrame);
  if (!path.endsWith(".sfen")) {
    throw new Error(`${t.fileExtensionNotSupported}: ${path}`);
  }
  const data = await fs.readFile(path, "utf-8");
  return data
    .replace(/^\uFEFF/, "") // remove BOM
    .split(/[\r\n]+/) // split by line
    .filter((line) => line !== ""); // remove empty lines
});

ipcMain.handle(Background.LOAD_APP_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load app settings");
  return JSON.stringify(await loadAppSettings());
});

ipcMain.handle(Background.SAVE_APP_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save app settings");
  await saveAppSettings(JSON.parse(json));
});

ipcMain.handle(Background.LOAD_BATCH_CONVERSION_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load batch conversion settings");
  return JSON.stringify(await loadBatchConversionSettings());
});

ipcMain.handle(
  Background.SAVE_BATCH_CONVERSION_SETTINGS,
  async (event, json: string): Promise<void> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug("save batch conversion settings");
    await saveBatchConversionSettings(JSON.parse(json));
  },
);

ipcMain.handle(Background.LOAD_RESEARCH_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load research settings");
  return JSON.stringify(await loadResearchSettings());
});

ipcMain.handle(Background.SAVE_RESEARCH_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save research settings");
  await saveResearchSettings(JSON.parse(json));
});

ipcMain.handle(Background.LOAD_ANALYSIS_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load analysis settings");
  return JSON.stringify(await loadAnalysisSettings());
});

ipcMain.handle(Background.SAVE_ANALYSIS_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save analysis settings");
  await saveAnalysisSettings(JSON.parse(json));
});

ipcMain.handle(Background.LOAD_GAME_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load game settings");
  return JSON.stringify(await loadGameSettings());
});

ipcMain.handle(Background.SAVE_GAME_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save game settings");
  await saveGameSettings(JSON.parse(json));
});

ipcMain.handle(Background.LOAD_CSA_GAME_SETTINGS_HISTORY, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load CSA game settings history");
  return JSON.stringify(await loadCSAGameSettingsHistory());
});

ipcMain.handle(
  Background.SAVE_CSA_GAME_SETTINGS_HISTORY,
  async (event, json: string): Promise<void> => {
    validateIPCSender(event.senderFrame);
    getAppLogger().debug("save CSA game settings history");
    await saveCSAGameSettingsHistory(JSON.parse(json));
  },
);

ipcMain.handle(Background.LOAD_MATE_SEARCH_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load mate search settings");
  return JSON.stringify(await loadMateSearchSettings());
});

ipcMain.handle(Background.SAVE_MATE_SEARCH_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save mate search settings");
  await saveMateSearchSettings(JSON.parse(json));
});

ipcMain.handle(Background.LOAD_RECORD_FILE_HISTORY, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(await getHistory());
});

ipcMain.on(Background.ADD_RECORD_FILE_HISTORY, (event, path: string): void => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("add record file history: %s", path);
  addHistory(path);
});

ipcMain.handle(Background.CLEAR_RECORD_FILE_HISTORY, async (event): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("clear record file history");
  clearHistory();
});

ipcMain.handle(Background.SAVE_RECORD_FILE_BACKUP, async (event, kif: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save record file backup");
  await saveBackup(kif);
});

ipcMain.handle(Background.LOAD_RECORD_FILE_BACKUP, async (event, name: string): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load record file backup: %s", name);
  return await loadBackup(name);
});

ipcMain.handle(Background.SHOW_OPEN_BOOK_DIALOG, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const appSettings = await loadAppSettings();
  getAppLogger().debug("show open-book dialog");
  const ret = await showOpenDialog(["openFile"], appSettings.lastBookFilePath, [
    { name: "Book", extensions: ["db", "bin"] },
  ]);
  if (ret) {
    updateAppSettings({ lastBookFilePath: ret });
  }
  return ret;
});

ipcMain.handle(Background.SHOW_SAVE_BOOK_DIALOG, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const appSettings = await loadAppSettings();
  getAppLogger().debug("show save-book dialog");
  const filter =
    getBookFormat() === "yane2016"
      ? { name: "YaneuraOu Book Database", extensions: ["db"] }
      : { name: "Apery Book", extensions: ["bin"] };
  const ret = await showSaveDialog(appSettings.lastBookFilePath, [filter]);
  if (ret) {
    updateAppSettings({ lastBookFilePath: ret });
  }
  return ret;
});

ipcMain.handle(Background.CLEAR_BOOK, (event) => {
  validateIPCSender(event.senderFrame);
  clearBook();
});

ipcMain.handle(Background.OPEN_BOOK, async (event, path: string, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug(`open book: ${path}`);
  const options = JSON.parse(json) as BookLoadingOptions;
  await openBook(path, options);
});

ipcMain.handle(Background.SAVE_BOOK, async (event, path: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug(`save book: ${path}`);
  await saveBook(path);
});

ipcMain.handle(Background.SEARCH_BOOK_MOVES, async (event, sfen: string): Promise<string> => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(await searchBookMoves(sfen));
});

ipcMain.handle(Background.UPDATE_BOOK_MOVE, async (event, sfen: string, json: string) => {
  validateIPCSender(event.senderFrame);
  await updateBookMove(sfen, JSON.parse(json) as BookMove);
});

ipcMain.handle(Background.REMOVE_BOOK_MOVE, async (event, sfen: string, usi: string) => {
  validateIPCSender(event.senderFrame);
  await removeBookMove(sfen, usi);
});

ipcMain.handle(
  Background.UPDATE_BOOK_MOVE_ORDER,
  async (event, sfen: string, usi: string, order: number) => {
    validateIPCSender(event.senderFrame);
    await updateBookMoveOrder(sfen, usi, order);
  },
);

ipcMain.handle(Background.LOAD_BOOK_IMPORT_SETTINGS, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load book import settings");
  return JSON.stringify(await loadBookImportSettings());
});

ipcMain.handle(Background.SAVE_BOOK_IMPORT_SETTINGS, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save book import settings");
  await saveBookImportSettings(JSON.parse(json));
});

ipcMain.handle(Background.IMPORT_BOOK_MOVES, async (event, json: string): Promise<string> => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(await importBookMoves(JSON.parse(json), sendProgress));
});

ipcMain.handle(Background.LOAD_LAYOUT_PROFILE_LIST, async (event): Promise<[string, string]> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load layout config");
  const json = JSON.stringify(await loadLayoutProfileList());
  return [layoutURI, json];
});

ipcMain.on(Background.UPDATE_LAYOUT_PROFILE_LIST, (event, uri: string, json: string) => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("update layout: %s", uri);
  layoutURI = uri;
  const layoutList = JSON.parse(json) as LayoutProfileList;
  const layout = layoutList.profiles.find((p) => p.uri === uri) || null;
  mainWindow.webContents.send(Renderer.UPDATE_LAYOUT_PROFILE, layout && JSON.stringify(layout));
  saveLayoutProfileList(JSON.parse(json)).catch((e) => {
    sendError(new Error(`failed to save layout config: ${e}`));
  });
});

ipcMain.handle(
  Background.CREATE_DESKTOP_SHORTCUT_FOR_LAYOUT_PROFILE,
  async (event, uri: string, name: string) => {
    validateIPCSender(event.senderFrame);
    const fileName = escapeFileName(`ShogiHome ${name}`);
    getAppLogger().debug(
      "create desktop shortcut for layout profile: uri=[%s] file=[%s]",
      uri,
      fileName,
    );
    await createDesktopShortcut(fileName, ["--layout-profile", uri]);
  },
);

ipcMain.handle(Background.LOAD_USI_ENGINES, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("load USI engines");
  return (await loadUSIEngines()).json;
});

ipcMain.handle(Background.SAVE_USI_ENGINES, async (event, json: string): Promise<void> => {
  validateIPCSender(event.senderFrame);
  getAppLogger().debug("save USI engines");
  await saveUSIEngines(new USIEngines(json));
});

ipcMain.handle(Background.SHOW_SELECT_USI_ENGINE_DIALOG, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("failed to open dialog by unexpected error.");
  }
  const appSettings = await loadAppSettings();
  getAppLogger().debug("show select-USI-engine dialog");
  const ret = await showOpenDialog(
    ["openFile", "noResolveAliases"],
    appSettings.lastUSIEngineFilePath,
    isWindows ? [{ name: t.executableFile, extensions: ["exe", "cmd", "bat"] }] : undefined,
  );
  if (ret === "") {
    return "";
  }
  const enginePath = getRelativeEnginePath(ret);
  updateAppSettings({
    lastUSIEngineFilePath: enginePath,
  });
  return enginePath;
});

ipcMain.handle(
  Background.GET_USI_ENGINE_INFO,
  async (event, path: string, timeoutSeconds: number): Promise<string> => {
    validateIPCSender(event.senderFrame);
    return JSON.stringify(await usiGetUSIEngineInfo(path, timeoutSeconds));
  },
);

ipcMain.handle(
  Background.SEND_USI_OPTION_BUTTON_SIGNAL,
  async (event, path: string, name: string, timeoutSeconds: number) => {
    validateIPCSender(event.senderFrame);
    await usiSendOptionButtonSignal(path, name, timeoutSeconds);
  },
);

ipcMain.handle(Background.LAUNCH_USI, async (event, json: string, timeoutSeconds: number) => {
  validateIPCSender(event.senderFrame);
  const engine = JSON.parse(json) as USIEngine;
  return await usiSetupPlayer(engine, timeoutSeconds);
});

ipcMain.handle(Background.USI_READY, async (event, sessionID: number) => {
  validateIPCSender(event.senderFrame);
  return await usiReady(sessionID);
});

ipcMain.handle(
  Background.USI_SET_OPTION,
  (event, sessionID: number, name: string, value: string) => {
    validateIPCSender(event.senderFrame);
    usiSetOption(sessionID, name, value);
  },
);

ipcMain.handle(
  Background.USI_GO,
  (event, sessionID: number, usi: string, timeStatesJSON: string) => {
    validateIPCSender(event.senderFrame);
    usiGo(sessionID, usi, JSON.parse(timeStatesJSON));
  },
);

ipcMain.handle(
  Background.USI_GO_PONDER,
  (event, sessionID: number, usi: string, timeStatesJSON: string) => {
    validateIPCSender(event.senderFrame);
    usiGoPonder(sessionID, usi, JSON.parse(timeStatesJSON));
  },
);

ipcMain.handle(Background.USI_GO_PONDER_HIT, (event, sessionID: number, timeStatesJSON: string) => {
  validateIPCSender(event.senderFrame);
  usiPonderHit(sessionID, JSON.parse(timeStatesJSON));
});

ipcMain.handle(Background.USI_GO_INFINITE, (event, sessionID: number, usi: string) => {
  validateIPCSender(event.senderFrame);
  usiGoInfinite(sessionID, usi);
});

ipcMain.handle(
  Background.USI_GO_MATE,
  (event, sessionID: number, usi: string, maxSeconds?: number) => {
    validateIPCSender(event.senderFrame);
    usiGoMate(sessionID, usi, maxSeconds);
  },
);

ipcMain.handle(Background.USI_STOP, (event, sessionID: number) => {
  validateIPCSender(event.senderFrame);
  usiStop(sessionID);
});

ipcMain.handle(Background.USI_GAMEOVER, (event, sessionID: number, result: GameResult) => {
  validateIPCSender(event.senderFrame);
  usiGameover(sessionID, result);
});

ipcMain.handle(Background.USI_QUIT, (event, sessionID: number) => {
  validateIPCSender(event.senderFrame);
  usiQuit(sessionID);
});

ipcMain.handle(Background.CSA_LOGIN, (event, json: string): number => {
  validateIPCSender(event.senderFrame);
  const settings: CSAServerSettings = JSON.parse(json);
  const sessionID = csaLogin(settings);
  preventAppSuspension(getPowerSaveBlockKeyForCSA(sessionID));
  return sessionID;
});

ipcMain.handle(Background.CSA_LOGOUT, (event, sessionID: number): void => {
  validateIPCSender(event.senderFrame);
  csaLogout(sessionID);
});

ipcMain.handle(Background.CSA_AGREE, (event, sessionID: number, gameID: string): void => {
  validateIPCSender(event.senderFrame);
  csaAgree(sessionID, gameID);
});

ipcMain.handle(
  Background.CSA_MOVE,
  (event, sessionID: number, move: string, score?: number, pv?: string): void => {
    validateIPCSender(event.senderFrame);
    csaDoMove(sessionID, move, score, pv);
  },
);

ipcMain.handle(Background.CSA_RESIGN, (event, sessionID: number): void => {
  validateIPCSender(event.senderFrame);
  csaResign(sessionID);
});

ipcMain.handle(Background.CSA_WIN, (event, sessionID: number): void => {
  validateIPCSender(event.senderFrame);
  csaWin(sessionID);
});

ipcMain.handle(Background.CSA_STOP, (event, sessionID: number): void => {
  validateIPCSender(event.senderFrame);
  csaStop(sessionID);
});

ipcMain.handle(Background.COLLECT_SESSION_STATES, async (event): Promise<string> => {
  validateIPCSender(event.senderFrame);
  const sessionStates: SessionStates = {
    os: await collectOSState(),
    usiSessions: collectUSISessionStates(),
    csaSessions: collectCSASessionStates(),
  };
  return JSON.stringify(sessionStates);
});

const promptMap: { [key: string]: WebContents[] } = {};

function getPromptSessionKey(target: PromptTarget, sessionID: number): string {
  return `${target}:${sessionID}`;
}

function getPrompts(target: PromptTarget, sessionID: number): WebContents[] {
  const key = getPromptSessionKey(target, sessionID);
  return promptMap[key] || [];
}

function addPrompt(target: PromptTarget, sessionID: number, contents: WebContents): void {
  const key = getPromptSessionKey(target, sessionID);
  let entries = promptMap[key];
  if (!entries) {
    entries = [];
  }
  entries.push(contents);
  promptMap[key] = entries;
}

export function removePrompt(target: PromptTarget, sessionID: number, webContentsID: number): void {
  const key = getPromptSessionKey(target, sessionID);
  const entries = promptMap[key];
  if (!entries) {
    return;
  }
  const index = entries.findIndex((entry) => entry.id === webContentsID);
  if (index === -1) {
    return;
  }
  if (entries.length === 1) {
    delete promptMap[key];
  } else {
    entries.splice(index, 1);
    promptMap[key] = entries;
  }
}

ipcMain.handle(
  Background.SETUP_PROMPT,
  (event, target: PromptTarget, sessionID: number): string => {
    validateIPCSender(event.senderFrame);
    addPrompt(target, sessionID, event.sender);
    switch (target) {
      case PromptTarget.USI:
        return JSON.stringify(getUSICommandHistory(sessionID));
      case PromptTarget.CSA:
        return JSON.stringify(getCSACommandHistory(sessionID));
    }
  },
);

function sendPromptCommand(target: PromptTarget, sessionID: number, command: Command): void {
  const prompts = getPrompts(target, sessionID);
  prompts.forEach((prompt) => {
    prompt.send(Renderer.PROMPT_COMMAND, JSON.stringify(command));
  });
}

ipcMain.on(
  Background.INVOKE_PROMPT_COMMAND,
  (event, target: PromptTarget, sessionID: number, type: CommandType, command: string) => {
    validateIPCSender(event.senderFrame);
    switch (target) {
      case PromptTarget.USI:
        invokeUSICommand(sessionID, type, command);
        break;
      case PromptTarget.CSA:
        invokeCSACommand(sessionID, type, command);
        break;
    }
  },
);

ipcMain.on(
  Background.OPEN_PROMPT,
  (event, target: PromptTarget, sessionID: number, name: string) => {
    validateIPCSender(event.senderFrame);
    createCommandWindow(mainWindow, target, sessionID, name, (webContentsID) => {
      removePrompt(target, sessionID, webContentsID);
    });
  },
);

ipcMain.handle(Background.IS_ENCRYPTION_AVAILABLE, (event): boolean => {
  validateIPCSender(event.senderFrame);
  return isEncryptionAvailable();
});

ipcMain.handle(Background.GET_VERSION_STATUS, async (event) => {
  validateIPCSender(event.senderFrame);
  return JSON.stringify(await readVersionStatus());
});

ipcMain.on(Background.SEND_TEST_NOTIFICATION, (event) => {
  validateIPCSender(event.senderFrame);
  sendTestNotification();
});

ipcMain.on(Background.OPEN_LOG_FILE, (event, logType: LogType) => {
  validateIPCSender(event.senderFrame);
  openPath(getLogFilePath(logType));
});

ipcMain.on(Background.LOG, (event, level: LogLevel, message: string) => {
  validateIPCSender(event.senderFrame);
  switch (level) {
    case LogLevel.DEBUG:
      getAppLogger().debug("%s", message);
      break;
    case LogLevel.INFO:
      getAppLogger().info("%s", message);
      break;
    case LogLevel.WARN:
      getAppLogger().warn("%s", message);
      break;
    case LogLevel.ERROR:
      getAppLogger().error("%s", message);
      break;
  }
});

ipcMain.on(Background.ON_CLOSABLE, (event) => {
  validateIPCSender(event.senderFrame);
  closable = true;
  mainWindow.close();
});

export function onClose(): void {
  const confirmations = [];
  if (isBookUnsaved()) {
    confirmations.push(t.anyBookMovesAreUnsavedDoYouReallyWantToDiscardThemAndCloseTheApp);
  }
  mainWindow.webContents.send(Renderer.CLOSE, confirmations);
}

export function sendError(e: Error): void {
  if (e instanceof AggregateError) {
    for (const error of e.errors) {
      sendError(error);
    }
    return;
  }
  mainWindow.webContents.send(Renderer.SEND_ERROR, e.message || e.name);
}

export function sendMessage(message: Message): void {
  mainWindow.webContents.send(Renderer.SEND_MESSAGE, JSON.stringify(message));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onMenuEvent(event: MenuEvent, ...args: any[]): void {
  mainWindow.webContents.send(Renderer.MENU_EVENT, event, ...args);
}

export function updateAppSettings(settings: AppSettingsUpdate): void {
  mainWindow.webContents.send(Renderer.UPDATE_APP_SETTINGS, JSON.stringify(settings));
}

export function openRecord(path: string): void {
  if (isSupportedRecordFilePath(path)) {
    mainWindow.webContents.send(Renderer.OPEN_RECORD, path);
  }
}

export function sendProgress(progress: number): void {
  mainWindow.webContents.send(Renderer.PROGRESS, progress);
}

setUSIHandlers({
  onUSIBestMove(sessionID: number, usi: string, usiMove: string, ponder?: string): void {
    mainWindow.webContents.send(Renderer.USI_BEST_MOVE, sessionID, usi, usiMove, ponder);
  },
  onUSICheckmate(sessionID: number, usi: string, usiMoves: string[]): void {
    mainWindow.webContents.send(Renderer.USI_CHECKMATE, sessionID, usi, usiMoves);
  },
  onUSICheckmateNotImplemented(sessionID: number): void {
    mainWindow.webContents.send(Renderer.USI_CHECKMATE_NOT_IMPLEMENTED, sessionID);
  },
  onUSICheckmateTimeout(sessionID: number, usi: string): void {
    mainWindow.webContents.send(Renderer.USI_CHECKMATE_TIMEOUT, sessionID, usi);
  },
  onUSINoMate(sessionID: number, usi: string): void {
    mainWindow.webContents.send(Renderer.USI_NO_MATE, sessionID, usi);
  },
  onUSIInfo(sessionID: number, usi: string, info: USIInfoCommand): void {
    mainWindow.webContents.send(Renderer.USI_INFO, sessionID, usi, JSON.stringify(info));
  },
  sendPromptCommand: sendPromptCommand.bind(this, PromptTarget.USI),
});

setHandlers({
  onCSAGameSummary(sessionID: number, gameSummary: CSAGameSummary): void {
    mainWindow.webContents.send(Renderer.CSA_GAME_SUMMARY, sessionID, JSON.stringify(gameSummary));
  },
  onCSAReject(sessionID: number): void {
    mainWindow.webContents.send(Renderer.CSA_REJECT, sessionID);
  },
  onCSAStart(sessionID: number, playerStates: CSAPlayerStates): void {
    mainWindow.webContents.send(Renderer.CSA_START, sessionID, JSON.stringify(playerStates));
  },
  onCSAMove(sessionID: number, move: string, playerStates: CSAPlayerStates): void {
    mainWindow.webContents.send(Renderer.CSA_MOVE, sessionID, move, JSON.stringify(playerStates));
  },
  onCSAGameResult(sessionID: number, specialMove: CSASpecialMove, gameResult: CSAGameResult): void {
    mainWindow.webContents.send(Renderer.CSA_GAME_RESULT, sessionID, specialMove, gameResult);
  },
  onCSAClose(sessionID: number): void {
    mainWindow.webContents.send(Renderer.CSA_CLOSE, sessionID);
    allowAppSuspension(getPowerSaveBlockKeyForCSA(sessionID));
  },
  sendPromptCommand: sendPromptCommand.bind(this, PromptTarget.CSA),
  sendError: sendError,
});

function getPowerSaveBlockKeyForCSA(sessionID: number): string {
  return `csa:${sessionID}`;
}

const powerSaveBlockMap = new Map<string, number>();

function preventAppSuspension(key: string) {
  const id = powerSaveBlocker.start("prevent-app-suspension");
  powerSaveBlockMap.set(key, id);
  getAppLogger().info("prevent app suspension: blocker=%d", id);
}

function allowAppSuspension(key: string) {
  const id = powerSaveBlockMap.get(key);
  if (id !== undefined) {
    powerSaveBlocker.stop(id);
    powerSaveBlockMap.delete(key);
    getAppLogger().info("allow app suspension: blocker=%d", id);
  }
}
