import { USIEngine, USIEngines } from "@/common/settings/usi";
import { GameSettings } from "@/common/settings/game";
import { AppSettings } from "@/common/settings/app";
import { webAPI } from "./web";
import { ResearchSettings } from "@/common/settings/research";
import { AppState, ResearchState } from "@/common/control/state";
import { GameResult } from "@/common/game/result";
import { AnalysisSettings } from "@/common/settings/analysis";
import { LogLevel, LogType } from "@/common/log";
import { CSAGameSettingsHistory, CSAServerSettings } from "@/common/settings/csa";
import { Rect } from "@/common/assets/geometry";
import { MateSearchSettings } from "@/common/settings/mate";
import { BatchConversionSettings } from "@/common/settings/conversion";
import { BatchConversionResult } from "@/common/file/conversion";
import { RecordFileHistory } from "@/common/file/history";
import { InitialRecordFileRequest } from "@/common/file/record";
import { VersionStatus } from "@/common/version";
import { SessionStates } from "@/common/advanced/monitor";
import { PromptTarget } from "@/common/advanced/prompt";
import { CommandHistory, CommandType } from "@/common/advanced/command";
import { Bridge } from "./bridge";
import { TimeStates } from "@/common/game/time";
import { LayoutProfileList } from "@/common/settings/layout";
import { BookImportSummary, BookLoadingMode, BookLoadingOptions, BookMove } from "@/common/book";
import { BookImportSettings } from "@/common/settings/book";

type AppInfo = {
  appVersion?: string;
};

export interface API {
  // Core
  updateAppState(appState: AppState, researchState: ResearchState, busy: boolean): void;

  // Settings
  loadAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<void>;
  loadBatchConversionSettings(): Promise<BatchConversionSettings>;
  saveBatchConversionSettings(settings: BatchConversionSettings): Promise<void>;
  loadResearchSettings(): Promise<ResearchSettings>;
  saveResearchSettings(settings: ResearchSettings): Promise<void>;
  loadAnalysisSettings(): Promise<AnalysisSettings>;
  saveAnalysisSettings(settings: AnalysisSettings): Promise<void>;
  loadGameSettings(): Promise<GameSettings>;
  saveGameSettings(settings: GameSettings): Promise<void>;
  loadCSAGameSettingsHistory(): Promise<CSAGameSettingsHistory>;
  saveCSAGameSettingsHistory(settings: CSAGameSettingsHistory): Promise<void>;
  loadMateSearchSettings(): Promise<MateSearchSettings>;
  saveMateSearchSettings(settings: MateSearchSettings): Promise<void>;
  loadUSIEngines(): Promise<USIEngines>;
  saveUSIEngines(usiEngines: USIEngines): Promise<void>;
  loadBookImportSettings(): Promise<BookImportSettings>;
  saveBookImportSettings(settings: BookImportSettings): Promise<void>;

  // Record File
  fetchInitialRecordFileRequest(): Promise<InitialRecordFileRequest>;
  showOpenRecordDialog(): Promise<string>;
  showSaveRecordDialog(defaultPath: string): Promise<string>;
  showSaveMergedRecordDialog(defaultPath: string): Promise<string>;
  openRecord(path: string): Promise<Uint8Array>;
  saveRecord(path: string, data: Uint8Array): Promise<void>;
  loadRecordFileHistory(): Promise<RecordFileHistory>;
  addRecordFileHistory(path: string): void;
  clearRecordFileHistory(): Promise<void>;
  saveRecordFileBackup(kif: string): Promise<void>;
  loadRecordFileBackup(name: string): Promise<string>;
  loadRemoteRecordFile(url: string): Promise<string>;
  convertRecordFiles(settings: BatchConversionSettings): Promise<BatchConversionResult>;
  showSelectSFENDialog(lastPath: string): Promise<string>;
  loadSFENFile(path: string): Promise<string[]>;

  // Book
  showOpenBookDialog(): Promise<string>;
  showSaveBookDialog(): Promise<string>;
  openBook(path: string, options: BookLoadingOptions): Promise<BookLoadingMode>;
  saveBook(path: string): Promise<void>;
  clearBook(): Promise<void>;
  searchBookMoves(sfen: string): Promise<BookMove[]>;
  updateBookMove(sfen: string, move: BookMove): Promise<void>;
  removeBookMove(sfen: string, usi: string): Promise<void>;
  updateBookMoveOrder(sfen: string, usi: string, order: number): Promise<void>;
  importBookMoves(settings: BookImportSettings): Promise<BookImportSummary>;

  // USI
  showSelectUSIEngineDialog(): Promise<string>;
  getUSIEngineInfo(path: string, timeoutSeconds: number): Promise<USIEngine>;
  sendUSISetOption(path: string, name: string, timeoutSeconds: number): Promise<void>;
  usiLaunch(engine: USIEngine, timeoutSeconds: number): Promise<number>;
  usiReady(sessionID: number): Promise<void>;
  usiGo(sessionID: number, usi: string, timeStates: TimeStates): Promise<void>;
  usiGoPonder(sessionID: number, usi: string, timeStates: TimeStates): Promise<void>;
  usiPonderHit(sessionID: number, timeStates: TimeStates): Promise<void>;
  usiGoInfinite(sessionID: number, usi: string): Promise<void>;
  usiGoMate(sessionID: number, usi: string): Promise<void>;
  usiStop(sessionID: number): Promise<void>;
  usiGameover(sessionID: number, result: GameResult): Promise<void>;
  usiQuit(sessionID: number): Promise<void>;

  // CSA
  csaLogin(settings: CSAServerSettings): Promise<number>;
  csaLogout(sessionID: number): Promise<void>;
  csaAgree(sessionID: number, gameID: string): Promise<void>;
  csaMove(sessionID: number, move: string, score?: number, pv?: string): Promise<void>;
  csaResign(sessionID: number): Promise<void>;
  csaWin(sessionID: number): Promise<void>;
  csaStop(sessionID: number): Promise<void>;

  // Sessions
  collectSessionStates(): Promise<SessionStates>;
  setupPrompt(target: PromptTarget, sessionID: number): Promise<CommandHistory>;
  openPrompt(target: PromptTarget, sessionID: number, name: string): void;
  invokePromptCommand(
    target: PromptTarget,
    sessionID: number,
    type: CommandType,
    command: string,
  ): void;

  // Images
  showSelectImageDialog(defaultURL?: string): Promise<string>;
  cropPieceImage(srcURL: string, deleteMargin: boolean): Promise<string>;
  exportCaptureAsPNG(rect: Rect): Promise<void>;
  exportCaptureAsJPEG(rect: Rect): Promise<void>;

  // Layout
  loadLayoutProfileList(): Promise<[string, LayoutProfileList]>;
  updateLayoutProfileList(uri: string, profileList: LayoutProfileList): void;

  // Log
  openLogFile(logType: LogType): void;
  log(level: LogLevel, message: string): void;

  // MISC
  showSelectFileDialog(): Promise<string>;
  showSelectDirectoryDialog(defaultPath?: string): Promise<string>;
  openExplorer(path: string): void;
  openWebBrowser(url: string): void;
  isEncryptionAvailable(): Promise<boolean>;
  getVersionStatus(): Promise<VersionStatus>;
  sendTestNotification(): void;
  getPathForFile(file: File): string;
}

interface ExtendedWindow extends Window {
  electronShogi?: AppInfo;
  electronShogiAPI?: Bridge;
}

function getWindowObject(): ExtendedWindow {
  return window as unknown as ExtendedWindow;
}

export const appInfo: AppInfo = getWindowObject().electronShogi || {};

export const bridge: Bridge = getWindowObject().electronShogiAPI || webAPI;

const api: API = {
  ...bridge,

  // Settings
  async loadAppSettings(): Promise<AppSettings> {
    return JSON.parse(await bridge.loadAppSettings());
  },
  saveAppSettings(settings: AppSettings): Promise<void> {
    return bridge.saveAppSettings(JSON.stringify(settings));
  },
  async loadBatchConversionSettings(): Promise<BatchConversionSettings> {
    return JSON.parse(await bridge.loadBatchConversionSettings());
  },
  saveBatchConversionSettings(settings: BatchConversionSettings): Promise<void> {
    return bridge.saveBatchConversionSettings(JSON.stringify(settings));
  },
  async loadResearchSettings(): Promise<ResearchSettings> {
    return JSON.parse(await bridge.loadResearchSettings());
  },
  saveResearchSettings(settings: ResearchSettings): Promise<void> {
    return bridge.saveResearchSettings(JSON.stringify(settings));
  },
  async loadAnalysisSettings(): Promise<AnalysisSettings> {
    return JSON.parse(await bridge.loadAnalysisSettings());
  },
  saveAnalysisSettings(settings: AnalysisSettings): Promise<void> {
    return bridge.saveAnalysisSettings(JSON.stringify(settings));
  },
  async loadGameSettings(): Promise<GameSettings> {
    return JSON.parse(await bridge.loadGameSettings());
  },
  saveGameSettings(settings: GameSettings): Promise<void> {
    return bridge.saveGameSettings(JSON.stringify(settings));
  },
  async loadCSAGameSettingsHistory(): Promise<CSAGameSettingsHistory> {
    return JSON.parse(await bridge.loadCSAGameSettingsHistory());
  },
  saveCSAGameSettingsHistory(settings: CSAGameSettingsHistory): Promise<void> {
    return bridge.saveCSAGameSettingsHistory(JSON.stringify(settings));
  },
  async loadMateSearchSettings(): Promise<MateSearchSettings> {
    return JSON.parse(await bridge.loadMateSearchSettings());
  },
  saveMateSearchSettings(settings: MateSearchSettings): Promise<void> {
    return bridge.saveMateSearchSettings(JSON.stringify(settings));
  },
  async loadRecordFileHistory(): Promise<RecordFileHistory> {
    return JSON.parse(await bridge.loadRecordFileHistory());
  },
  async loadUSIEngines(): Promise<USIEngines> {
    return new USIEngines(await bridge.loadUSIEngines());
  },
  saveUSIEngines(usiEngines: USIEngines): Promise<void> {
    return bridge.saveUSIEngines(usiEngines.json);
  },
  async loadBookImportSettings(): Promise<BookImportSettings> {
    return JSON.parse(await bridge.loadBookImportSettings());
  },
  saveBookImportSettings(settings: BookImportSettings): Promise<void> {
    return bridge.saveBookImportSettings(JSON.stringify(settings));
  },

  // Record File
  async fetchInitialRecordFileRequest(): Promise<InitialRecordFileRequest> {
    return JSON.parse(await bridge.fetchInitialRecordFileRequest());
  },
  async convertRecordFiles(settings: BatchConversionSettings): Promise<BatchConversionResult> {
    return JSON.parse(await bridge.convertRecordFiles(JSON.stringify(settings)));
  },

  // Book
  openBook(path: string, options: BookLoadingOptions): Promise<BookLoadingMode> {
    return bridge.openBook(path, JSON.stringify(options));
  },
  async searchBookMoves(sfen: string): Promise<BookMove[]> {
    return JSON.parse(await bridge.searchBookMoves(sfen));
  },
  updateBookMove(sfen: string, move: BookMove): Promise<void> {
    return bridge.updateBookMove(sfen, JSON.stringify(move));
  },
  async importBookMoves(settings: BookImportSettings): Promise<BookImportSummary> {
    return JSON.parse(await bridge.importBookMoves(JSON.stringify(settings)));
  },

  // USI
  async getUSIEngineInfo(path: string, timeoutSeconds: number): Promise<USIEngine> {
    return JSON.parse(await bridge.getUSIEngineInfo(path, timeoutSeconds));
  },
  usiLaunch(engine: USIEngine, timeoutSeconds: number): Promise<number> {
    return bridge.usiLaunch(JSON.stringify(engine), timeoutSeconds);
  },
  usiReady(sessionID: number): Promise<void> {
    return bridge.usiReady(sessionID);
  },
  usiGo(sessionID: number, usi: string, timeStates: TimeStates): Promise<void> {
    return bridge.usiGo(sessionID, usi, JSON.stringify(timeStates));
  },
  usiGoPonder(sessionID: number, usi: string, timeStates: TimeStates): Promise<void> {
    return bridge.usiGoPonder(sessionID, usi, JSON.stringify(timeStates));
  },
  usiPonderHit(sessionID, timeStates) {
    return bridge.usiPonderHit(sessionID, JSON.stringify(timeStates));
  },

  // CSA
  csaLogin(settings: CSAServerSettings): Promise<number> {
    return bridge.csaLogin(JSON.stringify(settings));
  },

  // Sessions
  async collectSessionStates(): Promise<SessionStates> {
    return JSON.parse(await bridge.collectSessionStates());
  },
  async setupPrompt(target: PromptTarget, sessionID: number): Promise<CommandHistory> {
    return JSON.parse(await bridge.setupPrompt(target, sessionID));
  },

  // Images
  exportCaptureAsPNG(rect: Rect): Promise<void> {
    return bridge.exportCaptureAsPNG(rect.json);
  },
  exportCaptureAsJPEG(rect: Rect): Promise<void> {
    return bridge.exportCaptureAsJPEG(rect.json);
  },

  // Layout
  async loadLayoutProfileList(): Promise<[string, LayoutProfileList]> {
    const [uri, json] = await bridge.loadLayoutProfileList();
    return [uri, JSON.parse(json)];
  },
  updateLayoutProfileList(uri: string, profileList: LayoutProfileList): void {
    bridge.updateLayoutProfileList(uri, JSON.stringify(profileList));
  },

  // MISC
  async getVersionStatus(): Promise<VersionStatus> {
    return JSON.parse(await bridge.getVersionStatus());
  },
};

export default api;

export function isNative(): boolean {
  return !!getWindowObject().electronShogiAPI;
}

export function isMobileWebApp(): boolean {
  if (isNative()) {
    return false;
  }
  const urlParams = new URL(window.location.toString()).searchParams;
  return urlParams.has("mobile");
}
