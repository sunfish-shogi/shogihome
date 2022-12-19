import api from "@/ipc/api";
import {
  Color,
  exportCSA,
  ImmutableRecord,
  InitialPositionType,
  Move,
  PositionChange,
  Record,
  SpecialMove,
  specialMoveToDisplayString,
  exportKakinoki,
  RecordMetadataKey,
} from "@/shogi";
import { reactive, UnwrapNestedRefs } from "vue";
import { GameSetting } from "@/settings/game";
import {
  AppSetting,
  AppSettingUpdate,
  ClockSoundTarget,
  defaultAppSetting,
  validateAppSetting,
} from "@/settings/app";
import {
  AudioEventHandler,
  beepShort,
  beepUnlimited,
  playPieceBeat,
} from "@/audio";
import { RecordManager, SearchEngineType } from "./record";
import { GameManager, GameResults } from "./game";
import { defaultRecordFileName } from "@/helpers/path";
import { ResearchSetting } from "@/settings/research";
import { BussyStore } from "./bussy";
import { USIPlayerMonitor, USIMonitor } from "./usi";
import { AppState } from "./state";
import { Message, MessageStore } from "./message";
import { ErrorStore } from "./error";
import * as uri from "@/uri";
import { Confirmation } from "./confirm";
import { AnalysisManager } from "./analysis";
import { AnalysisSetting } from "@/settings/analysis";
import { USIPlayer } from "@/players/usi";
import { LogLevel } from "@/ipc/log";
import { formatPercentage, toString } from "@/helpers/string";
import { CSAGameManager, CSAGameState } from "./csa";
import { Clock } from "./clock";
import { CSAGameSetting, appendCSAGameSettingHistory } from "@/settings/csa";
import { defaultPlayerBuilder } from "@/players/builder";
import { USIInfoCommand, USIInfoSender } from "@/ipc/usi";

export class Store {
  private _bussy = new BussyStore();
  private _message = new MessageStore();
  private _error = new ErrorStore();
  private recordManager = new RecordManager();
  private _appSetting = defaultAppSetting();
  private _appState = AppState.NORMAL;
  private lastAppState?: AppState;
  private _isAppSettingDialogVisible = false;
  private _confirmation?: Confirmation;
  private usiMonitor = new USIMonitor();
  private blackClock = new Clock();
  private whiteClock = new Clock();
  private gameManager = new GameManager(
    this.recordManager,
    this.blackClock,
    this.whiteClock,
    this
  );
  private csaGameManager = new CSAGameManager(
    this.recordManager,
    this.blackClock,
    this.whiteClock,
    this
  );
  private researcher?: USIPlayer;
  private analysisManager?: AnalysisManager;
  private unlimitedBeepHandler?: AudioEventHandler;

  constructor() {
    this.recordManager.on("changePosition", () => {
      this.onUpdatePosition();
    });
  }

  get isBussy(): boolean {
    return this._bussy.isBussy;
  }

  retainBussyState(): void {
    return this._bussy.retain();
  }

  releaseBussyState(): void {
    return this._bussy.release();
  }

  get message(): Message {
    return this._message.message;
  }

  get hasMessage(): boolean {
    return this._message.hasMessage;
  }

  enqueueMessage(message: Message): void {
    this._message.enqueue(message);
  }

  dequeueMessage(): void {
    this._message.dequeue();
  }

  get errors(): Error[] {
    return this._error.errors;
  }

  get hasError(): boolean {
    return this._error.hasError;
  }

  pushError(e: unknown): void {
    api.log(LogLevel.ERROR, toString(e));
    this._error.push(e);
  }

  clearErrors(): void {
    this._error.clear();
  }

  get record(): ImmutableRecord {
    return this.recordManager.record;
  }

  get recordFilePath(): string | undefined {
    return this.recordManager.recordFilePath;
  }

  updateStandardRecordMetadata(update: {
    key: RecordMetadataKey;
    value: string;
  }): void {
    this.recordManager.updateStandardMetadata(update);
  }

  get appSetting(): AppSetting {
    return this._appSetting;
  }

  async updateAppSetting(update: AppSettingUpdate): Promise<void> {
    const newAppSetting = {
      ...this.appSetting,
      ...update,
    };
    const error = validateAppSetting(newAppSetting);
    if (error) {
      throw error;
    }
    await api.saveAppSetting(newAppSetting);
    this._appSetting = newAppSetting;
  }

  flipBoard(): void {
    this._appSetting.boardFlipping = !this.appSetting.boardFlipping;
    api.saveAppSetting(this.appSetting);
  }

  get appState(): AppState {
    return this._appState;
  }

  get confirmation(): string | undefined {
    return this._confirmation?.message;
  }

  showConfirmation(confirmation: Confirmation): void {
    if (this.appState == AppState.TEMPORARY) {
      api.log(
        LogLevel.ERROR,
        "Store#showConfirmation: 確認ダイアログを多重に表示しようとしました。" +
          ` lastAppState=${this.lastAppState}` +
          (this._confirmation
            ? ` currentMessage=${this._confirmation.message}`
            : "") +
          ` newMessage=${confirmation.message}`
      );
      if (confirmation.onCancel) {
        confirmation.onCancel();
      }
      return;
    }
    this._confirmation = confirmation;
    this.lastAppState = this.appState;
    this._appState = AppState.TEMPORARY;
  }

  confirmationOk(): void {
    const onOk = this._confirmation?.onOk;
    this._confirmation = undefined;
    if (this.lastAppState) {
      this._appState = this.lastAppState;
      this.lastAppState = undefined;
    }
    if (onOk) {
      onOk();
    }
  }

  confirmationCancel(): void {
    const onCancel = this._confirmation?.onCancel;
    this._confirmation = undefined;
    if (this.lastAppState) {
      this._appState = this.lastAppState;
      this.lastAppState = undefined;
    }
    if (onCancel) {
      onCancel();
    }
  }

  showPasteDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.PASTE_DIALOG;
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

  showResearchDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.RESEARCH_DIALOG;
    }
  }

  showAnalysisDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.ANALYSIS_DIALOG;
    }
  }

  showUsiEngineManagementDialog(): void {
    if (this.appState === AppState.NORMAL) {
      this._appState = AppState.USI_ENGINE_SETTING_DIALOG;
    }
  }

  closeModalDialog(): void {
    if (
      (this.appState === AppState.PASTE_DIALOG ||
        this.appState === AppState.GAME_DIALOG ||
        this.appState === AppState.CSA_GAME_DIALOG ||
        this.appState === AppState.RESEARCH_DIALOG ||
        this.appState === AppState.ANALYSIS_DIALOG ||
        this.appState === AppState.USI_ENGINE_SETTING_DIALOG) &&
      !this.isBussy
    ) {
      this._appState = AppState.NORMAL;
    }
  }

  get isAppSettingDialogVisible(): boolean {
    return this._isAppSettingDialogVisible;
  }

  showAppSettingDialog(): void {
    this._isAppSettingDialogVisible = true;
  }

  closeAppSettingDialog(): void {
    this._isAppSettingDialogVisible = false;
  }

  get usiBlackPlayerMonitor(): USIPlayerMonitor | undefined {
    return this.usiMonitor.blackPlayer;
  }

  get usiWhitePlayerMonitor(): USIPlayerMonitor | undefined {
    return this.usiMonitor.whitePlayer;
  }

  get usiResearcherMonitor(): USIPlayerMonitor | undefined {
    return this.usiMonitor.researcher;
  }

  updateUSIInfo(
    sessionID: number,
    usi: string,
    sender: USIInfoSender,
    name: string,
    info: USIInfoCommand
  ): void {
    if (this.recordManager.record.usi !== usi) {
      return;
    }
    this.usiMonitor.update(
      sessionID,
      this.recordManager.record.position,
      sender,
      name,
      info
    );
  }

  updateUSIPonderInfo(
    sessionID: number,
    usi: string,
    sender: USIInfoSender,
    name: string,
    info: USIInfoCommand
  ): void {
    const record = Record.newByUSI(usi);
    if (record instanceof Error) {
      api.log(LogLevel.ERROR, `invalid USI: ${usi} (updateUSIPonderInfo)`);
      return;
    }
    const ponderMove = record.current.move;
    if (!(ponderMove instanceof Move)) {
      return;
    }
    this.usiMonitor.update(
      sessionID,
      record.position,
      sender,
      name,
      info,
      ponderMove
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

  startGame(setting: GameSetting): void {
    if (this.appState !== AppState.GAME_DIALOG || this.isBussy) {
      return;
    }
    this.retainBussyState();
    api
      .saveGameSetting(setting)
      .then(() => {
        this.initializeDisplaySettingForGame(setting);
        const builder = defaultPlayerBuilder(
          this.appSetting.engineTimeoutSeconds
        );
        return this.gameManager.startGame(setting, builder);
      })
      .then(() => (this._appState = AppState.GAME))
      .catch((e) => {
        this.pushError("対局の初期化中にエラーが出ました: " + e);
      })
      .finally(() => {
        this.releaseBussyState();
      });
  }

  get csaGameState(): CSAGameState {
    return this.csaGameManager.state;
  }

  loginCSAGame(setting: CSAGameSetting, opt: { saveHistory: boolean }): void {
    if (this.appState !== AppState.CSA_GAME_DIALOG || this.isBussy) {
      return;
    }
    this.retainBussyState();
    Promise.resolve()
      .then(async () => {
        if (opt.saveHistory) {
          const latestHistory = await api.loadCSAGameSettingHistory();
          const history = appendCSAGameSettingHistory(latestHistory, setting);
          await api.saveCSAGameSettingHistory(history);
        }
      })
      .then(() => {
        const builder = defaultPlayerBuilder(
          this.appSetting.engineTimeoutSeconds
        );
        return this.csaGameManager.login(setting, builder);
      })
      .then(() => (this._appState = AppState.CSA_GAME))
      .catch((e) => {
        this.pushError("対局の初期化中にエラーが出ました: " + e);
      })
      .finally(() => {
        this.releaseBussyState();
      });
  }

  logoutCSAGame(): void {
    if (this.appState !== AppState.CSA_GAME) {
      return;
    }
    if (this.csaGameManager.state === CSAGameState.GAME) {
      this.pushError("ログアウトするには対局を終了してください。");
      return;
    }
    this.csaGameManager.logout();
    this._appState = AppState.NORMAL;
  }

  private initializeDisplaySettingForGame(setting: GameSetting): void {
    if (setting.humanIsFront) {
      let flip = this.appSetting.boardFlipping;
      if (
        setting.black.uri === uri.ES_HUMAN &&
        setting.white.uri !== uri.ES_HUMAN
      ) {
        flip = false;
      } else if (
        setting.black.uri !== uri.ES_HUMAN &&
        setting.white.uri === uri.ES_HUMAN
      ) {
        flip = true;
      }
      if (flip !== this.appSetting.boardFlipping) {
        this.flipBoard();
      }
    }
  }

  stopGame(): void {
    if (this.appState === AppState.GAME) {
      this.gameManager.endGame(SpecialMove.INTERRUPT);
    } else if (this.appState === AppState.CSA_GAME) {
      this.showConfirmation({
        message: "中断を要求すると負けになる可能性があります。よろしいですか？",
        onOk: () => {
          this.csaGameManager.stop();
        },
      });
    }
  }

  onGameNext(): void {
    this.usiMonitor.clear();
  }

  onGameEnd(gameResults?: GameResults, specialMove?: SpecialMove): void {
    if (
      this.appState !== AppState.GAME &&
      this.appState !== AppState.CSA_GAME
    ) {
      return;
    }
    if (gameResults && gameResults.total >= 2) {
      const validTotal = gameResults.total - gameResults.invalid;
      this.enqueueMessage({
        text: "連続対局終了",
        attachments: [
          {
            type: "list",
            items: [
              {
                text: gameResults.player1.name,
                children: [
                  `勝ち数: ${gameResults.player1.win}`,
                  `勝率: ${formatPercentage(
                    gameResults.player1.win,
                    validTotal,
                    1
                  )}`,
                ],
              },
              {
                text: gameResults.player2.name,
                children: [
                  `勝ち数: ${gameResults.player2.win}`,
                  `勝率: ${formatPercentage(
                    gameResults.player2.win,
                    validTotal,
                    1
                  )}`,
                ],
              },
              { text: `引き分け: ${gameResults.draw}` },
              { text: `有効対局数: ${validTotal}` },
              { text: `無効対局数: ${gameResults.invalid}` },
            ],
          },
        ],
      });
    } else if (specialMove) {
      this.enqueueMessage({
        text: `対局終了（${specialMoveToDisplayString(specialMove)})`,
      });
    }
    this._appState = AppState.NORMAL;
  }

  onFlipBoard(flip: boolean): void {
    if (this._appSetting.boardFlipping !== flip) {
      this.flipBoard();
    }
  }

  onSaveRecord(): Promise<void> {
    const fname = defaultRecordFileName(this.recordManager.record.metadata);
    const path = `${this.appSetting.autoSaveDirectory}/${fname}`;
    return this.saveRecordByPath(path);
  }

  onPieceBeat(): void {
    playPieceBeat(this.appSetting.pieceVolume);
  }

  onBeepShort(): void {
    if (
      this.appSetting.clockSoundTarget === ClockSoundTarget.ONLY_USER &&
      !this.isMovableByUser
    ) {
      return;
    }
    if (this.unlimitedBeepHandler) {
      return;
    }
    beepShort({
      frequency: this.appSetting.clockPitch,
      volume: this.appSetting.clockVolume,
    });
  }

  onBeepUnlimited(): void {
    if (
      this.appSetting.clockSoundTarget === ClockSoundTarget.ONLY_USER &&
      !this.isMovableByUser
    ) {
      return;
    }
    if (this.unlimitedBeepHandler) {
      return;
    }
    this.unlimitedBeepHandler = beepUnlimited({
      frequency: this.appSetting.clockPitch,
      volume: this.appSetting.clockVolume,
    });
  }

  onStopBeep(): void {
    if (this.unlimitedBeepHandler) {
      this.unlimitedBeepHandler.stop();
      this.unlimitedBeepHandler = undefined;
    }
  }

  doMove(move: Move): void {
    if (
      this.appState !== AppState.NORMAL &&
      this.appState !== AppState.RESEARCH
    ) {
      return;
    }
    if (!this.recordManager.appendMove({ move })) {
      return;
    }
    playPieceBeat(this.appSetting.pieceVolume);
  }

  onFinish(): void {
    if (this.appState === AppState.ANALYSIS) {
      this._message.enqueue({ text: "棋譜解析が終了しました。" });
      this._appState = AppState.NORMAL;
    }
  }

  onError(e: unknown): void {
    this.pushError(e);
  }

  startResearch(researchSetting: ResearchSetting): void {
    if (this.appState !== AppState.RESEARCH_DIALOG || this.isBussy) {
      return;
    }
    this.retainBussyState();
    if (!researchSetting.usi) {
      this.pushError(new Error("エンジンが設定されていません。"));
      return;
    }
    const usiSetting = researchSetting.usi;
    api
      .saveResearchSetting(researchSetting)
      .then(() => {
        this.researcher = new USIPlayer(
          usiSetting,
          this.appSetting.engineTimeoutSeconds,
          (info) => {
            this.recordManager.updateSearchInfo(
              SearchEngineType.RESEARCHER,
              info
            );
          }
        );
        return this.researcher.launch();
      })
      .then(() => {
        this._appState = AppState.RESEARCH;
        this.onUpdatePosition();
      })
      .catch((e) => {
        this.researcher = undefined;
        this.pushError("検討の初期化中にエラーが出ました: " + e);
      })
      .finally(() => {
        this.releaseBussyState();
      });
  }

  stopResearch(): void {
    if (this.appState !== AppState.RESEARCH) {
      return;
    }
    if (this.researcher) {
      this.researcher.close();
      this.researcher = undefined;
    }
    this._appState = AppState.NORMAL;
  }

  startAnalysis(analysisSetting: AnalysisSetting): void {
    if (this.appState !== AppState.ANALYSIS_DIALOG || this.isBussy) {
      return;
    }
    this.retainBussyState();
    api
      .saveAnalysisSetting(analysisSetting)
      .then(() => {
        this.analysisManager = new AnalysisManager(
          this.recordManager,
          analysisSetting,
          this.appSetting,
          this
        );
        return this.analysisManager.start();
      })
      .then(() => {
        this._appState = AppState.ANALYSIS;
      })
      .catch((e) => {
        this.analysisManager = undefined;
        this.pushError("検討の初期化中にエラーが出ました: " + e);
      })
      .finally(() => {
        this.releaseBussyState();
      });
  }

  stopAnalysis(): void {
    if (this.appState !== AppState.ANALYSIS) {
      return;
    }
    if (this.analysisManager) {
      this.analysisManager.close();
      this.analysisManager = undefined;
    }
    this._appState = AppState.NORMAL;
  }

  onUpdatePosition(): void {
    if (this.researcher) {
      this.researcher.startResearch(this.recordManager.record);
    }
  }

  resetRecord(): void {
    if (this.appState != AppState.NORMAL) {
      return;
    }
    this.showConfirmation({
      message: "現在の棋譜は削除されます。よろしいですか？",
      onOk: () => {
        this.recordManager.reset();
      },
    });
  }

  updateRecordComment(comment: string): void {
    this.recordManager.updateComment(comment);
  }

  insertSpecialMove(specialMove: SpecialMove): void {
    if (
      this.appState !== AppState.NORMAL &&
      this.appState !== AppState.RESEARCH
    ) {
      return;
    }
    this.recordManager.appendMove({ move: specialMove });
  }

  startPositionEditing(): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    this.showConfirmation({
      message: "現在の棋譜は削除されます。よろしいですか？",
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

  initializePosition(initialPositionType: InitialPositionType): void {
    if (this.appState != AppState.POSITION_EDITING) {
      return;
    }
    this.showConfirmation({
      message: "現在の局面は破棄されます。よろしいですか？",
      onOk: () => {
        this.recordManager.reset(initialPositionType);
      },
    });
  }

  changeTurn(): void {
    if (this.appState == AppState.POSITION_EDITING) {
      this.recordManager.swapNextTurn();
    }
  }

  editPosition(change: PositionChange): void {
    if (this.appState === AppState.POSITION_EDITING) {
      this.recordManager.changePosition(change);
    }
  }

  changeMoveNumber(number: number): void {
    if (
      this.appState === AppState.NORMAL ||
      this.appState === AppState.RESEARCH
    ) {
      this.recordManager.changeMoveNumber(number);
    }
  }

  changeBranch(index: number): void {
    if (
      this.appState === AppState.NORMAL ||
      this.appState === AppState.RESEARCH
    ) {
      this.recordManager.changeBranch(index);
    }
  }

  removeCurrentMove(): void {
    if (
      this.appState !== AppState.NORMAL &&
      this.appState !== AppState.RESEARCH
    ) {
      return;
    }
    if (this.recordManager.record.current.isLastMove) {
      this.recordManager.removeCurrentMove();
      return;
    }
    this.showConfirmation({
      message: `${this.recordManager.record.current.number}手目以降を削除します。よろしいですか？`,
      onOk: () => {
        this.recordManager.removeCurrentMove();
      },
    });
  }

  copyRecordKIF(): void {
    const str = exportKakinoki(this.recordManager.record, {
      returnCode: this.appSetting.returnCode,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordCSA(): void {
    const str = exportCSA(this.recordManager.record, {
      returnCode: this.appSetting.returnCode,
    });
    navigator.clipboard.writeText(str);
  }

  copyRecordUSIBefore(): void {
    const str = this.recordManager.record.usi;
    navigator.clipboard.writeText(str);
  }

  copyRecordUSIAll(): void {
    const str = this.recordManager.record.usiAll;
    navigator.clipboard.writeText(str);
  }

  copyBoardSFEN(): void {
    const str = this.recordManager.record.sfen;
    navigator.clipboard.writeText(str);
  }

  pasteRecord(data: string): void {
    if (this.appState !== AppState.NORMAL) {
      return;
    }
    const error = this.recordManager.importRecord(data);
    if (error) {
      this.pushError(error);
      return;
    }
  }

  openRecord(path?: string): void {
    if (this.appState !== AppState.NORMAL || this.isBussy) {
      return;
    }
    this.retainBussyState();
    Promise.resolve()
      .then(() => {
        return path || api.showOpenRecordDialog();
      })
      .then((path) => {
        if (!path) {
          return;
        }
        return api.openRecord(path as string).then((data) => {
          const e = this.recordManager.importRecordFromBuffer(
            data as Buffer,
            path as string
          );
          return e && Promise.reject(e);
        });
      })
      .catch((e) => {
        this.pushError("棋譜の読み込み中にエラーが出ました: " + e);
      })
      .finally(() => {
        this.releaseBussyState();
      });
  }

  saveRecord(options?: { overwrite: boolean }): void {
    if (this.appState !== AppState.NORMAL || this.isBussy) {
      return;
    }
    this.retainBussyState();
    Promise.resolve()
      .then(() => {
        const path = this.recordManager.recordFilePath;
        if (options?.overwrite && path) {
          return path;
        }
        const defaultPath = defaultRecordFileName(
          this.recordManager.record.metadata
        );
        return api.showSaveRecordDialog(defaultPath);
      })
      .then((path) => {
        if (!path) {
          return;
        }
        return this.saveRecordByPath(path);
      })
      .catch((e) => {
        this.pushError(e);
      })
      .finally(() => {
        this.releaseBussyState();
      });
  }

  private async saveRecordByPath(path: string): Promise<void> {
    const dataOrError = this.recordManager.exportRecordAsBuffer(path, {
      returnCode: this.appSetting.returnCode,
    });
    if (dataOrError instanceof Error) {
      throw dataOrError;
    }
    this.retainBussyState();
    try {
      await api.saveRecord(path, dataOrError);
    } catch (e) {
      throw new Error(`棋譜の保存に失敗しました: ${e}`);
    } finally {
      this.releaseBussyState();
    }
  }

  get isMovableByUser() {
    switch (this.appState) {
      case AppState.NORMAL:
      case AppState.RESEARCH:
        return true;
      case AppState.GAME:
        return (
          (this.recordManager.record.position.color === Color.BLACK
            ? this.gameManager.setting.black.uri
            : this.gameManager.setting.white.uri) === uri.ES_HUMAN
        );
      case AppState.CSA_GAME:
        return (
          this.csaGameManager.isMyTurn &&
          this.csaGameManager.setting.player.uri === uri.ES_HUMAN
        );
    }
    return false;
  }
}

const store = reactive<Store>(new Store());

export function useStore(): UnwrapNestedRefs<Store> {
  return store;
}
