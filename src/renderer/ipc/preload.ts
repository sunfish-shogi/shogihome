import { MenuEvent } from "@/common/control/menu";
import { AppState, ResearchState } from "@/common/control/state";
import { GameResult } from "@/common/game/result";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { Background, Renderer } from "@/common/ipc/channel";
import { Bridge } from "@/renderer/ipc/bridge";
import { LogType, LogLevel } from "@/common/log";
import { CSAGameResult, CSASpecialMove } from "@/common/game/csa";
import { PromptTarget } from "@/common/advanced/prompt";
import { CommandType } from "@/common/advanced/command";

const api: Bridge = {
  // Core
  updateAppState(appState: AppState, researchState: ResearchState, busy: boolean): void {
    ipcRenderer.send(Background.UPDATE_APP_STATE, appState, researchState, busy);
  },
  async fetchProcessArgs(): Promise<string> {
    return await ipcRenderer.invoke(Background.FETCH_PROCESS_ARGS);
  },
  onClosable(): void {
    ipcRenderer.send(Background.ON_CLOSABLE);
  },
  onClose(callback: (confirmations: string[]) => void): void {
    ipcRenderer.on(Renderer.CLOSE, (_, confirmations: string[]) => {
      callback(confirmations);
    });
  },
  onSendError(callback: (e: string) => void): void {
    ipcRenderer.on(Renderer.SEND_ERROR, (_, e) => {
      callback(e);
    });
  },
  onSendMessage(callback: (json: string) => void): void {
    ipcRenderer.on(Renderer.SEND_MESSAGE, (_, json) => {
      callback(json);
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMenuEvent(callback: (event: MenuEvent, ...args: any[]) => void): void {
    ipcRenderer.on(Renderer.MENU_EVENT, (_, event, ...args) => callback(event, ...args));
  },

  // Settings
  async loadAppSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_APP_SETTINGS);
  },
  async saveAppSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_APP_SETTINGS, json);
  },
  async loadBatchConversionSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_BATCH_CONVERSION_SETTINGS);
  },
  async saveBatchConversionSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_BATCH_CONVERSION_SETTINGS, json);
  },
  async loadResearchSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_RESEARCH_SETTINGS);
  },
  async saveResearchSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_RESEARCH_SETTINGS, json);
  },
  async loadAnalysisSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_ANALYSIS_SETTINGS);
  },
  async saveAnalysisSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_ANALYSIS_SETTINGS, json);
  },
  async loadGameSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_GAME_SETTINGS);
  },
  async saveGameSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_GAME_SETTINGS, json);
  },
  async loadCSAGameSettingsHistory(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_CSA_GAME_SETTINGS_HISTORY);
  },
  async saveCSAGameSettingsHistory(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_CSA_GAME_SETTINGS_HISTORY, json);
  },
  async loadMateSearchSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_MATE_SEARCH_SETTINGS);
  },
  async saveMateSearchSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_MATE_SEARCH_SETTINGS, json);
  },
  async loadUSIEngines(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_USI_ENGINES);
  },
  async saveUSIEngines(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_USI_ENGINES, json);
  },
  async loadBookImportSettings(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_BOOK_IMPORT_SETTINGS);
  },
  async saveBookImportSettings(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_BOOK_IMPORT_SETTINGS, json);
  },
  onUpdateAppSettings(callback: (json: string) => void): void {
    ipcRenderer.on(Renderer.UPDATE_APP_SETTINGS, (_, json) => callback(json));
  },

  // Record File
  async showOpenRecordDialog(formats: string[]): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_OPEN_RECORD_DIALOG, formats);
  },
  async showSaveRecordDialog(defaultPath: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_RECORD_DIALOG, defaultPath);
  },
  async showSaveMergedRecordDialog(defaultPath: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_MERGED_RECORD_DIALOG, defaultPath);
  },
  async openRecord(path: string): Promise<Uint8Array> {
    return await ipcRenderer.invoke(Background.OPEN_RECORD, path);
  },
  async saveRecord(path: string, data: Uint8Array): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_RECORD, path, data);
  },
  async loadRemoteTextFile(url: string): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_REMOTE_TEXT_FILE, url);
  },
  async convertRecordFiles(json: string): Promise<string> {
    return await ipcRenderer.invoke(Background.CONVERT_RECORD_FILES, json);
  },
  async showSelectSFENDialog(lastPath: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_SFEN_DIALOG, lastPath);
  },
  async loadSFENFile(path: string): Promise<string[]> {
    return await ipcRenderer.invoke(Background.LOAD_SFEN_FILE, path);
  },
  async loadRecordFileHistory(): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_RECORD_FILE_HISTORY);
  },
  addRecordFileHistory(path: string): void {
    ipcRenderer.send(Background.ADD_RECORD_FILE_HISTORY, path);
  },
  async clearRecordFileHistory(): Promise<void> {
    ipcRenderer.invoke(Background.CLEAR_RECORD_FILE_HISTORY);
  },
  async saveRecordFileBackup(kif: string): Promise<void> {
    await ipcRenderer.invoke(Background.SAVE_RECORD_FILE_BACKUP, kif);
  },
  async loadRecordFileBackup(name: string): Promise<string> {
    return await ipcRenderer.invoke(Background.LOAD_RECORD_FILE_BACKUP, name);
  },
  onOpenRecord(callback: (path: string) => void): void {
    ipcRenderer.on(Renderer.OPEN_RECORD, (_, path) => callback(path));
  },

  // Book
  async showOpenBookDialog(): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_OPEN_BOOK_DIALOG);
  },
  async showSaveBookDialog(): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SAVE_BOOK_DIALOG);
  },
  async clearBook(): Promise<void> {
    return await ipcRenderer.invoke(Background.CLEAR_BOOK);
  },
  async openBook(path: string, json: string): Promise<void> {
    await ipcRenderer.invoke(Background.OPEN_BOOK, path, json);
  },
  async saveBook(path: string): Promise<void> {
    return await ipcRenderer.invoke(Background.SAVE_BOOK, path);
  },
  async searchBookMoves(sfen: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SEARCH_BOOK_MOVES, sfen);
  },
  async updateBookMove(sfen: string, json: string): Promise<void> {
    return await ipcRenderer.invoke(Background.UPDATE_BOOK_MOVE, sfen, json);
  },
  async removeBookMove(sfen: string, usi: string): Promise<void> {
    return await ipcRenderer.invoke(Background.REMOVE_BOOK_MOVE, sfen, usi);
  },
  async updateBookMoveOrder(sfen: string, usi: string, order: number): Promise<void> {
    return await ipcRenderer.invoke(Background.UPDATE_BOOK_MOVE_ORDER, sfen, usi, order);
  },
  async importBookMoves(json: string): Promise<string> {
    return await ipcRenderer.invoke(Background.IMPORT_BOOK_MOVES, json);
  },

  // USI
  async showSelectUSIEngineDialog(): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_USI_ENGINE_DIALOG);
  },
  async getUSIEngineInfo(path: string, timeoutSeconds: number): Promise<string> {
    return await ipcRenderer.invoke(Background.GET_USI_ENGINE_INFO, path, timeoutSeconds);
  },
  async sendUSIOptionButtonSignal(
    path: string,
    name: string,
    timeoutSeconds: number,
  ): Promise<void> {
    await ipcRenderer.invoke(Background.SEND_USI_OPTION_BUTTON_SIGNAL, path, name, timeoutSeconds);
  },
  async usiLaunch(json: string, timeoutSeconds: number): Promise<number> {
    return await ipcRenderer.invoke(Background.LAUNCH_USI, json, timeoutSeconds);
  },
  async usiReady(sessionID: number): Promise<void> {
    await ipcRenderer.invoke(Background.USI_READY, sessionID);
  },
  async usiSetOption(sessionID: number, name: string, value: string): Promise<void> {
    await ipcRenderer.invoke(Background.USI_SET_OPTION, sessionID, name, value);
  },
  async usiGo(sessionID: number, usi: string, timeStatesJSON: string): Promise<void> {
    await ipcRenderer.invoke(Background.USI_GO, sessionID, usi, timeStatesJSON);
  },
  async usiGoPonder(sessionID: number, usi: string, timeStatesJSON: string): Promise<void> {
    await ipcRenderer.invoke(Background.USI_GO_PONDER, sessionID, usi, timeStatesJSON);
  },
  async usiPonderHit(sessionID: number, timeStatesJSON: string): Promise<void> {
    await ipcRenderer.invoke(Background.USI_GO_PONDER_HIT, sessionID, timeStatesJSON);
  },
  async usiGoInfinite(sessionID: number, usi: string): Promise<void> {
    await ipcRenderer.invoke(Background.USI_GO_INFINITE, sessionID, usi);
  },
  async usiGoMate(sessionID: number, usi: string, maxSeconds?: number): Promise<void> {
    await ipcRenderer.invoke(Background.USI_GO_MATE, sessionID, usi, maxSeconds);
  },
  async usiStop(sessionID: number): Promise<void> {
    await ipcRenderer.invoke(Background.USI_STOP, sessionID);
  },
  async usiGameover(sessionID: number, result: GameResult): Promise<void> {
    await ipcRenderer.invoke(Background.USI_GAMEOVER, sessionID, result);
  },
  async usiQuit(sessionID: number): Promise<void> {
    await ipcRenderer.invoke(Background.USI_QUIT, sessionID);
  },
  onUSIBestMove(
    callback: (sessionID: number, usi: string, usiMove: string, ponder?: string) => void,
  ): void {
    ipcRenderer.on(Renderer.USI_BEST_MOVE, (_, sessionID, usi, usiMove, ponder) => {
      callback(sessionID, usi, usiMove, ponder);
    });
  },
  onUSICheckmate(callback: (sessionID: number, usi: string, moves: string[]) => void): void {
    ipcRenderer.on(Renderer.USI_CHECKMATE, (_, sessionID, usi, moves) => {
      callback(sessionID, usi, moves);
    });
  },
  onUSICheckmateNotImplemented(callback: (sessionID: number) => void): void {
    ipcRenderer.on(Renderer.USI_CHECKMATE_NOT_IMPLEMENTED, (_, sessionID) => {
      callback(sessionID);
    });
  },
  onUSICheckmateTimeout(callback: (sessionID: number, usi: string) => void): void {
    ipcRenderer.on(Renderer.USI_CHECKMATE_TIMEOUT, (_, sessionID, usi) => {
      callback(sessionID, usi);
    });
  },
  onUSINoMate(callback: (sessionID: number, usi: string) => void): void {
    ipcRenderer.on(Renderer.USI_NO_MATE, (_, sessionID, usi) => {
      callback(sessionID, usi);
    });
  },
  onUSIInfo(callback: (sessionID: number, usi: string, json: string) => void): void {
    ipcRenderer.on(Renderer.USI_INFO, (_, sessionID, usi, json) => {
      callback(sessionID, usi, json);
    });
  },

  // CSA
  async csaLogin(json: string): Promise<number> {
    return await ipcRenderer.invoke(Background.CSA_LOGIN, json);
  },
  async csaLogout(sessionID: number): Promise<void> {
    return await ipcRenderer.invoke(Background.CSA_LOGOUT, sessionID);
  },
  async csaAgree(sessionID: number, gameID: string): Promise<void> {
    return await ipcRenderer.invoke(Background.CSA_AGREE, sessionID, gameID);
  },
  async csaMove(sessionID: number, move: string, score?: number, pv?: string): Promise<void> {
    return await ipcRenderer.invoke(Background.CSA_MOVE, sessionID, move, score, pv);
  },
  async csaResign(sessionID: number): Promise<void> {
    return await ipcRenderer.invoke(Background.CSA_RESIGN, sessionID);
  },
  async csaWin(sessionID: number): Promise<void> {
    return await ipcRenderer.invoke(Background.CSA_WIN, sessionID);
  },
  async csaStop(sessionID: number): Promise<void> {
    return await ipcRenderer.invoke(Background.CSA_STOP, sessionID);
  },
  onCSAGameSummary(callback: (sessionID: number, gameSummary: string) => void): void {
    ipcRenderer.on(Renderer.CSA_GAME_SUMMARY, (_, sessionID, gameSummary) => {
      callback(sessionID, gameSummary);
    });
  },
  onCSAReject(callback: (sessionID: number) => void): void {
    ipcRenderer.on(Renderer.CSA_REJECT, (_, sessionID) => {
      callback(sessionID);
    });
  },
  onCSAStart(callback: (sessionID: number, playerStates: string) => void): void {
    ipcRenderer.on(Renderer.CSA_START, (_, sessionID, playerStates) => {
      callback(sessionID, playerStates);
    });
  },
  onCSAMove(callback: (sessionID: number, mvoe: string, playerStates: string) => void): void {
    ipcRenderer.on(Renderer.CSA_MOVE, (_, sessionID, move, playerStates) => {
      callback(sessionID, move, playerStates);
    });
  },
  onCSAGameResult(
    callback: (sessionID: number, specialMove: CSASpecialMove, gameResult: CSAGameResult) => void,
  ): void {
    ipcRenderer.on(Renderer.CSA_GAME_RESULT, (_, sessionID, specialMove, gameResult) => {
      callback(sessionID, specialMove, gameResult);
    });
  },
  onCSAClose(callback: (sessionID: number) => void): void {
    ipcRenderer.on(Renderer.CSA_CLOSE, (_, sessionID) => {
      callback(sessionID);
    });
  },

  // Sessions
  async collectSessionStates(): Promise<string> {
    return await ipcRenderer.invoke(Background.COLLECT_SESSION_STATES);
  },
  async setupPrompt(target: PromptTarget, sessionID: number): Promise<string> {
    return await ipcRenderer.invoke(Background.SETUP_PROMPT, target, sessionID);
  },
  openPrompt(target: PromptTarget, sessionID: number, name: string): void {
    ipcRenderer.send(Background.OPEN_PROMPT, target, sessionID, name);
  },
  invokePromptCommand(
    target: PromptTarget,
    sessionID: number,
    type: CommandType,
    command: string,
  ): void {
    ipcRenderer.send(Background.INVOKE_PROMPT_COMMAND, target, sessionID, type, command);
  },
  onPromptCommand(callback: (command: string) => void): void {
    ipcRenderer.on(Renderer.PROMPT_COMMAND, (_, command) => {
      callback(command);
    });
  },

  // Images
  async showSelectImageDialog(defaultURL?: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_IMAGE_DIALOG, defaultURL);
  },
  async cropPieceImage(srcURL: string, deleteMargin: boolean): Promise<string> {
    return await ipcRenderer.invoke(Background.CROP_PIECE_IMAGE, srcURL, deleteMargin);
  },
  async exportCaptureAsPNG(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.EXPORT_CAPTURE_AS_PNG, json);
  },
  async exportCaptureAsJPEG(json: string): Promise<void> {
    await ipcRenderer.invoke(Background.EXPORT_CAPTURE_AS_JPEG, json);
  },

  // Layout
  async loadLayoutProfileList(): Promise<[string, string]> {
    return await ipcRenderer.invoke(Background.LOAD_LAYOUT_PROFILE_LIST);
  },
  updateLayoutProfileList(uri: string, profileList: string): void {
    ipcRenderer.send(Background.UPDATE_LAYOUT_PROFILE_LIST, uri, profileList);
  },
  onUpdateLayoutProfile(callback: (json: string | null) => void): void {
    ipcRenderer.on(Renderer.UPDATE_LAYOUT_PROFILE, (_, json) => {
      callback(json);
    });
  },
  async createDesktopShortcutForLayoutProfile(uri: string, name: string) {
    await ipcRenderer.invoke(Background.CREATE_DESKTOP_SHORTCUT_FOR_LAYOUT_PROFILE, uri, name);
  },

  // Log
  openLogFile(logType: LogType): void {
    ipcRenderer.send(Background.OPEN_LOG_FILE, logType);
  },
  log(level: LogLevel, message: string): void {
    ipcRenderer.send(Background.LOG, level, message);
  },

  // MISC
  async showSelectFileDialog(): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_FILE_DIALOG);
  },
  async showSelectDirectoryDialog(defaultPath?: string): Promise<string> {
    return await ipcRenderer.invoke(Background.SHOW_SELECT_DIRECTORY_DIALOG, defaultPath);
  },
  openExplorer(path: string) {
    ipcRenderer.send(Background.OPEN_EXPLORER, path);
  },
  openWebBrowser(url: string) {
    ipcRenderer.send(Background.OPEN_WEB_BROWSER, url);
  },
  async isEncryptionAvailable(): Promise<boolean> {
    return await ipcRenderer.invoke(Background.IS_ENCRYPTION_AVAILABLE);
  },
  async getVersionStatus(): Promise<string> {
    return await ipcRenderer.invoke(Background.GET_VERSION_STATUS);
  },
  sendTestNotification(): void {
    ipcRenderer.send(Background.SEND_TEST_NOTIFICATION);
  },
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
  onProgress(callback: (progress: number) => void): void {
    ipcRenderer.on(Renderer.PROGRESS, (_, progress) => {
      callback(progress);
    });
  },
  //@LoveKapibarasan
  listFiles(dir: string): Promise<string[]> {
    return ipcRenderer.invoke(Background.LIST_FILES, dir);
  },

  //=====
};

contextBridge.exposeInMainWorld("electronShogiAPI", api);
