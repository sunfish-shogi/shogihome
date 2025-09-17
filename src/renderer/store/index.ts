import api, { isNative } from "@/renderer/ipc/api.js";
import {
  Color,
  exportCSA,
  ImmutableRecord,
  Move,
  PositionChange,
  formatSpecialMove,
  exportKIF,
  RecordMetadataKey,
  ImmutablePosition,
  DoMoveOption,
  SpecialMoveType,
  exportKI2,
  RecordFormatType,
  exportJKFString,
  countJishogiDeclarationPoint,
  judgeJishogiDeclaration,
  JishogiDeclarationRule,
  countJishogiPoint,
  Position,
  exportBOD,
  InitialPositionType,
  ImmutableNode,
  Record,
} from "tsshogi";
import { reactive, UnwrapNestedRefs } from "vue";
import { GameSettings } from "@/common/settings/game.js";
import { ClockSoundTarget, Tab, TextDecodingRule } from "@/common/settings/app.js";
import { beepShort, beepUnlimited, playPieceBeat, stopBeep } from "@/renderer/devices/audio.js";
import {
  RecordManager,
  SearchInfoSenderType,
  SearchInfo as SearchInfoParam,
  ChangePositionHandler,
  UpdateCustomDataHandler,
  PieceSet,
  UpdateTreeHandler,
} from "./record.js";
import { calculateGameStatistics, GameManager, GameResults } from "./game.js";
import { generateRecordFileName, join } from "@/renderer/helpers/path.js";
import { ResearchSettings } from "@/common/settings/research.js";
import { USIPlayerMonitor, USIMonitor } from "./usi.js";
import { AppState, ResearchState } from "@/common/control/state.js";
import { useMessageStore } from "./message.js";
import * as uri from "@/common/uri.js";
import { AnalysisManager } from "./analysis.js";
import { AnalysisSettings } from "@/common/settings/analysis.js";
import { MateSearchSettings } from "@/common/settings/mate.js";
import { LogLevel } from "@/common/log.js";
import { CSAGameManager, CSAGameState } from "./csa.js";
import { Clock } from "./clock.js";
import { CSAGameSettings, appendCSAGameSettingsHistory } from "@/common/settings/csa.js";
import { defaultPlayerBuilder } from "@/renderer/players/builder.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import { ResearchManager } from "./research.js";
import { SearchInfo } from "@/renderer/players/player.js";
import { useAppSettings } from "./settings.js";
import { t } from "@/common/i18n/index.js";
import { MateSearchManager } from "./mate.js";
import { detectUnsupportedRecordProperties } from "@/renderer/helpers/record.js";
import {
  RecordFileFormat,
  detectRecordFileFormatByPath,
  getStandardRecordFileFormats,
} from "@/common/file/record.js";
import { setOnStartSearchHandler, setOnUpdateUSIInfoHandler } from "@/renderer/players/usi.js";
import { useErrorStore } from "./error.js";
import { useBusyState } from "./busy.js";
import { Confirmation, useConfirmationStore } from "./confirm.js";
import { LayoutProfile } from "@/common/settings/layout.js";
import { clearURLParams, loadRecordForWebApp, saveRecordForWebApp } from "./webapp.js";
import { CommentBehavior } from "@/common/settings/comment.js";
import { Attachment, ListItem } from "@/common/message.js";
//@LoveKapibarasan
import { ref } from "vue";
//=====
export type PVPreview = {
  position: ImmutablePosition;
  engineName?: string;
  multiPV?: number;
  depth?: number;
  selectiveDepth?: number;
  score?: number;
  mate?: number;
  lowerBound?: boolean;
  upperBound?: boolean;
  pv: Move[];
};

function getMessageAttachmentsByGameResults(results: GameResults): Attachment[] {
  const statistics = calculateGameStatistics(results);
  return [
    {
      type: "list",
      items: [
        {
          text: results.player1.name,
          children: [
            `${t.wins}: ${results.player1.win}`,
            `${t.winsOnBlack}: ${results.player1.winBlack}`,
            `${t.winsOnWhite}: ${results.player1.winWhite}`,
          ],
        },
        {
          text: results.player2.name,
          children: [
            `${t.wins}: ${results.player2.win}`,
            `${t.winsOnBlack}: ${results.player2.winBlack}`,
            `${t.winsOnWhite}: ${results.player2.winWhite}`,
          ],
        },
        { text: `${t.draws}: ${results.draw}` },
        { text: `${t.validGames}: ${results.total - results.invalid}` },
        { text: `${t.invalidGames}: ${results.invalid}` },
        {
          text: `${t.eloRatingDiff} (${t.ignoreDraws})`,
          children: [
            `${statistics.rating.toFixed(2)}`,
            `95% CI: [${statistics.ratingLower.toFixed(1)}, ${statistics.ratingUpper.toFixed(1)}]`,
          ],
        },
        {
          text: "二項検定", // TODO: i18n
          children: [
            `np > 5: ${statistics.npIsGreaterThan5 ? "True" : "False"}`,
            `${t.zValue}: ${statistics.zValue.toFixed(2)}`,
            `${t.significance5pc}: ${statistics.significance5pc ? "True" : "False"}`,
            `${t.significance1pc}: ${statistics.significance1pc ? "True" : "False"}`,
          ],
        },
      ],
    },
  ];
}

class Store {
  private recordManager = new RecordManager(loadRecordForWebApp());
  private _appState = AppState.NORMAL;
  private _customLayout: LayoutProfile | null = null;
  private _isAppSettingsDialogVisible = false;
  private _pvPreview?: PVPreview;
  private usiMonitor = new USIMonitor();
  private blackClock = new Clock();
  private whiteClock = new Clock();
  private gameManager = new GameManager(this.recordManager, this.blackClock, this.whiteClock);
  private csaGameManager = new CSAGameManager(this.recordManager, this.blackClock, this.whiteClock);
  private analysisManager = new AnalysisManager(this.recordManager);
  private mateSearchManager = new MateSearchManager();
  private _researchState = ResearchState.IDLE;
  private researchManager = new ResearchManager();
  private _reactive: UnwrapNestedRefs<Store>;
  private garbledNotified = false;
  private onChangePositionHandlers: ChangePositionHandler[] = [];
  private onUpdateRecordTreeHandlers: UpdateTreeHandler[] = [];
  private onUpdateCustomDataHandlers: UpdateCustomDataHandler[] = [];

  //@LoveKapibarasan
  private abortControllers = new Map<string, AbortController>();
  public recordRef = ref<ImmutableRecord>(this.recordManager.record);
  //=====
  constructor() {
    const refs = reactive(this);
    this._reactive = refs;
    this.recordManager
      .on("changePosition", () => {
        this.onChangePositionHandlers.forEach((handler) => handler());
        saveRecordForWebApp(this.record);
        this.updateResearchPosition();
        //@LoveKapibarasan
        // record の参照を差し替えることで Vue に更新を伝える
        this.recordRef.value = this.recordManager.record;
        //=====
      })
      .on("updateTree", () => {
        this.onUpdateRecordTreeHandlers.forEach((handler) => handler());
        saveRecordForWebApp(this.record);
        clearURLParams();
      })
      .on("updateComment", () => {
        saveRecordForWebApp(this.record);
      })
      .on("updateBookmark", () => {
        saveRecordForWebApp(this.record);
      })
      .on("updateCustomData", () => {
        this.onUpdateCustomDataHandlers.forEach((handler) => handler());
        saveRecordForWebApp(this.record);
      })
      .on("backup", () => {
        return {
          returnCode: useAppSettings().returnCode,
        };
      });
    this.gameManager
      .on("saveRecord", this.onSaveRecord.bind(refs))
      .on("gameEnd", this.onGameEnd.bind(refs))
      .on("flipBoard", this.onFlipBoard.bind(refs))
      .on("pieceBeat", () => playPieceBeat(useAppSettings().pieceVolume))
      .on("beepShort", this.onBeepShort.bind(refs))
      .on("beepUnlimited", this.onBeepUnlimited.bind(refs))
      .on("stopBeep", stopBeep)
      .on("error", (e) => {
        useErrorStore().add(e);
      });
    this.csaGameManager
      .on("saveRecord", this.onSaveRecord.bind(refs))
      .on("gameEnd", this.onCSAGameEnd.bind(refs))
      .on("flipBoard", this.onFlipBoard.bind(refs))
      .on("pieceBeat", () => playPieceBeat(useAppSettings().pieceVolume))
      .on("beepShort", this.onBeepShort.bind(refs))
      .on("beepUnlimited", this.onBeepUnlimited.bind(refs))
      .on("stopBeep", stopBeep)
      .on("error", (e) => {
        useErrorStore().add(e);
      });
    this.researchManager
      .on("updateSearchInfo", this.onUpdateSearchInfo.bind(refs))
      .on("error", (e) => {
        useErrorStore().add(e);
      });
    this.analysisManager.on("finish", this.onFinish.bind(refs)).on("error", (e) => {
      useErrorStore().add(e);
    });
    this.mateSearchManager
      .on("checkmate", this.onCheckmate.bind(refs))
      .on("notImplemented", this.onNotImplemented.bind(refs))
      .on("noMate", this.onNoMate.bind(refs))
      .on("error", this.onCheckmateError.bind(refs));
    setOnStartSearchHandler(this.endUSIIteration.bind(refs));
    setOnUpdateUSIInfoHandler(this.updateUSIInfo.bind(refs));
  }

  addEventListener(event: "changePosition", handler: ChangePositionHandler): void;
  addEventListener(event: "updateRecordTree", handler: UpdateTreeHandler): void;
  addEventListener(event: "updateCustomData", handler: UpdateCustomDataHandler): void;
  addEventListener(event: string, handler: unknown): void {
    switch (event) {
      case "changePosition":
        this.onChangePositionHandlers.push(handler as ChangePositionHandler);
        break;
      case "updateRecordTree":
        this.onUpdateRecordTreeHandlers.push(handler as UpdateTreeHandler);
        break;
      case "updateCustomData":
        this.onUpdateCustomDataHandlers.push(handler as UpdateCustomDataHandler);
        break;
    }
  }

  removeEventListener(event: "changePosition", handler: ChangePositionHandler): void;
  removeEventListener(event: "updateRecordTree", handler: UpdateTreeHandler): void;
  removeEventListener(event: "updateCustomData", handler: UpdateCustomDataHandler): void;
  removeEventListener(event: string, handler: unknown): void {
    switch (event) {
      case "changePosition":
        this.onChangePositionHandlers = this.onChangePositionHandlers.filter((h) => h !== handler);
        break;
      case "updateRecordTree":
        this.onUpdateRecordTreeHandlers = this.onUpdateRecordTreeHandlers.filter(
          (h) => h !== handler,
        );
        break;
      case "updateCustomData":
        this.onUpdateCustomDataHandlers = this.onUpdateCustomDataHandlers.filter(
          (h) => h !== handler,
        );
        break;
    }
  }

  get reactive(): UnwrapNestedRefs<Store> {
    return this._reactive;
  }

  get record(): ImmutableRecord {
    return this.recordManager.record;
  }

  get recordFilePath(): string | undefined {
    return this.recordManager.recordFilePath;
  }

  get isRecordFileUnsaved(): boolean {
    return this.recordManager.unsaved;
  }

  get inCommentPVs(): Move[][] {
    return this.recordManager.inCommentPVs;
  }

  get positionCounts(): ReadonlyMap<string, number> {
    return this.recordManager.positionCounts;
  }

  updateStandardRecordMetadata(update: { key: RecordMetadataKey; value: string }): void {
    this.recordManager.updateStandardMetadata(update);
  }

  appendSearchComment(
    type: SearchInfoSenderType,
    searchInfo: SearchInfoParam,
    behavior: CommentBehavior,
    options?: {
      header?: string;
      engineName?: string;
    },
  ): void {
    const appSettings = useAppSettings();
    this.recordManager.appendSearchComment(
      type,
      appSettings.searchCommentFormat,
      searchInfo,
      behavior,
      options,
    );
  }

  appendMovesSilently(moves: Move[], opt?: DoMoveOption): number {
    return this.recordManager.appendMovesSilently(moves, opt);
  }

  get appState(): AppState {
    return this._appState;
  }

  get researchState(): ResearchState {
    return this._researchState;
  }

  get customLayout() {
    return this._customLayout;
  }

  updateLayoutProfile(layout: LayoutProfile | null): void {
    this._customLayout = layout;
  }

  get pvPreview(): PVPreview | undefined {
    return this._pvPreview;
  }

  showPVPreviewDialog(pvPreview: PVPreview): void {
    this._pvPreview = pvPreview;
  }

  closePVPreviewDialog(): void {
    this._pvPreview = undefined;
  }

  showPasteDialog(mode: "standard" | "mergeIntoRoot" | "mergeIntoCurrent" = "standard"): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    const appSettings = useAppSettings();
    if ((mode === "standard" && appSettings.showPasteDialog) || !isNative()) {
      this._appState = AppState.PASTE_DIALOG;
    } else {
      navigator.clipboard.readText().then((text) => {
        this.pasteRecord(text, mode);
      });
    }
  }

  showGameDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.GAME_DIALOG;
    }
  }

  showCSAGameDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.CSA_GAME_DIALOG;
    }
  }

  showAnalysisDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.ANALYSIS_DIALOG;
    }
  }

  showMateSearchDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.MATE_SEARCH_DIALOG;
    }
  }

  showUsiEngineManagementDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.USI_ENGINES_DIALOG;
    }
  }

  showRecordFileHistoryDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.RECORD_FILE_HISTORY_DIALOG;
    }
  }

  showBatchConversionDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.BATCH_CONVERSION_DIALOG;
    }
  }

  showExportBoardImageDialog() {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.EXPORT_POSITION_IMAGE_DIALOG;
    }
  }

  showLaunchUSIEngineDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.LAUNCH_USI_ENGINE_DIALOG;
    }
  }

  showConnectToCSAServerDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.CONNECT_TO_CSA_SERVER_DIALOG;
    }
  }

  showLoadRemoteFileDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.LOAD_REMOTE_FILE_DIALOG;
    }
  }

  showShareDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.SHARE_DIALOG;
    }
  }

  showAddBookMovesDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.ADD_BOOK_MOVES_DIALOG;
    }
  }

  showSearchDuplicatePositionsDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.SEARCH_DUPLICATE_POSITIONS_DIALOG;
    }
  }

  destroyModalDialog(): void {
    if (
      this.appState === AppState.PASTE_DIALOG ||
      this.appState === AppState.GAME_DIALOG ||
      this.appState === AppState.CSA_GAME_DIALOG ||
      this.appState === AppState.ANALYSIS_DIALOG ||
      this.appState === AppState.MATE_SEARCH_DIALOG ||
      this.appState === AppState.USI_ENGINES_DIALOG ||
      this.appState === AppState.EXPORT_POSITION_IMAGE_DIALOG ||
      this.appState === AppState.RECORD_FILE_HISTORY_DIALOG ||
      this.appState === AppState.BATCH_CONVERSION_DIALOG ||
      this.appState === AppState.LAUNCH_USI_ENGINE_DIALOG ||
      this.appState === AppState.CONNECT_TO_CSA_SERVER_DIALOG ||
      this.appState === AppState.LOAD_REMOTE_FILE_DIALOG ||
      this.appState === AppState.SHARE_DIALOG ||
      this.appState === AppState.ADD_BOOK_MOVES_DIALOG ||
      this.appState === AppState.SEARCH_DUPLICATE_POSITIONS_DIALOG
    ) {
      this._appState = AppState.NORMAL;
    }
  }

  closeModalDialog(): void {
    if (!useBusyState().isBusy) {
      this.destroyModalDialog();
    }
  }

  get isAppSettingsDialogVisible(): boolean {
    return this._isAppSettingsDialogVisible;
  }

  showAppSettingsDialog(): void {
    this._isAppSettingsDialogVisible = true;
  }

  closeAppSettingsDialog(): void {
    this._isAppSettingsDialogVisible = false;
  }

  get usiMonitors(): USIPlayerMonitor[] {
    return this.usiMonitor.sessions;
  }

  get candidates(): Move[] {
    const appSettings = useAppSettings();
    const maxScoreDiff = 100;
    const sfen = this.recordManager.record.position.sfen;
    const candidates: Move[] = [];
    const usiSet = new Set<string>();
    for (const session of this.usiMonitor.sessions) {
      if (session.ponderMove) {
        continue;
      }
      let entryCount = 0;
      let maxScore = -Infinity;
      for (const info of session.latestInfo) {
        if (entryCount >= appSettings.maxArrowsPerEngine) {
          break;
        }
        if (info.multiPV && info.multiPV > appSettings.maxArrowsPerEngine) {
          break;
        }
        if (!info.pv?.length) {
          continue;
        }
        const score =
          info.score !== undefined
            ? info.score
            : info.scoreMate
              ? info.scoreMate > 0
                ? 1e8 - info.scoreMate
                : -1e8 - info.scoreMate
              : undefined;
        if (score !== undefined) {
          if (score < maxScore - maxScoreDiff) {
            continue;
          } else if (score > maxScore) {
            maxScore = score;
          }
        }
        const usi = info.pv[0];
        if (usiSet.has(usi)) {
          continue;
        }
        if (info.position !== sfen) {
          continue;
        }
        const pos = Position.newBySFEN(info.position);
        if (!pos) {
          continue;
        }
        const move = pos.createMoveByUSI(usi);
        if (!move || !pos.doMove(move)) {
          continue;
        }
        candidates.push(move);
        usiSet.add(usi);
        entryCount++;
      }
    }
    return candidates;
  }

  isPausedResearchEngine(sessionID: number): boolean {
    return this.researchManager.isPaused(sessionID);
  }

  pauseResearchEngine(sessionID: number): void {
    this.researchManager.pause(sessionID);
  }

  unpauseResearchEngine(sessionID: number): void {
    this.researchManager.unpause(sessionID);
  }

  getResearchMultiPV(sessionID: number): number | undefined {
    return this.researchManager.getMultiPV(sessionID);
  }

  setResearchMultiPV(sessionID: number, multiPV: number): void {
    this.researchManager.setMultiPV(sessionID, multiPV);
  }

  endUSIIteration(sessionID: number): void {
    this.usiMonitor.endIteration(sessionID);
  }

  updateUSIInfo(
    sessionID: number,
    position: ImmutablePosition,
    name: string,
    info: USIInfoCommand,
    ponderMove?: Move,
  ): void {
    const appSettings = useAppSettings();
    this.usiMonitor.update(
      sessionID,
      position,
      name,
      info,
      appSettings.maxPVTextLength,
      ponderMove,
    );
  }

  get blackTime(): number {
    return this.blackClock.time;
  }

  get blackByoyomi(): number {
    return this.blackClock.byoyomi;
  }

  get whiteTime(): number {
    return this.whiteClock.time;
  }

  get whiteByoyomi(): number {
    return this.whiteClock.byoyomi;
  }

  startGame(settings: GameSettings): void {
    if (useBusyState().isBusy) {
      return;
    }
    if (this.appState !== AppState.NORMAL && this.appState !== AppState.GAME_DIALOG) {
      return;
    }
    useBusyState().retain();
    api
      .saveGameSettings(settings)
      .then(() => {
        const appSettings = useAppSettings();
        const builder = defaultPlayerBuilder(appSettings.engineTimeoutSeconds);
        return this.gameManager.start(settings, builder);
      })
      .then(() => (this._appState = AppState.GAME))
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  get gameSettings(): GameSettings {
    return this.gameManager.settings;
  }

  get gameResults(): GameResults {
    return this.gameManager.results;
  }

  get csaGameState(): CSAGameState {
    return this.csaGameManager.state;
  }

  get csaServerSessionID(): number {
    return this.csaGameManager.sessionID;
  }

  get csaGameSettings(): CSAGameSettings {
    return this.csaGameManager.settings;
  }

  get usiSessionIDs(): number[] {
    if (this.appState == AppState.CSA_GAME) {
      return [this.csaGameManager.usiSessionID].filter((id) => id);
    }
    return [];
  }

  loginCSAGame(settings: CSAGameSettings, opt: { saveHistory: boolean }): void {
    if (this.appState !== AppState.CSA_GAME_DIALOG || useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    Promise.resolve()
      .then(async () => {
        if (opt.saveHistory) {
          const latestHistory = await api.loadCSAGameSettingsHistory();
          const history = appendCSAGameSettingsHistory(latestHistory, settings);
          await api.saveCSAGameSettingsHistory(history);
        }
      })
      .then(() => {
        const appSettings = useAppSettings();
        const builder = defaultPlayerBuilder(appSettings.engineTimeoutSeconds);
        return this.csaGameManager.login(settings, builder);
      })
      .then(() => (this._appState = AppState.CSA_GAME))
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  cancelCSAGame(): void {
    if (this.appState !== AppState.CSA_GAME) {
      return;
    }
    if (this.csaGameManager.state === CSAGameState.GAME) {
      useErrorStore().add("対局が始まっているため通信対局をキャンセルできませんでした。"); // TODO: i18n
      return;
    }
    this.csaGameManager.logout();
    this._appState = AppState.NORMAL;
  }

  stopGame(): void {
    switch (this.appState) {
      case AppState.GAME:
        // 連続対局の場合は確認ダイアログを表示する。
        if (this.gameManager.settings.repeat >= 2) {
          this.showConfirmation({
            message: t.areYouSureWantToQuitGames,
            onOk: () => this.gameManager.stop(),
          });
        } else {
          this.gameManager.stop();
        }
        break;
      case AppState.CSA_GAME:
        // 確認ダイアログを表示する。
        this.showConfirmation({
          message: t.areYouSureWantToRequestQuit,
          onOk: () => this.csaGameManager.stop(),
        });
        break;
    }
  }

  showGameResults(): void {
    if (this.appState !== AppState.GAME) {
      return;
    }
    const results = this.gameManager.results;
    useMessageStore().enqueue({
      text: t.gameProgress,
      attachments: getMessageAttachmentsByGameResults(results),
      withCopyButton: true,
    });
  }

  private onGameEnd(results: GameResults, specialMoveType: SpecialMoveType): void {
    if (this.appState !== AppState.GAME) {
      return;
    }
    api.log(LogLevel.INFO, `game end: ${JSON.stringify(results)}`);
    if (results && results.total >= 2) {
      useMessageStore().enqueue({
        text: t.allGamesCompleted,
        attachments: getMessageAttachmentsByGameResults(results),
        withCopyButton: true,
      });
    } else if (specialMoveType) {
      useMessageStore().enqueue({
        text: `${t.gameEnded}（${formatSpecialMove(specialMoveType)})`,
      });
    }
    this._appState = AppState.NORMAL;
  }

  private onCSAGameEnd(): void {
    if (this.appState !== AppState.CSA_GAME) {
      return;
    }
    this._appState = AppState.NORMAL;
  }

  private onFlipBoard(flip: boolean): void {
    const appSettings = useAppSettings();
    if (appSettings.boardFlipping !== flip) {
      useAppSettings().flipBoard();
    }
  }

  private onSaveRecord(): void {
    const appSettings = useAppSettings();
    const fname = generateRecordFileName(this.recordManager.record, {
      template: appSettings.recordFileNameTemplate,
      extension: appSettings.defaultRecordFileFormat,
    });
    const path = join(appSettings.autoSaveDirectory, fname);
    this.saveRecordByPath(path).catch((e) => {
      useErrorStore().add(e);
    });
  }

  private onBeepShort(): void {
    const appSettings = useAppSettings();
    if (appSettings.clockSoundTarget === ClockSoundTarget.ONLY_USER && !this.isMovableByUser) {
      return;
    }
    // An exception may be thrown if the audio API is not supported.
    try {
      beepShort({
        frequency: appSettings.clockPitch,
        volume: appSettings.clockVolume,
      });
    } catch (e) {
      useErrorStore().add(e);
    }
  }

  private onBeepUnlimited(): void {
    const appSettings = useAppSettings();
    if (appSettings.clockSoundTarget === ClockSoundTarget.ONLY_USER && !this.isMovableByUser) {
      return;
    }
    // An exception may be thrown if the audio API is not supported.
    try {
      beepUnlimited({
        frequency: appSettings.clockPitch,
        volume: appSettings.clockVolume,
      });
    } catch (e) {
      useErrorStore().add(e);
    }
  }

  doMove(move: Move): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    if (!this.recordManager.appendMove({ move })) {
      return;
    }
    const appSettings = useAppSettings();
    // An exception may be thrown if the audio API is not supported.
    try {
      playPieceBeat(appSettings.pieceVolume);
    } catch (e) {
      useErrorStore().add(e);
    }
  }
  //@LoveKapibarasan
  async doQuizMove(
    move: Move,
    expectedMove: Move,
    successCounter: number,
    record: Record,
  ): Promise<number> {
    /*
    if (this.appState !== AppState.Quiz) {
      return;
    }
    */
    const appSettings = useAppSettings();
    try {
      playPieceBeat(appSettings.pieceVolume);
    } catch (e) {
      useErrorStore().add(e);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    if (expectedMove && move.equals(expectedMove)) {
      record.goForward();
      playPieceBeat(appSettings.pieceVolume);
      return ++successCounter;
    } else {
      record.removeCurrentMove();
      return successCounter;
    }
  }
  //=====

  private onFinish(): void {
    if (this.appState === AppState.ANALYSIS) {
      useMessageStore().enqueue({ text: "棋譜解析が終了しました。" });
      this._appState = AppState.NORMAL;
    }
  }

  showResearchDialog(): void {
    if (this._researchState === ResearchState.IDLE) {
      this._researchState = ResearchState.STARTUP_DIALOG;
    }
  }

  closeResearchDialog(): void {
    if (this._researchState === ResearchState.STARTUP_DIALOG) {
      this._researchState = ResearchState.IDLE;
    }
  }

  startResearch(researchSettings: ResearchSettings): void {
    if (this._researchState !== ResearchState.STARTUP_DIALOG || useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    if (!researchSettings.usi) {
      useErrorStore().add(new Error("エンジンが設定されていません。"));
      return;
    }
    api
      .saveResearchSettings(researchSettings)
      .then(() => this.researchManager.launch(researchSettings))
      .then(() => {
        this._researchState = ResearchState.RUNNING;
        this.updateResearchPosition();
        const appSettings = useAppSettings();
        if (
          appSettings.tab !== Tab.SEARCH &&
          appSettings.tab !== Tab.PV &&
          appSettings.tab !== Tab.CHART &&
          appSettings.tab !== Tab.PERCENTAGE_CHART &&
          appSettings.tab !== Tab.MONITOR
        ) {
          useAppSettings().updateAppSettings({ tab: Tab.PV });
        }
      })
      .catch((e) => {
        useErrorStore().add("検討の初期化中にエラーが出ました: " + e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  stopResearch(): void {
    if (this._researchState !== ResearchState.RUNNING) {
      return;
    }
    this.researchManager.close();
    this._researchState = ResearchState.IDLE;
  }

  isResearchEngineSessionID(sessionID: number): boolean {
    return this.researchManager.isSessionExists(sessionID);
  }

  private onUpdateSearchInfo(type: SearchInfoSenderType, info: SearchInfo): void {
    this.recordManager.updateSearchInfo(type, info);
  }

  startAnalysis(analysisSettings: AnalysisSettings): Promise<void> {
    if (this.appState !== AppState.ANALYSIS_DIALOG || useBusyState().isBusy) {
      return Promise.reject(new Error("AppState not ANALYSIS_DIALOG or busy")); // TODO: i18n
    }
    useBusyState().retain();
    const signal = this.startTask("batchAnalysis");
    return api
      .saveAnalysisSettings(analysisSettings)
      .then(() => this.analysisManager.start(analysisSettings))
      .then(() => {
        this._appState = AppState.ANALYSIS;
      })
      .catch((e) => {
        const msg = "検討の初期化中にエラーが出ました: " + e;
        useErrorStore().add(msg);
        return Promise.reject(new Error(msg));
      })
      .finally(() => {
        useBusyState().release();
      });
  }
//@LoveKapibarasan
  startTask(taskName: string) {
    const controller = new AbortController();
    this.abortControllers.set(taskName, controller);
    return controller.signal;
  }

  stopTask(taskName: string) {
    this.abortControllers.get(taskName)?.abort();
    this.abortControllers.delete(taskName);
  }
startBatchAnalysis(analysisSettings: AnalysisSettings, dir?: string): Promise<void> {
  if (this.appState !== AppState.ANALYSIS_DIALOG || useBusyState().isBusy) {
    return Promise.reject(new Error("AppState not ANALYSIS_DIALOG or busy")); // TODO: i18n
  }

  // Close AnalysisDialog
  this.closeModalDialog();

  useBusyState().retain();
  const signal = this.startTask("batchAnalysis");
  return Promise.resolve()
    .then(() => {
      // dir が渡されていなければダイアログを出す
      if (dir) {
        return dir;
      }
      return api.showSelectDirectoryDialog();
    })
    .then((selectedDir) => {
      if (!selectedDir) {
        return;
      }
      return api.listFiles(selectedDir).then((files) => {
        return files.reduce((prev, path) => {
          return prev
            // openRecord
            .then(() => {
              signal.throwIfAborted();
              useBusyState().release();
              return this.openRecord(path);
            })
            .then(() => {
              signal.throwIfAborted();
              this.showAnalysisDialog();
              return this.startAnalysis(analysisSettings);
            })
            // saveRecord
            .then(() => {
              signal.throwIfAborted();
              // dequeue message
              const msgStore = useMessageStore();
              if (msgStore.hasMessage) {
                msgStore.dequeue();
              }
              return this.saveRecord({ overwrite: true });
            })
            .then(() => {
              signal.throwIfAborted();
              useBusyState().retain();
            });
        }, Promise.resolve());
      })
      .then(() => {
        // 全部終わったあとにまとめて通知
        useMessageStore().enqueue({
          text: "連続解析が終了しました。",
          withCopyButton: false,
        }); //TODO i18n
      });
    })
    .catch((e) => {
      const msg = "一括解析中にエラーが発生しました: " + e;
      useErrorStore().add(msg);
      return Promise.reject(new Error(msg));
    })
    .finally(() => {
      useBusyState().release();
    });
}
  stopAnalysis(): void {
    if (this.appState !== AppState.ANALYSIS) {
      return;
    }
    this.stopTask("batchAnalysis");
    this.analysisManager.close();
    this._appState = AppState.NORMAL;
  }

//=====



  startMateSearch(mateSearchSettings: MateSearchSettings): void {
    if (this.appState !== AppState.MATE_SEARCH_DIALOG || useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    if (!mateSearchSettings.usi) {
      useErrorStore().add(new Error(t.engineNotSelected));
      return;
    }
    api
      .saveMateSearchSettings(mateSearchSettings)
      .then(() => this.mateSearchManager.start(mateSearchSettings, this.recordManager.record))
      .then(() => {
        this._appState = AppState.MATE_SEARCH;
        const appSettings = useAppSettings();
        if (appSettings.tab !== Tab.SEARCH && appSettings.tab !== Tab.PV) {
          useAppSettings().updateAppSettings({ tab: Tab.SEARCH });
        }
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  stopMateSearch(): void {
    if (this.appState !== AppState.MATE_SEARCH) {
      return;
    }
    this.mateSearchManager.close();
    this._appState = AppState.NORMAL;
  }

  private onCheckmate(moves: Move[]): void {
    if (this.appState !== AppState.MATE_SEARCH) {
      return;
    }
    this._appState = AppState.NORMAL;
    const position = this.recordManager.record.position;
    this.showConfirmation({
      message: t.mateInNPlyDoYouWantToDisplay(moves.length),
      onOk: () => {
        this.showPVPreviewDialog({
          position,
          mate: moves.length,
          pv: moves,
        });
      },
    });
  }

  private onNotImplemented(): void {
    if (this.appState !== AppState.MATE_SEARCH) {
      return;
    }
    useErrorStore().add(new Error(t.thisEngineNotSupportsMateSearch));
    this._appState = AppState.NORMAL;
  }

  private onNoMate(): void {
    if (this.appState !== AppState.MATE_SEARCH) {
      return;
    }
    useMessageStore().enqueue({ text: t.noMateFound });
    this._appState = AppState.NORMAL;
  }

  private onCheckmateError(e: unknown): void {
    if (this.appState !== AppState.MATE_SEARCH) {
      return;
    }
    useErrorStore().add(e);
    this._appState = AppState.NORMAL;
  }

  private updateResearchPosition(): void {
    this.researchManager?.updatePosition(this.recordManager.record);
  }

  resetRecord(mode: "keepRootPosition" | "hirateSetup" = "keepRootPosition"): void {
    if (this.appState != AppState.NORMAL) {
      return;
    }
    this.showConfirmation({
      message: t.areYouSureWantToClearRecord,
      onOk: () => {
        switch (mode) {
          case "keepRootPosition":
            this.recordManager.reset();
            break;
          case "hirateSetup":
            this.recordManager.resetByInitialPositionType(InitialPositionType.STANDARD);
            break;
        }
      },
    });
  }

  updateRecordComment(comment: string): void {
    this.recordManager.updateComment(comment);
  }

  updateRecordBookmark(bookmark: string): void {
    this.recordManager.updateBookmark(bookmark);
  }

  insertSpecialMove(specialMoveType: SpecialMoveType): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    this.recordManager.appendMove({ move: specialMoveType });
  }

  startPositionEditing(): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    this.showConfirmation({
      message: t.areYouSureWantToClearRecord,
      onOk: () => {
        this._appState = AppState.POSITION_EDITING;
        this.recordManager.resetByCurrentPosition();
      },
    });
  }

  endPositionEditing(): void {
    if (this.appState === AppState.POSITION_EDITING) {
      this._appState = AppState.NORMAL;
    }
  }

  initializePositionBySFEN(sfen: string): void {
    if (this.appState === AppState.NORMAL || this.appState === AppState.POSITION_EDITING) {
      this.showConfirmation({
        message:
          this.appState === AppState.NORMAL
            ? t.areYouSureWantToClearRecord
            : t.areYouSureWantToDiscardPosition,
        onOk: () => {
          this.recordManager.resetBySFEN(sfen);
        },
      });
    }
  }

  changeTurn(): void {
    if (this.appState == AppState.POSITION_EDITING) {
      this.recordManager.swapNextTurn();
    }
  }

  showPieceSetChangeDialog() {
    if (this.appState === AppState.POSITION_EDITING) {
      this._appState = AppState.PIECE_SET_CHANGE_DIALOG;
    }
  }

  closePieceSetChangeDialog(pieceSet?: PieceSet) {
    if (this.appState !== AppState.PIECE_SET_CHANGE_DIALOG) {
      return;
    }
    if (pieceSet) {
      this.recordManager.changePieceSet(pieceSet);
    }
    this._appState = AppState.POSITION_EDITING;
  }

  editPosition(change: PositionChange): void {
    if (this.appState === AppState.POSITION_EDITING) {
      this.recordManager.changePosition(change);
    }
  }

  goForward(): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.goForward();
    }
  }

  goBack(): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.goBack();
    }
  }

  changePly(ply: number): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.changePly(ply);
    }
  }

  changeBranch(index: number): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.changeBranch(index);
    }
  }

  changeNode(node: ImmutableNode): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.changeNode(node);
    }
  }

  swapWithNextBranch(): boolean {
    return this.recordManager.swapWithNextBranch();
  }

  swapWithPreviousBranch(): boolean {
    return this.recordManager.swapWithPreviousBranch();
  }

  backToMainBranch(): void {
    if (this.appState === AppState.NORMAL) {
      this.recordManager.resetAllBranchSelection();
    }
  }

  removeCurrentMove(): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    if (this.recordManager.record.current.isLastMove) {
      this.recordManager.removeCurrentMove();
      return;
    }
    this.showConfirmation({
      message: t.areYouSureWantToDeleteFollowingMove(this.recordManager.record.current.ply),
      onOk: () => {
        this.recordManager.removeCurrentMove();
      },
    });
  }

  jumpToBookmark(bookmark: string): boolean {
    if (this.appState === AppState.NORMAL) {
      return this.recordManager.jumpToBookmark(bookmark);
    }
    return false;
  }

  copyRecordKIF(options?: { fromCurrentPosition?: boolean }): void {
    const appSettings = useAppSettings();
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportKIF(record, {
      returnCode: appSettings.returnCode,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordKI2(options?: { fromCurrentPosition?: boolean }): void {
    const appSettings = useAppSettings();
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportKI2(record, {
      returnCode: appSettings.returnCode,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordCSA(options?: { fromCurrentPosition?: boolean }): void {
    const appSettings = useAppSettings();
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportCSA(record, {
      returnCode: appSettings.returnCode,
      v3: appSettings.useCSAV3 ? { milliseconds: true } : undefined,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordUSI(target: "all" | "before" | "after"): void {
    const appSettings = useAppSettings();
    const record =
      target === "after" ? this.recordManager.record.getSubtree() : this.recordManager.record;
    const str = record.getUSI({
      startpos: appSettings.enableUSIFileStartpos,
      resign: appSettings.enableUSIFileResign,
      allMoves: target !== "before",
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordJKF(options?: { fromCurrentPosition?: boolean }): void {
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const str = exportJKFString(record);
    navigator.clipboard.writeText(str);
  }

  copyRecordUSEN(options?: { fromCurrentPosition?: boolean }): void {
    const record = options?.fromCurrentPosition
      ? this.recordManager.record.getSubtree()
      : this.recordManager.record;
    const [usen] = record.usen;
    navigator.clipboard.writeText(usen);
  }

  copyBoardSFEN(): void {
    const str = this.recordManager.record.sfen;
    navigator.clipboard.writeText(str);
  }

  copyBoardBOD(): void {
    const str = exportBOD(this.recordManager.record);
    navigator.clipboard.writeText(str);
  }

  pasteRecord(
    data: string,
    mode: "standard" | "mergeIntoRoot" | "mergeIntoCurrent" = "standard",
  ): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    const error = this.recordManager.importRecord(data.trim(), { mode });
    if (error) {
      useErrorStore().add(error);
      return;
    }
  }

  openRecord(path?: string, opt?: { ply?: number }): Promise<void> {
    if (this.appState !== AppState.NORMAL || useBusyState().isBusy) {
      useErrorStore().add(t.pleaseEndActiveFeaturesBeforeOpenRecord);
      return Promise.reject(new Error("AppState not NORMAL or busy")); //TODO i18n
    }
    useBusyState().retain();
    return Promise.resolve()
      .then(() => {
        return path || api.showOpenRecordDialog(getStandardRecordFileFormats());
      })
      .then((path) => {
        if (!path) {
          return;
        }
        const appSettings = useAppSettings();
        const autoDetect = appSettings.textDecodingRule == TextDecodingRule.AUTO_DETECT;
        return api.openRecord(path).then((data) => {
        const e = this.recordManager.importRecordFromBuffer(data, path, {
          autoDetect,
        });
        if (e) {
          return Promise.reject(e);
        }
       return Promise.resolve();
      });
      })
      .then(() => {
        if (opt?.ply) {
          this.recordManager.changePly(opt.ply);
        }
      })
      .catch((e) => {
          const msg = "棋譜の読み込み中にエラーが出ました: " + e;
          useErrorStore().add(msg);
          return Promise.reject(msg);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  saveRecord(options?: { overwrite?: boolean; format?: RecordFileFormat }): Promise<void> {
    if (this.appState !== AppState.NORMAL || useBusyState().isBusy) {
      return Promise.reject(new Error("AppState not NORMAL or busy")); // TODO: i18n
    }
    useBusyState().retain();
    return Promise.resolve()
      .then(() => {
        const path = this.recordManager.recordFilePath;
        if (options?.overwrite && path) {
          return path;
        }
        const appSettings = useAppSettings();
        const defaultPath =
          (!options?.format && path) ||
          generateRecordFileName(this.recordManager.record, {
            template: appSettings.recordFileNameTemplate,
            extension: options?.format || appSettings.defaultRecordFileFormat,
          });
        return api.showSaveRecordDialog(defaultPath);
      })
      .then((path) => {
        if (!path) {
          return;
        }
        return this.saveRecordByPath(path, { detectGarbled: true }).then(() => {
          const fileFormat = detectRecordFileFormatByPath(path) as RecordFileFormat;
          const props = detectUnsupportedRecordProperties(this.recordManager.record, fileFormat);
          const items = Object.entries(props)
            .filter(([, v]) => v)
            .map(([k]) => {
              switch (k) {
                case "branch":
                  return t.branches;
                case "comment":
                  return t.comments;
                case "bookmark":
                  return t.bookmark;
                case "time":
                  return t.elapsedTime;
              }
            })
            .map((v) => ({ text: v })) as ListItem[];
          if (items.length) {
            useMessageStore().enqueue({
              text: t.followingDataNotSavedBecauseNotSupporetedBy(fileFormat),
              attachments: [{ type: "list", items }],
            });
          }
        });
      })
      .catch((e) => {
        useErrorStore().add(e);
        return Promise.reject(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  private async saveRecordByPath(path: string, opt?: { detectGarbled: boolean }): Promise<void> {
    const appSettings = useAppSettings();
    const result = this.recordManager.exportRecordAsBuffer(path, {
      returnCode: appSettings.returnCode,
      detectGarbled: opt?.detectGarbled,
      csa: { v3: appSettings.useCSAV3 },
    });
    if (result instanceof Error) {
      throw result;
    }
    try {
      await api.saveRecord(path, result.data);
      if (result.garbled && !this.garbledNotified) {
        useMessageStore().enqueue({
          text: `${t.recordSavedWithGarbledCharacters}\n${t.pleaseConsiderToUseKIFU}\n${t.youCanChangeDefaultRecordFileFormatFromAppSettings}`,
        });
        this.garbledNotified = true;
      }
    } catch (e) {
      throw new Error(`${t.failedToSaveRecord}: ${e}`);
    }
  }

  restoreFromBackupV1(name: string): void {
    if (this.appState !== AppState.RECORD_FILE_HISTORY_DIALOG || useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    api
      .loadRecordFileBackup(name)
      .then((data) => {
        const err = this.recordManager.importRecord(data, {
          type: RecordFormatType.KIF,
          markAsSaved: true,
        });
        if (err) {
          return Promise.reject(err);
        }
        this._appState = AppState.NORMAL;
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  restoreFromBackupV2(kif: string): void {
    if (this.appState !== AppState.RECORD_FILE_HISTORY_DIALOG || useBusyState().isBusy) {
      return;
    }
    const err = this.recordManager.importRecord(kif, {
      type: RecordFormatType.KIF,
      markAsSaved: true,
    });
    if (err) {
      useErrorStore().add(err);
      return;
    }
    this._appState = AppState.NORMAL;
  }

  get remoteRecordFileURL() {
    return this.recordManager.sourceURL;
  }

  loadRemoteRecordFile(url?: string) {
    useBusyState().retain();
    this.recordManager
      .importRecordFromRemoteURL(url)
      .catch((e) => useErrorStore().add(e))
      .finally(() => useBusyState().release());
  }

  showJishogiPoints(): void {
    const position = this.recordManager.record.position;
    const blackTotalPoint = countJishogiPoint(position, Color.BLACK);
    const blackPoint = countJishogiDeclarationPoint(position, Color.BLACK);
    const black24 = judgeJishogiDeclaration(
      JishogiDeclarationRule.GENERAL24,
      position,
      Color.BLACK,
    );
    const black27 = judgeJishogiDeclaration(
      JishogiDeclarationRule.GENERAL27,
      position,
      Color.BLACK,
    );
    const whiteTotalPoint = countJishogiPoint(position, Color.WHITE);
    const whitePoint = countJishogiDeclarationPoint(position, Color.WHITE);
    const white24 = judgeJishogiDeclaration(
      JishogiDeclarationRule.GENERAL24,
      position,
      Color.WHITE,
    );
    const white27 = judgeJishogiDeclaration(
      JishogiDeclarationRule.GENERAL27,
      position,
      Color.WHITE,
    );
    useMessageStore().enqueue({
      text: t.jishogiPoints,
      attachments: [
        {
          type: "list",
          items: [
            {
              text: t.sente,
              children: [
                `Points (Total): ${blackTotalPoint}`,
                `Points (Declaration): ${blackPoint}`,
                `Rule-24: ${black24.toUpperCase()}`,
                `Rule-27: ${black27.toUpperCase()}`,
              ],
            },
            {
              text: t.gote,
              children: [
                `Points (Total): ${whiteTotalPoint}`,
                `Points (Declaration): ${whitePoint}`,
                `Rule-24: ${white24.toUpperCase()}`,
                `Rule-27: ${white27.toUpperCase()}`,
              ],
            },
          ],
        },
      ],
      withCopyButton: true,
    });
  }

  get isMovableByUser() {
    switch (this.appState) {
      case AppState.NORMAL:
        return true;
      case AppState.GAME:
        return (
          (this.recordManager.record.position.color === Color.BLACK
            ? this.gameManager.settings.black.uri
            : this.gameManager.settings.white.uri) === uri.ES_HUMAN
        );
      case AppState.CSA_GAME:
        return (
          this.csaGameManager.isMyTurn && this.csaGameManager.settings.player.uri === uri.ES_HUMAN
        );
    }
    return false;
  }

  async onMainWindowClose(): Promise<void> {
    useBusyState().retain();
    try {
      await this.recordManager.saveBackup();
    } finally {
      useBusyState().release();
    }
  }

  private showConfirmation(confirmation: Confirmation): void {
    const lastAppState = this.appState;
    useConfirmationStore().show({
      ...confirmation,
      onOk: () => {
        if (this.appState !== lastAppState) {
          useErrorStore().add("確認ダイアログ表示中に他の操作が行われたため処理が中止されました。"); // TODO: i18n
          return;
        }
        confirmation.onOk();
      },
    });
  }
}

export function createStore(): UnwrapNestedRefs<Store> {
  return new Store().reactive;
}

let store: UnwrapNestedRefs<Store>;

export function useStore(): UnwrapNestedRefs<Store> {
  if (!store) {
    store = createStore();
  }
  return store;
}
