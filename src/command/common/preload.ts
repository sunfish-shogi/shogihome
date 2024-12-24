/* eslint-disable no-console */
import { LogDestination, getAppLogger, setLogDestinations } from "@/background/log";
import {
  login as csaLogin,
  logout as csaLogout,
  agree as csaAgree,
  doMove as csaMove,
  resign as csaResign,
  win as csaWin,
  stop as csaStop,
  setHandlers as setCSAHandlers,
} from "@/background/csa";
import {
  ready as usiReady,
  go as usiGo,
  setHandlers as setUSIHandlers,
  setupPlayer as usiSetupPlayer,
  goPonder as usiGoPonder,
  ponderHit as usiPonderHit,
  goInfinite as usiGoInfinite,
  goMate as usiGoMate,
  stop as usiStop,
  gameover as usiGameover,
  quit as usiQuit,
} from "@/background/usi";
import { GameResult } from "@/common/game/result";
import { LogLevel, LogType } from "@/common/log";
import { USIEngine } from "@/common/settings/usi";
import { Bridge } from "@/renderer/ipc/bridge";
import { BookLoadingMode } from "@/common/book";
import { Language, setLanguage } from "@/common/i18n";

type Config = {
  appLogFile: boolean;
  usiLogFile: boolean;
  csaLogFile: boolean;
  stdoutLog: boolean;
  logLevel: LogLevel;
  language: Language;
};

export function preload(config: Config) {
  setLanguage(config.language);

  const fileAndStdout: LogDestination[] = config.stdoutLog ? ["file", "stdout"] : ["file"];
  const appDestinations: LogDestination[] = config.appLogFile ? fileAndStdout : ["stdout"];
  const usiDestinations: LogDestination[] = config.usiLogFile ? fileAndStdout : ["stdout"];
  const csaDestinations: LogDestination[] = config.csaLogFile ? fileAndStdout : ["stdout"];
  setLogDestinations(LogType.APP, appDestinations, config.logLevel);
  setLogDestinations(LogType.USI, usiDestinations, config.logLevel);
  setLogDestinations(LogType.CSA, csaDestinations, config.logLevel);

  const bridge: Bridge = {
    // Core
    updateAppState(): void {
      // DO NOTHING
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
    onMenuEvent(): void {
      // Do Nothing
    },

    // Settings
    async loadAppSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveAppSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadBatchConversionSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveBatchConversionSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadResearchSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveResearchSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadAnalysisSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveAnalysisSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadGameSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveGameSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadCSAGameSettingsHistory(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveCSAGameSettingsHistory(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadMateSearchSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveMateSearchSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadUSIEngines(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveUSIEngines(): Promise<void> {
      // Do Nothing
    },
    async loadBookImportSettings(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveBookImportSettings(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    onUpdateAppSettings(): void {
      // Do Nothing
    },

    // Record File
    async fetchInitialRecordFileRequest(): Promise<string> {
      return "null";
    },
    async showOpenRecordDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async showSaveRecordDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async showSaveMergedRecordDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async openRecord(): Promise<Uint8Array> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveRecord(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async loadRecordFileHistory(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
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
      throw new Error("This feature is not available on command line tool");
    },
    async loadRemoteRecordFile(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async convertRecordFiles(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    onOpenRecord(): void {
      // Do Nothing
    },

    // Book
    async showOpenBookDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async showSaveBookDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async clearBook(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async openBook(): Promise<BookLoadingMode> {
      throw new Error("This feature is not available on command line tool");
    },
    async saveBook(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async searchBookMoves(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async updateBookMove(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async removeBookMove(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async updateBookMoveOrder(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async importBookMoves(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },

    // USI
    async showSelectUSIEngineDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async getUSIEngineInfo(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async sendUSISetOption(): Promise<void> {
      // Do Nothing
    },
    async usiLaunch(json: string, timeoutSeconds: number): Promise<number> {
      const engine = JSON.parse(json) as USIEngine;
      return await usiSetupPlayer(engine, timeoutSeconds);
    },
    async usiReady(sessionID: number): Promise<void> {
      return await usiReady(sessionID);
    },
    async usiGo(sessionID: number, usi: string, timeStates: string): Promise<void> {
      usiGo(sessionID, usi, JSON.parse(timeStates));
    },
    async usiGoPonder(sessionID: number, usi: string, timeStatesJSON: string): Promise<void> {
      usiGoPonder(sessionID, usi, JSON.parse(timeStatesJSON));
    },
    async usiPonderHit(sessionID: number, timeStatesJSON: string): Promise<void> {
      usiPonderHit(sessionID, JSON.parse(timeStatesJSON));
    },
    async usiGoInfinite(sessionID: number, usi: string): Promise<void> {
      usiGoInfinite(sessionID, usi);
    },
    async usiGoMate(sessionID: number, usi: string): Promise<void> {
      usiGoMate(sessionID, usi);
    },
    async usiStop(sessionID: number): Promise<void> {
      usiStop(sessionID);
    },
    async usiGameover(sessionID: number, result: GameResult): Promise<void> {
      usiGameover(sessionID, result);
    },
    async usiQuit(sessionID: number): Promise<void> {
      usiQuit(sessionID);
    },
    onUSIBestMove(): void {
      // Do Nothing
    },
    onUSICheckmate(): void {
      // Do Nothing
    },
    onUSICheckmateNotImplemented(): void {
      // Do Nothing
    },
    onUSICheckmateTimeout(): void {
      // Do Nothing
    },
    onUSINoMate(): void {
      // Do Nothing
    },
    onUSIInfo(): void {
      // Do Nothing
    },
    onUSIPonderInfo(): void {
      // Do Nothing
    },

    // CSA
    async csaLogin(json: string): Promise<number> {
      return csaLogin(JSON.parse(json));
    },
    async csaLogout(sessionID: number): Promise<void> {
      csaLogout(sessionID);
    },
    async csaAgree(sessionID: number, gameID: string): Promise<void> {
      csaAgree(sessionID, gameID);
    },
    async csaMove(sessionID: number, move: string, score?: number, pv?: string): Promise<void> {
      csaMove(sessionID, move, score, pv);
    },
    async csaResign(sessionID: number): Promise<void> {
      csaResign(sessionID);
    },
    async csaWin(sessionID: number): Promise<void> {
      csaWin(sessionID);
    },
    async csaStop(sessionID: number): Promise<void> {
      csaStop(sessionID);
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
      throw new Error("This feature is not available on command line tool");
    },
    async setupPrompt(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async openPrompt() {
      throw new Error("This feature is not available on command line tool");
    },
    invokePromptCommand(): void {
      throw new Error("This feature is not available on command line tool");
    },
    onPromptCommand(): void {
      // Do Nothing
    },

    // Images
    async showSelectImageDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async cropPieceImage(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    async exportCaptureAsPNG(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },
    async exportCaptureAsJPEG(): Promise<void> {
      throw new Error("This feature is not available on command line tool");
    },

    // Layout
    async loadLayoutProfileList(): Promise<[string, string]> {
      throw new Error("This feature is not available on command line tool");
    },
    updateLayoutProfileList(): void {
      // Do Nothing
    },
    onUpdateLayoutProfileList(): void {
      // Do Nothing
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
      throw new Error("This feature is not available on command line tool");
    },
    async showSelectDirectoryDialog(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    openExplorer() {
      throw new Error("This feature is not available on command line tool");
    },
    openWebBrowser() {
      throw new Error("This feature is not available on command line tool");
    },
    async isEncryptionAvailable(): Promise<boolean> {
      return false;
    },
    async getVersionStatus(): Promise<string> {
      throw new Error("This feature is not available on command line tool");
    },
    sendTestNotification(): void {
      throw new Error("This feature is not available on command line tool");
    },
    getPathForFile() {
      throw new Error("This feature is not available on command line tool");
    },
    onProgress(): void {
      // Do Nothing
    },
  };

  global.window = {
    ...global,
    electronShogiAPI: bridge,
  } as unknown as Window & typeof globalThis;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const usi = require("@/renderer/players/usi");
  setUSIHandlers({
    onUSIBestMove: usi.onUSIBestMove,
    onUSICheckmate: usi.onUSICheckmate,
    onUSICheckmateNotImplemented: usi.onUSICheckmateNotImplemented,
    onUSICheckmateTimeout: usi.onUSICheckmateTimeout,
    onUSINoMate: usi.onUSINoMate,
    onUSIInfo: usi.onUSIInfo,
    onUSIPonderInfo: usi.onUSIPonderInfo,
    sendPromptCommand: () => {},
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const csa = require("@/renderer/store/csa");
  setCSAHandlers({
    onCSAGameSummary: csa.onCSAGameSummary,
    onCSAReject: csa.onCSAReject,
    onCSAStart: csa.onCSAStart,
    onCSAMove: csa.onCSAMove,
    onCSAGameResult: csa.onCSAGameResult,
    onCSAClose: csa.onCSAClose,
    sendPromptCommand: () => {},
    sendError: (error: Error) => {
      getAppLogger().error(error);
    },
  });

  process.on("uncaughtException", (e, origin) => {
    getAppLogger().error(new Error(`${origin} ${e}`));
  });
}
