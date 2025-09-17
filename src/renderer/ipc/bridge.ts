import { CommandType } from "@/common/advanced/command.js";
import { PromptTarget } from "@/common/advanced/prompt.js";
import { MenuEvent } from "@/common/control/menu.js";
import { AppState, ResearchState } from "@/common/control/state.js";
import { RecordFileFormat } from "@/common/file/record";
import { CSAGameResult, CSASpecialMove } from "@/common/game/csa.js";
import { GameResult } from "@/common/game/result.js";
import { LogLevel, LogType } from "@/common/log.js";

export interface Bridge {
  // Core
  updateAppState(appState: AppState, researchState: ResearchState, busy: boolean): void;
  fetchProcessArgs(): Promise<string>;
  onClosable(): void;
  onClose(callback: (confirmations: string[]) => void): void;
  onSendError(callback: (e: string) => void): void;
  onSendMessage(callback: (json: string) => void): void;
  onMenuEvent(callback: (event: MenuEvent) => void): void;

  // Settings
  loadAppSettings(): Promise<string>;
  saveAppSettings(settings: string): Promise<void>;
  loadBatchConversionSettings(): Promise<string>;
  saveBatchConversionSettings(settings: string): Promise<void>;
  loadResearchSettings(): Promise<string>;
  saveResearchSettings(settings: string): Promise<void>;
  loadAnalysisSettings(): Promise<string>;
  saveAnalysisSettings(settings: string): Promise<void>;
  loadGameSettings(): Promise<string>;
  saveGameSettings(settings: string): Promise<void>;
  loadCSAGameSettingsHistory(): Promise<string>;
  saveCSAGameSettingsHistory(settings: string): Promise<void>;
  loadMateSearchSettings(): Promise<string>;
  saveMateSearchSettings(settings: string): Promise<void>;
  loadUSIEngines(): Promise<string>;
  saveUSIEngines(egneins: string): Promise<void>;
  loadBookImportSettings(): Promise<string>;
  saveBookImportSettings(json: string): Promise<void>;
  onUpdateAppSettings(callback: (json: string) => void): void;

  // Record File
  showOpenRecordDialog(formats: RecordFileFormat[]): Promise<string>;
  showSaveRecordDialog(defaultPath: string): Promise<string>;
  showSaveMergedRecordDialog(defaultPath: string): Promise<string>;
  openRecord(path: string): Promise<Uint8Array>;
  saveRecord(path: string, data: Uint8Array): Promise<void>;
  loadRecordFileHistory(): Promise<string>;
  addRecordFileHistory(path: string): void;
  clearRecordFileHistory(): Promise<void>;
  saveRecordFileBackup(kif: string): Promise<void>;
  loadRecordFileBackup(name: string): Promise<string>;
  loadRemoteTextFile(url: string): Promise<string>;
  convertRecordFiles(json: string): Promise<string>;
  showSelectSFENDialog(lastPath: string): Promise<string>;
  loadSFENFile(path: string): Promise<string[]>;
  onOpenRecord(callback: (path: string) => void): void;

  // Book
  showOpenBookDialog(): Promise<string>;
  showSaveBookDialog(): Promise<string>;
  openBook(path: string, json: string): Promise<void>;
  saveBook(path: string): Promise<void>;
  clearBook(): Promise<void>;
  searchBookMoves(sfen: string): Promise<string>;
  updateBookMove(sfen: string, move: string): Promise<void>;
  removeBookMove(sfen: string, usi: string): Promise<void>;
  updateBookMoveOrder(sfen: string, usi: string, order: number): Promise<void>;
  importBookMoves(json: string): Promise<string>;

  // USI
  showSelectUSIEngineDialog(): Promise<string>;
  getUSIEngineInfo(path: string, timeoutSeconds: number): Promise<string>;
  sendUSIOptionButtonSignal(path: string, name: string, timeoutSeconds: number): Promise<void>;
  usiLaunch(json: string, timeoutSeconds: number): Promise<number>;
  usiReady(sessionID: number): Promise<void>;
  usiSetOption(sessionID: number, name: string, value: string): Promise<void>;
  usiGo(sessionID: number, usi: string, timeStatesJSON: string): Promise<void>;
  usiGoPonder(sessionID: number, usi: string, timeStatesJSON: string): Promise<void>;
  usiPonderHit(sessionID: number, timeStatesJSON: string): Promise<void>;
  usiGoInfinite(sessionID: number, usi: string): Promise<void>;
  usiGoMate(sessionID: number, usi: string, maxSeconds?: number): Promise<void>;
  usiStop(sessionID: number): Promise<void>;
  usiGameover(sessionID: number, result: GameResult): Promise<void>;
  usiQuit(sessionID: number): Promise<void>;
  onUSIBestMove(
    callback: (sessionID: number, usi: string, usiMove: string, ponder?: string) => void,
  ): void;
  onUSICheckmate(callback: (sessionID: number, usi: string, usiMoves: string[]) => void): void;
  onUSICheckmateNotImplemented(callback: (sessionID: number) => void): void;
  onUSICheckmateTimeout(callback: (sessionID: number, usi: string) => void): void;
  onUSINoMate(callback: (sessionID: number, usi: string) => void): void;
  onUSIInfo(callback: (sessionID: number, usi: string, json: string) => void): void;

  // CSA
  csaLogin(json: string): Promise<number>;
  csaLogout(sessionID: number): Promise<void>;
  csaAgree(sessionID: number, gameID: string): Promise<void>;
  csaMove(sessionID: number, move: string, score?: number, pv?: string): Promise<void>;
  csaResign(sessionID: number): Promise<void>;
  csaWin(sessionID: number): Promise<void>;
  csaStop(sessionID: number): Promise<void>;
  onCSAGameSummary(callback: (sessionID: number, gameSummary: string) => void): void;
  onCSAReject(callback: (sessionID: number) => void): void;
  onCSAStart(callback: (sessionID: number, playerStates: string) => void): void;
  onCSAMove(callback: (sessionID: number, mvoe: string, playerStates: string) => void): void;
  onCSAGameResult(
    callback: (sessionID: number, specialMove: CSASpecialMove, gameResult: CSAGameResult) => void,
  ): void;
  onCSAClose(callback: (sessionID: number) => void): void;

  // Sessions
  collectSessionStates(): Promise<string>;
  setupPrompt(target: PromptTarget, sessionID: number): Promise<string>;
  openPrompt(target: PromptTarget, sessionID: number, name: string): void;
  invokePromptCommand(
    target: PromptTarget,
    sessionID: number,
    type: CommandType,
    command: string,
  ): void;
  onPromptCommand(callback: (command: string) => void): void;

  // Images
  showSelectImageDialog(defaultURL?: string): Promise<string>;
  cropPieceImage(srcURL: string, deleteMargin: boolean): Promise<string>;
  exportCaptureAsPNG(json: string): Promise<void>;
  exportCaptureAsJPEG(json: string): Promise<void>;

  // Layout
  loadLayoutProfileList(): Promise<[string, string]>;
  updateLayoutProfileList(uri: string, profileList: string): void;
  onUpdateLayoutProfile(callback: (json: string | null) => void): void;
  createDesktopShortcutForLayoutProfile(uri: string, name: string): Promise<void>;

  // Log
  openLogFile(logType: LogType): void;
  log(level: LogLevel, message: string): void;

  // MISC
  showSelectFileDialog(): Promise<string>;
  showSelectDirectoryDialog(defaultPath?: string): Promise<string>;
  openExplorer(path: string): void;
  openWebBrowser(url: string): void;
  isEncryptionAvailable(): Promise<boolean>;
  getVersionStatus(): Promise<string>;
  sendTestNotification(): void;
  getPathForFile(file: File): string;
  onProgress(callback: (progress: number) => void): void;
  //@LoveKapibarasan
  listFiles(dir: string): Promise<string[]>;
  //=====
}
