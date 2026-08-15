/* eslint-disable no-console */
import { defaultAnalysisSettings } from "@/common/settings/analysis.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import { defaultGameSettings } from "@/common/settings/game.js";
import { defaultResearchSettings } from "@/common/settings/research.js";
import {
  mergeUSIEngine,
  USIEngine,
  USIEngineLaunchOptions,
  USIEngineMetadata,
  USIEngines,
} from "@/common/settings/usi.js";
import { LogLevel } from "@/common/log.js";
import { Bridge } from "@/renderer/ipc/bridge.js";
import { TimeStates } from "@/common/game/time.js";
import { GameResult } from "@/common/game/result.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import { USISessionHandlers, USISessionManager } from "@/renderer/wasm-engine/session.js";
import { createWasmEngineTransportFactory } from "@/renderer/wasm-engine/transport.js";
import { loadBuiltinUSIEngines } from "@/renderer/wasm-engine/catalog.js";
import { t } from "@/common/i18n/index.js";
import { defaultCSAGameSettingsHistory } from "@/common/settings/csa.js";
import { defaultMateSearchSettings } from "@/common/settings/mate.js";
import { defaultBatchConversionSettings } from "@/common/settings/conversion.js";
import { getEmptyHistory } from "@/common/file/history.js";
import { VersionStatus } from "@/common/version.js";
import { blankOSState, SessionStates, MachineSpec } from "@/common/advanced/monitor.js";
import { emptyLayoutProfileList } from "@/common/settings/layout.js";
import * as uri from "@/common/uri.js";
import { basename } from "@/renderer/helpers/path.js";
import { ProcessArgs } from "@/common/ipc/process";
import { BookFormat } from "@/common/book.js";

enum STORAGE_KEY {
  APP_SETTINGS = "appSetting",
  RESEARCH_SETTINGS = "researchSetting",
  BATCH_CONVERSION_SETTINGS = "batchConversionSetting",
  ANALYSIS_SETTINGS = "analysisSetting",
  GAME_SETTINGS = "gameSetting",
  MATE_SEARCH_SETTINGS = "mateSearchSetting",
  CSA_GAME_SETTINGS_HISTORY = "csaGameSettingHistory",
  USI_ENGINES = "usiEngines",
}

const fileCache = new Map<string, ArrayBuffer>();

// setup.ts から登録されるコールバック。
// Electron 版では background からの push イベントに相当する。
const usiHandlers: Partial<{
  onUSIBestMove: (sessionID: number, usi: string, usiMove: string, ponder?: string) => void;
  onUSICheckmate: (sessionID: number, usi: string, usiMoves: string[]) => void;
  onUSICheckmateNotImplemented: (sessionID: number) => void;
  onUSICheckmateTimeout: (sessionID: number, usi: string) => void;
  onUSINoMate: (sessionID: number, usi: string) => void;
  onUSIInfo: (sessionID: number, usi: string, json: string) => void;
}> = {};

const usiSessionHandlers: USISessionHandlers = {
  onUSIBestMove: (sessionID, usi, usiMove, ponder) =>
    usiHandlers.onUSIBestMove?.(sessionID, usi, usiMove, ponder),
  onUSICheckmate: (sessionID, usi, usiMoves) =>
    usiHandlers.onUSICheckmate?.(sessionID, usi, usiMoves),
  onUSICheckmateNotImplemented: (sessionID) =>
    usiHandlers.onUSICheckmateNotImplemented?.(sessionID),
  onUSICheckmateTimeout: (sessionID, usi) => usiHandlers.onUSICheckmateTimeout?.(sessionID, usi),
  onUSINoMate: (sessionID, usi) => usiHandlers.onUSINoMate?.(sessionID, usi),
  onUSIInfo: (sessionID, usi, info: USIInfoCommand) =>
    usiHandlers.onUSIInfo?.(sessionID, usi, JSON.stringify(info)),
};

const usiLogger = (level: LogLevel, message: string) => {
  switch (level) {
    case LogLevel.DEBUG:
      console.debug(message);
      break;
    case LogLevel.WARN:
      console.warn(message);
      break;
    case LogLevel.ERROR:
      console.error(message);
      break;
    default:
      console.log(message);
      break;
  }
};

const usiSessions = new USISessionManager(
  createWasmEngineTransportFactory((message) =>
    usiLogger(LogLevel.INFO, `wasm-engine: ${message}`),
  ),
  usiLogger,
);
usiSessions.setHandlers(usiSessionHandlers);

// Electron を使わずにシンプルな Web アプリケーションとして実行した場合に使用します。
export const webAPI: Bridge = {
  // Core
  updateAppState(): void {
    // DO NOTHING
  },
  async fetchProcessArgs(): Promise<string> {
    return JSON.stringify({} as ProcessArgs);
  },
  onClosable(): void {
    // Do Nothing
  },
  onClose(): void {
    // Do Nothing
  },
  onSendError(): void {
    // Do Nothing
  },
  onSendMessage(): void {
    // Do Nothing
  },
  onSendNotification(): void {
    // Do Nothing
  },
  onMenuEvent(): void {
    // Do Nothing
  },

  // Settings
  async loadAppSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.APP_SETTINGS);
    if (!json) {
      return JSON.stringify(defaultAppSettings());
    }
    return JSON.stringify({
      ...defaultAppSettings(),
      ...JSON.parse(json),
    });
  },
  async saveAppSettings(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.APP_SETTINGS, json);
  },
  async loadBatchConversionSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.BATCH_CONVERSION_SETTINGS);
    if (!json) {
      return JSON.stringify(defaultBatchConversionSettings());
    }
    return JSON.stringify({
      ...defaultBatchConversionSettings(),
      ...JSON.parse(json),
    });
  },
  async saveBatchConversionSettings(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.BATCH_CONVERSION_SETTINGS, json);
  },
  async loadResearchSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.RESEARCH_SETTINGS);
    if (!json) {
      return JSON.stringify(defaultResearchSettings());
    }
    return JSON.stringify({
      ...defaultResearchSettings(),
      ...JSON.parse(json),
    });
  },
  async saveResearchSettings(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.RESEARCH_SETTINGS, json);
  },
  async loadAnalysisSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.ANALYSIS_SETTINGS);
    if (!json) {
      return JSON.stringify(defaultAnalysisSettings());
    }
    return JSON.stringify({
      ...defaultAnalysisSettings(),
      ...JSON.parse(json),
    });
  },
  async saveAnalysisSettings(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.ANALYSIS_SETTINGS, json);
  },
  async loadBatchAnalysisSettings(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async saveBatchAnalysisSettings(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async loadGameSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.GAME_SETTINGS);
    if (!json) {
      return JSON.stringify({
        ...defaultGameSettings(),
        enableAutoSave: false,
      });
    }
    return JSON.stringify({
      ...defaultGameSettings(),
      ...JSON.parse(json),
    });
  },
  async saveGameSettings(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.GAME_SETTINGS, json);
  },
  async loadCSAGameSettingsHistory(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.CSA_GAME_SETTINGS_HISTORY);
    if (!json) {
      return JSON.stringify(defaultCSAGameSettingsHistory());
    }
    return JSON.stringify({
      ...defaultCSAGameSettingsHistory(),
      ...JSON.parse(json),
    });
  },
  async saveCSAGameSettingsHistory(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.CSA_GAME_SETTINGS_HISTORY, json);
  },
  async loadMateSearchSettings(): Promise<string> {
    const json = localStorage.getItem(STORAGE_KEY.MATE_SEARCH_SETTINGS);
    if (!json) {
      return JSON.stringify(defaultMateSearchSettings());
    }
    return JSON.stringify({
      ...defaultMateSearchSettings(),
      ...JSON.parse(json),
    });
  },
  async saveMateSearchSettings(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.MATE_SEARCH_SETTINGS, json);
  },
  async loadUSIEngines(): Promise<string> {
    const engines = new USIEngines(localStorage.getItem(STORAGE_KEY.USI_ENGINES) || undefined);
    // 組み込みの WebAssembly エンジンを常に一覧へ含める。
    // 既に保存されている場合は、ユーザーが編集したオプション値を引き継ぐ。
    const builtins = await loadBuiltinUSIEngines((e) =>
      usiLogger(LogLevel.ERROR, `failed to load builtin engine: ${e.message}`),
    );
    for (const builtin of builtins) {
      const local = engines.getEngine(builtin.uri);
      if (local) {
        mergeUSIEngine(builtin, local);
        engines.updateEngine(builtin);
      } else {
        engines.addEngine(builtin);
      }
    }
    return engines.json;
  },
  async saveUSIEngines(json: string): Promise<void> {
    localStorage.setItem(STORAGE_KEY.USI_ENGINES, json);
  },
  async loadBookImportSettings(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async saveBookImportSettings(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  onUpdateAppSettings(): void {
    // Do Nothing
  },

  // Record File
  async showOpenRecordDialog(formats: string[]): Promise<string> {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", formats.join(","));
    return new Promise<string>((resolve, reject) => {
      input.click();
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          file
            .arrayBuffer()
            .then((data) => {
              const fileURI = uri.issueTempFileURI(file.name);
              fileCache.clear();
              fileCache.set(fileURI, data);
              resolve(fileURI);
            })
            .catch((error) => {
              reject(error);
            });
        } else {
          reject(new Error("invalid file"));
        }
      };
      input.oncancel = () => {
        resolve("");
      };
    });
  },
  async showSaveRecordDialog(defualtPath: string): Promise<string> {
    return defualtPath;
  },
  async showSaveMergedRecordDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async openRecord(uri: string): Promise<Uint8Array> {
    const data = fileCache.get(uri);
    if (data) {
      return new Uint8Array(data);
    }
    return Promise.reject(new Error("invalid URI"));
  },
  async saveRecord(path: string, data: Uint8Array): Promise<void> {
    const blob = new Blob([new Uint8Array(data)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = basename(path);
    a.click();
    URL.revokeObjectURL(url);
  },
  async loadRecordFileHistory(): Promise<string> {
    return JSON.stringify(getEmptyHistory());
  },
  addRecordFileHistory(): void {
    // Do Nothing
  },
  async clearRecordFileHistory(): Promise<void> {
    // Do Nothing
  },
  async saveRecordFileBackup(): Promise<void> {
    // Do Nothing
  },
  async loadRecordFileBackup(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async loadRemoteTextFile(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async convertRecordFiles(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async listRecordFiles(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async showSelectSFENDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async loadSFENFile(): Promise<string[]> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  onOpenRecord(): void {
    // Do Nothing
  },

  // Next Move Problem Collection
  async showOpenNextMoveCollectionDialog(): Promise<string> {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", ".json");
    return new Promise<string>((resolve, reject) => {
      input.click();
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          file
            .arrayBuffer()
            .then((data) => {
              const fileURI = uri.issueTempFileURI(file.name);
              fileCache.clear();
              fileCache.set(fileURI, data);
              resolve(fileURI);
            })
            .catch((error) => {
              reject(error);
            });
        } else {
          reject(new Error("invalid file"));
        }
      };
      input.oncancel = () => {
        resolve("");
      };
    });
  },
  async showSaveNextMoveCollectionDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async loadNextMoveCollection(uri: string): Promise<string> {
    const data = fileCache.get(uri);
    if (data) {
      return new TextDecoder().decode(data);
    }
    return Promise.reject(new Error("invalid URI"));
  },
  async saveNextMoveCollection(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async loadNextMoveGenerationSettings(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async saveNextMoveGenerationSettings(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },

  // Book
  async showOpenBookDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async showSaveBookDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async clearBook(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async openBook(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async openBookAsNewSession(): Promise<number> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async closeBookSession(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async saveBook(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async exportBook(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async getBookFormat(): Promise<BookFormat> {
    return "yane2016";
  },
  async getBookInfo(): Promise<string> {
    return JSON.stringify({
      format: "yane2016",
      type: "in-memory",
      entryCount: 0,
      unsaved: false,
    });
  },
  async searchBookMoves(): Promise<string> {
    return "[]";
  },
  async searchBookEntry(): Promise<string> {
    return "null";
  },
  async updateBookMove(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async updateBookPositionComment(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async removeBookMove(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async updateBookMoveOrder(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async importBookMoves(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },

  // USI
  async showSelectUSIEngineDialog(): Promise<string> {
    // Web 版はファイルシステム上のエンジンを起動できない。
    // 利用できるのは組み込みの WebAssembly エンジンのみで、これらは既に一覧に含まれている。
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async getUSIEngineInfo(path: string, timeoutSeconds: number): Promise<string> {
    return JSON.stringify(await usiSessions.getEngineInfo(path, timeoutSeconds));
  },
  async getUSIEngineMetadata(): Promise<string> {
    return JSON.stringify({ isShellScript: false } as USIEngineMetadata);
  },
  async sendUSIOptionButtonSignal(
    path: string,
    name: string,
    timeoutSeconds: number,
  ): Promise<void> {
    await usiSessions.sendOptionButtonSignal(path, name, timeoutSeconds);
  },
  async usiLaunch(json: string, options: string): Promise<number> {
    return usiSessions.setupPlayer(
      JSON.parse(json) as USIEngine,
      JSON.parse(options) as USIEngineLaunchOptions,
    );
  },
  async usiReady(sessionID: number): Promise<void> {
    await usiSessions.ready(sessionID);
  },
  async usiSetOption(sessionID: number, name: string, value: string): Promise<void> {
    usiSessions.setOption(sessionID, name, value);
  },
  async usiGo(sessionID: number, usi: string, timeStatesJSON: string): Promise<void> {
    usiSessions.go(sessionID, usi, JSON.parse(timeStatesJSON) as TimeStates);
  },
  async usiGoPonder(sessionID: number, usi: string, timeStatesJSON: string): Promise<void> {
    usiSessions.goPonder(sessionID, usi, JSON.parse(timeStatesJSON) as TimeStates);
  },
  async usiPonderHit(sessionID: number): Promise<void> {
    usiSessions.ponderHit(sessionID);
  },
  async usiGoInfinite(sessionID: number, usi: string): Promise<void> {
    usiSessions.goInfinite(sessionID, usi);
  },
  async usiGoMate(sessionID: number, usi: string, maxSeconds?: number): Promise<void> {
    usiSessions.goMate(sessionID, usi, maxSeconds);
  },
  async usiStop(sessionID: number): Promise<void> {
    usiSessions.stop(sessionID);
  },
  async usiGameover(sessionID: number, result: GameResult): Promise<void> {
    usiSessions.gameover(sessionID, result);
  },
  async usiQuit(sessionID: number): Promise<void> {
    usiSessions.quit(sessionID);
  },
  onUSIBestMove(
    callback: (sessionID: number, usi: string, usiMove: string, ponder?: string) => void,
  ): void {
    usiHandlers.onUSIBestMove = callback;
  },
  onUSICheckmate(callback: (sessionID: number, usi: string, usiMoves: string[]) => void): void {
    usiHandlers.onUSICheckmate = callback;
  },
  onUSICheckmateNotImplemented(callback: (sessionID: number) => void): void {
    usiHandlers.onUSICheckmateNotImplemented = callback;
  },
  onUSICheckmateTimeout(callback: (sessionID: number, usi: string) => void): void {
    usiHandlers.onUSICheckmateTimeout = callback;
  },
  onUSINoMate(callback: (sessionID: number, usi: string) => void): void {
    usiHandlers.onUSINoMate = callback;
  },
  onUSIInfo(callback: (sessionID: number, usi: string, json: string) => void): void {
    usiHandlers.onUSIInfo = callback;
  },

  // CSA
  async csaLogin(): Promise<number> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async csaLogout(): Promise<void> {
    // Do Nothing
  },
  async csaAgree(): Promise<void> {
    // Do Nothing
  },
  async csaMove(): Promise<void> {
    // Do Nothing
  },
  async csaResign(): Promise<void> {
    // Do Nothing
  },
  async csaWin(): Promise<void> {
    // Do Nothing
  },
  async csaStop(): Promise<void> {
    // Do Nothing
  },
  onCSAGameSummary(): void {
    // Do Nothing
  },
  onCSAReject(): void {
    // Do Nothing
  },
  onCSAStart(): void {
    // Do Nothing
  },
  onCSAMove(): void {
    // Do Nothing
  },
  onCSAGameResult(): void {
    // Do Nothing
  },
  onCSAClose(): void {
    // Do Nothing
  },

  // Sessions
  async collectSessionStates(): Promise<string> {
    return JSON.stringify({
      os: blankOSState(),
      usiSessions: usiSessions.collectSessionStates(),
      csaSessions: [],
    } as SessionStates);
  },
  async setupPrompt(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async openPrompt() {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  invokePromptCommand(): void {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  onPromptCommand(): void {
    // Do Nothing
  },

  // Images
  async showSelectImageDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async cropPieceImage(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async exportCaptureAsPNG(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async exportCaptureAsJPEG(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },

  // Layout
  async loadLayoutProfileList(): Promise<[string, string]> {
    return [uri.ES_STANDARD_LAYOUT_PROFILE, JSON.stringify(emptyLayoutProfileList())];
  },
  updateLayoutProfileList(): void {
    // Do Nothing
  },
  onUpdateLayoutProfile(): void {
    // Do Nothing
  },
  createDesktopShortcutForLayoutProfile(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },

  // Log
  openLogFile(): void {
    // Do Nothing
  },
  log(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.log(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  },

  // MISC
  async showSelectFileDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  async showSelectDirectoryDialog(): Promise<string> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  openExplorer() {
    // DO NOTHING
  },
  openWebBrowser(url: string) {
    window.open(url, "_blank");
  },
  async getMachineSpec(): Promise<string> {
    const spec: MachineSpec = { cpuCores: 1, memory: 1024 ** 2 };
    return JSON.stringify(spec);
  },
  async isEncryptionAvailable(): Promise<boolean> {
    return false;
  },
  async getVersionStatus(): Promise<string> {
    return JSON.stringify({} as VersionStatus);
  },
  async checkUpdates(): Promise<void> {
    throw new Error(t.thisFeatureNotAvailableOnWebApp);
  },
  getPathForFile(file: File): string {
    return file.name;
  },
  onProgress(): void {
    // Do Nothing
  },
};
