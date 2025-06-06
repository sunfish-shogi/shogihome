import api from "@/renderer/ipc/api.js";
import {
  CSAGameResult,
  CSAGameSummary,
  CSAPlayerStates,
  CSASpecialMove,
  emptyCSAGameSummary,
} from "@/common/game/csa.js";
import { defaultPlayerBuilder, PlayerBuilder } from "@/renderer/players/builder.js";
import { Player, SearchInfo } from "@/renderer/players/player.js";
import {
  CSAGameSettings,
  CSAProtocolVersion,
  defaultCSAGameSettings,
} from "@/common/settings/csa.js";
import {
  Color,
  RecordFormatType,
  parseCSAMove,
  formatCSAMove,
  Move,
  SpecialMoveType,
} from "tsshogi";
import { Clock } from "./clock.js";
import { CommentBehavior } from "@/common/settings/comment.js";
import { RecordManager, SearchInfoSenderType } from "./record.js";
import { t } from "@/common/i18n/index.js";
import { GameResult } from "@/common/game/result.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { TimeStates } from "@/common/game/time.js";
import { useAppSettings } from "./settings.js";

export const loginRetryIntervalSeconds = 10;

export enum CSAGameState {
  OFFLINE,
  PLAYER_SETUP,
  WAITING_LOGIN,
  LOGIN_FAILED,
  LOGIN_RETRY_INTERVAL,
  READY,
  GAME,
}

type SaveRecordCallback = () => void;
type GameNextCallback = () => void;
type NewGameCallback = (n: number) => void;
type GameEndCallback = () => void;
type LoginRetryCallback = () => void;
type FlipBoardCallback = (flip: boolean) => void;
type PieceBeatCallback = () => void;
type BeepShortCallback = () => void;
type BeepUnlimitedCallback = () => void;
type StopBeepCallback = () => void;
type ErrorCallback = (e: unknown) => void;

enum ReloginBehavior {
  DO_NOT_RELOGIN,
  RELOGIN_WITH_INTERVAL,
  RELOGIN_IMMEDIATELY,
}

export class CSAGameManager {
  private _state = CSAGameState.OFFLINE;
  private _settings = defaultCSAGameSettings();
  private _sessionID = 0;
  private stopRequested = false;
  private repeat = 0;
  private player?: Player;
  private gameSummary = emptyCSAGameSummary();
  private searchInfo?: SearchInfo;
  private playerBuilder = defaultPlayerBuilder();
  private retryTimer?: NodeJS.Timeout;
  private onSaveRecord: SaveRecordCallback = () => {};
  private onGameNext: GameNextCallback = () => {};
  private onNewGame: NewGameCallback = () => {};
  private onGameEnd: GameEndCallback = () => {};
  private onLoginRetry: LoginRetryCallback = () => {};
  private onFlipBoard: FlipBoardCallback = () => {};
  private onPieceBeat: PieceBeatCallback = () => {};
  private onBeepShort: BeepShortCallback = () => {};
  private onBeepUnlimited: BeepUnlimitedCallback = () => {};
  private onStopBeep: StopBeepCallback = () => {};
  private onError: ErrorCallback = () => {};

  constructor(
    private recordManager: RecordManager,
    private blackClock: Clock,
    private whiteClock: Clock,
  ) {}

  on(event: "saveRecord", handler: SaveRecordCallback): this;
  on(event: "gameNext", handler: GameNextCallback): this;
  on(event: "newGame", handler: NewGameCallback): this;
  on(event: "gameEnd", handler: GameEndCallback): this;
  on(event: "loginRetry", handler: LoginRetryCallback): this;
  on(event: "flipBoard", handler: FlipBoardCallback): this;
  on(event: "pieceBeat", handler: PieceBeatCallback): this;
  on(event: "beepShort", handler: BeepShortCallback): this;
  on(event: "beepUnlimited", handler: BeepUnlimitedCallback): this;
  on(event: "stopBeep", handler: StopBeepCallback): this;
  on(event: "error", handler: ErrorCallback): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "saveRecord":
        this.onSaveRecord = handler as SaveRecordCallback;
        break;
      case "gameNext":
        this.onGameNext = handler as GameNextCallback;
        break;
      case "newGame":
        this.onNewGame = handler as NewGameCallback;
        break;
      case "gameEnd":
        this.onGameEnd = handler as GameEndCallback;
        break;
      case "loginRetry":
        this.onLoginRetry = handler as LoginRetryCallback;
        break;
      case "flipBoard":
        this.onFlipBoard = handler as FlipBoardCallback;
        break;
      case "pieceBeat":
        this.onPieceBeat = handler as PieceBeatCallback;
        break;
      case "beepShort":
        this.onBeepShort = handler as BeepShortCallback;
        break;
      case "beepUnlimited":
        this.onBeepUnlimited = handler as BeepUnlimitedCallback;
        break;
      case "stopBeep":
        this.onStopBeep = handler as StopBeepCallback;
        break;
      case "error":
        this.onError = handler as ErrorCallback;
        break;
    }
    return this;
  }

  get state(): CSAGameState {
    return this._state;
  }

  get settings(): CSAGameSettings {
    return this._settings;
  }

  get sessionID(): number {
    return this._sessionID;
  }

  get usiSessionID(): number {
    return this.player instanceof USIPlayer ? this.player.sessionID : 0;
  }

  get isMyTurn(): boolean {
    const color = this.recordManager.record.position.color;
    return color === this.gameSummary.myColor;
  }

  /**
   * CSA サーバーにログインする。
   */
  async login(settings: CSAGameSettings, playerBuilder: PlayerBuilder): Promise<void> {
    if (this.sessionID) {
      throw new Error("CSAGameManager#login: session already exists");
    }
    if (this._state !== CSAGameState.OFFLINE) {
      throw new Error("CSAGameManager#login: unexpected state");
    }
    this._state = CSAGameState.PLAYER_SETUP;
    this._settings = settings;
    this.playerBuilder = playerBuilder;
    this.repeat = 0;
    // プレイヤーを初期化する。
    try {
      this.player = await this.playerBuilder.build(this._settings.player, (info) =>
        this.recordManager.updateSearchInfo(SearchInfoSenderType.OPPONENT, info),
      );
    } catch (e) {
      this._state = CSAGameState.OFFLINE;
      throw e;
    }
    // サーバーへのログインと対局開始を試みる。
    // NOTICE: エラーの場合は自動的にリトライするのでこの関数の呼び元にはエラーを伝搬しない。
    this.doLogin().catch(this.onError);
  }

  private async relogin(): Promise<void> {
    // 1局ごとにエンジンを再起動するオプションが選択されている場合は一度エンジンを停止してからスタートしなおす。
    if (this.settings.restartPlayerEveryGame) {
      this._state = CSAGameState.PLAYER_SETUP;
      if (this.player) {
        await this.player.close();
        this.player = undefined;
      }
      try {
        this.player = await this.playerBuilder.build(this._settings.player, (info) =>
          this.recordManager.updateSearchInfo(SearchInfoSenderType.OPPONENT, info),
        );
      } catch (e) {
        this._state = CSAGameState.LOGIN_FAILED;
        this.close(ReloginBehavior.RELOGIN_WITH_INTERVAL);
        throw e;
      }
    }
    await this.doLogin();
  }

  private async doLogin(): Promise<void> {
    if (!this.player) {
      throw new Error("CSAGameManager#login: player is not initialized");
    }
    try {
      // プレイヤーに対局開始を通知する。
      this._state = CSAGameState.PLAYER_SETUP;
      await this.player.readyNewGame();
      // CSA サーバーにログインする。
      this._state = CSAGameState.WAITING_LOGIN;
      const sessionID = await api.csaLogin(this._settings.server);
      // セッション ID を記憶する。
      this._sessionID = sessionID;
      // ステータスを更新する。
      this._state = CSAGameState.READY;
      entrySession(this.sessionID, this);
      this.onGameNext();
    } catch (e) {
      this._state = CSAGameState.LOGIN_FAILED;
      this.close(ReloginBehavior.RELOGIN_WITH_INTERVAL);
      throw new Error(`CSAGameManager#login: ${t.failedToStartNewGame}: ${e}`);
    }
  }

  /**
   * CSA サーバーに中断を要求する。
   */
  stop(): void {
    if (this.sessionID) {
      this.stopRequested = true;
      api.csaStop(this.sessionID);
    }
  }

  /**
   * CSA サーバーからログアウトする。
   */
  logout(): void {
    this.close(ReloginBehavior.DO_NOT_RELOGIN);
  }

  private close(reloginBehavior: ReloginBehavior): void {
    // 既に停止済みであるかログインの非同期処理を待っている場合は何もしない。
    if (this._state === CSAGameState.OFFLINE || this._state === CSAGameState.WAITING_LOGIN) {
      return;
    }

    // 自動保存が有効な場合は棋譜を保存する。
    if (this._state === CSAGameState.GAME && this.settings.enableAutoSave) {
      this.onSaveRecord();
    }

    // 停止が要求されている場合は連続対局や再試行をしない。
    if (this.stopRequested) {
      reloginBehavior = ReloginBehavior.DO_NOT_RELOGIN;
      this.stopRequested = false;
    }

    // CSA プロトコルのセッションが存在する場合は切断する。
    if (this.sessionID) {
      releaseSession(this.sessionID);
      api.csaLogout(this.sessionID).catch((e) => {
        this.onError(
          new Error(`CSAGameManager#close: ${t.errorOccuredWhileLogoutFromCSAServer}: ${e}`),
        );
      });
      this._sessionID = 0;
    }

    // 時計を停止する。
    this.blackClock.stop();
    this.whiteClock.stop();

    // ステータスをオフラインに戻す。
    this._state = CSAGameState.OFFLINE;

    // リトライを待っている場合はタイマーを解除する。
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    // 連続対局の条件を満たしていない場合はプレイヤーセッションを閉じ、ハンドラーを呼び出して終了する。
    if (reloginBehavior === ReloginBehavior.DO_NOT_RELOGIN || this.repeat >= this.settings.repeat) {
      if (this.player) {
        this.player.close().catch((e) => {
          this.onError(new Error(`CSAGameManager#close: ${t.failedToShutdownEngines}: ${e}`));
        });
        this.player = undefined;
      }
      this.onGameEnd();
      return;
    }

    // 連続対局の条件を満たしている場合は再ログインする。
    if (reloginBehavior === ReloginBehavior.RELOGIN_IMMEDIATELY) {
      this.relogin().catch(this.onError);
    } else {
      this._state = CSAGameState.LOGIN_RETRY_INTERVAL;
      this.onLoginRetry();
      this.retryTimer = setTimeout(
        () => this.relogin().catch(this.onError),
        loginRetryIntervalSeconds * 1e3,
      );
    }
  }

  onGameSummary(gameSummary: CSAGameSummary): void {
    this.gameSummary = gameSummary;

    // 開始局面（途中再開の場合は再開局面までの指し手）を読み込む。
    const error = this.recordManager.importRecord(this.gameSummary.position, {
      type: RecordFormatType.CSA,
    });
    if (error) {
      this.onError(`CSAGameManager#onGameSummary: ${error}`);
      this.close(ReloginBehavior.DO_NOT_RELOGIN);
      return;
    }
    // 指し手が含まれる場合は棋譜の末尾へ移動する。
    this.recordManager.changePly(Number.MAX_SAFE_INTEGER);

    api.csaAgree(this.sessionID, this.gameSummary.id);
  }

  onReject(): void {
    this.close(ReloginBehavior.RELOGIN_WITH_INTERVAL);
  }

  onStart(playerStates: CSAPlayerStates): void {
    // 対局数をカウントアップする。
    this.repeat++;
    this.onNewGame(this.repeat);

    // 対局情報を初期化する。
    const blackTimeConfig = this.gameSummary.players.black.time;
    const whiteTimeConfig = this.gameSummary.players.white.time;
    this.recordManager.setGameStartMetadata({
      gameTitle: this.gameSummary.id,
      blackName: this.gameSummary.players.black.playerName,
      whiteName: this.gameSummary.players.white.playerName,
      blackTimeLimit: {
        timeSeconds: (blackTimeConfig.totalTime * blackTimeConfig.timeUnitMs) / 1e3,
        byoyomi: (blackTimeConfig.byoyomi * blackTimeConfig.timeUnitMs) / 1e3,
        increment: (blackTimeConfig.increment * blackTimeConfig.timeUnitMs) / 1e3,
      },
      whiteTimeLimit: {
        timeSeconds: (whiteTimeConfig.totalTime * whiteTimeConfig.timeUnitMs) / 1e3,
        byoyomi: (whiteTimeConfig.byoyomi * whiteTimeConfig.timeUnitMs) / 1e3,
        increment: (whiteTimeConfig.increment * whiteTimeConfig.timeUnitMs) / 1e3,
      },
    });

    // 将棋盤の向きを調整する。
    if (this.settings.autoFlip && this.onFlipBoard) {
      this.onFlipBoard(this.gameSummary.myColor === Color.WHITE);
    }

    this._state = CSAGameState.GAME;
    this.next(playerStates);
  }

  onMove(data: string, playerStates: CSAPlayerStates) {
    // 自分の指し手か？（着手後だと反転してしまうので注意）
    const isMyMove = this.isMyTurn;

    // 指し手を読み取る。
    const move = parseCSAMove(this.recordManager.record.position, data);
    if (move instanceof Error) {
      this.onError(`CSAGameManager#onMove: 解釈できない指し手 [${data}]: ${move.message}`);
      return;
    }

    // 局面を進める。
    this.recordManager.appendMove({
      move,
      moveOption: {
        ignoreValidation: true,
      },
      elapsedMs: this.parseElapsedMs(move.color, data),
    });

    // 探索情報を記録する。
    if (isMyMove && this.searchInfo) {
      this.recordManager.updateSearchInfo(SearchInfoSenderType.PLAYER, this.searchInfo);
    }

    // コメントを記録する。
    const appSettings = useAppSettings();
    if (isMyMove && this.searchInfo && this.settings.enableComment) {
      const engineName = this.gameSummary.players[move.color].playerName;
      this.recordManager.appendSearchComment(
        SearchInfoSenderType.PLAYER,
        appSettings.searchCommentFormat,
        this.searchInfo,
        CommentBehavior.APPEND,
        { engineName },
      );
    }

    this.onPieceBeat();
    this.next(playerStates);
  }

  private parseElapsedMs(color: Color, data: string): number {
    const timeConfig = this.gameSummary.players[color].time;
    const parsed = /^.*,T([0-9]+)$/.exec(data);
    return parsed ? Number(parseInt(parsed[1])) * timeConfig.timeUnitMs : 0;
  }

  onGameResult(move: CSASpecialMove, gameResult: CSAGameResult): void {
    // 終局理由を棋譜に記録する。
    this.recordManager.appendMove({
      move: this.gameResultToSpecialMove(move, gameResult),
    });
    // 対局結果をプレイヤーに通知する。
    if (this.player) {
      let result: GameResult;
      switch (gameResult) {
        case CSAGameResult.WIN:
          result = GameResult.WIN;
          break;
        case CSAGameResult.LOSE:
          result = GameResult.LOSE;
          break;
        case CSAGameResult.DRAW:
        case CSAGameResult.CENSORED:
        case CSAGameResult.CHUDAN:
          result = GameResult.DRAW;
          break;
      }
      this.player.gameover(result);
    }
    // セッションを終了する。
    this.close(ReloginBehavior.RELOGIN_IMMEDIATELY);
  }

  private gameResultToSpecialMove(
    move: CSASpecialMove,
    gameResult: CSAGameResult,
  ): SpecialMoveType {
    const color = this.recordManager.record.position.color;
    switch (move) {
      case CSASpecialMove.RESIGN:
        return SpecialMoveType.RESIGN;
      case CSASpecialMove.SENNICHITE:
        return SpecialMoveType.REPETITION_DRAW;
      case CSASpecialMove.OUTE_SENNICHITE:
      case CSASpecialMove.ILLEGAL_MOVE:
      case CSASpecialMove.ILLEGAL_ACTION:
        switch (gameResult) {
          case CSAGameResult.WIN:
            return color === this.gameSummary.myColor
              ? SpecialMoveType.FOUL_WIN
              : SpecialMoveType.FOUL_LOSE;
          case CSAGameResult.LOSE:
            return color === this.gameSummary.myColor
              ? SpecialMoveType.FOUL_LOSE
              : SpecialMoveType.FOUL_WIN;
        }
        break;
      case CSASpecialMove.TIME_UP:
        return SpecialMoveType.TIMEOUT;
      case CSASpecialMove.JISHOGI:
        return SpecialMoveType.ENTERING_OF_KING;
      case CSASpecialMove.MAX_MOVES:
        return SpecialMoveType.IMPASS;
    }

    if (gameResult === CSAGameResult.DRAW) {
      return SpecialMoveType.DRAW;
    }
    return SpecialMoveType.INTERRUPT;
  }

  onClose(): void {
    this.close(
      this.settings.autoRelogin
        ? ReloginBehavior.RELOGIN_WITH_INTERVAL
        : ReloginBehavior.DO_NOT_RELOGIN,
    );
  }

  private next(playerStates: CSAPlayerStates): void {
    this.blackClock.stop();
    this.whiteClock.stop();
    this.syncClock(playerStates);
    this.startClock();

    const color = this.recordManager.record.position.color;
    if (color === this.gameSummary.myColor) {
      this.startSearch(playerStates);
    } else {
      this.startPonder();
    }
  }

  private syncClock(playerStates: CSAPlayerStates): void {
    const clockSettings = {
      onBeepShort: () => this.onBeepShort(),
      onBeepUnlimited: () => this.onBeepUnlimited(),
      onStopBeep: () => this.onStopBeep(),
    };
    const blackTimeConfig = this.gameSummary.players.black.time;
    this.blackClock.setup({
      ...clockSettings,
      timeMs: playerStates.black.time * blackTimeConfig.timeUnitMs,
      byoyomi: (blackTimeConfig.byoyomi * blackTimeConfig.timeUnitMs) / 1e3,
    });
    const whiteTimeConfig = this.gameSummary.players.white.time;
    this.whiteClock.setup({
      ...clockSettings,
      timeMs: playerStates.white.time * whiteTimeConfig.timeUnitMs,
      byoyomi: (whiteTimeConfig.byoyomi * whiteTimeConfig.timeUnitMs) / 1e3,
    });
  }

  private startClock(): void {
    const color = this.recordManager.record.position.color;
    if (color === Color.BLACK) {
      this.blackClock.start();
    } else {
      this.whiteClock.start();
    }
  }

  private startSearch(playerStates: CSAPlayerStates): void {
    if (!this.player) {
      this.onError("CSAGameManager#startSearch: player is not initialized");
      return;
    }
    this.player
      .startSearch(
        this.recordManager.record.position,
        this.recordManager.record.usi,
        this.buildTimeStates(playerStates),
        {
          onMove: this.onPlayerMove.bind(this),
          onResign: this.onPlayerResign.bind(this),
          onWin: this.onPlayerWin.bind(this),
          onError: this.onPlayerError.bind(this),
        },
      )
      .catch((e) => {
        this.onError(new Error(`CSAGameManager#startSearch: ${t.failedToSendGoCommand}: ${e}`));
      });
  }

  private startPonder(): void {
    if (!this.player) {
      this.onError("CSAGameManager#startPonder: player is not initialized");
      return;
    }
    this.player
      .startPonder(
        this.recordManager.record.position,
        this.recordManager.record.usi,
        this.buildTimeStates(),
      )
      .catch((e) => {
        this.onError(new Error(`CSAGameManager#startPonder: ${t.failedToSendPonderCommand}: ${e}`));
      });
  }

  private startEarlyPonder(move: Move): void {
    if (!this.player) {
      this.onError("CSAGameManager#startEarlyPonder: player is not initialized");
      return;
    }
    const position = this.recordManager.record.position.clone();
    const usi = this.recordManager.record.usi + " " + move.usi;
    if (!position.doMove(move)) {
      this.onError("CSAGameManager#startEarlyPonder: failed to make a move");
      return;
    }
    this.player.startPonder(position, usi, this.buildTimeStates()).catch((e) => {
      this.onError(
        new Error(`CSAGameManager#startEarlyPonder: ${t.failedToSendPonderCommand}: ${e}`),
      );
    });
  }

  private buildTimeStates(playerStates?: CSAPlayerStates): TimeStates {
    const black = this.gameSummary.players.black.time;
    const white = this.gameSummary.players.white.time;
    return {
      black: {
        timeMs: playerStates ? playerStates.black.time * black.timeUnitMs : this.blackClock.timeMs,
        byoyomi: (black.byoyomi * black.timeUnitMs) / 1e3,
        increment: (black.increment * black.timeUnitMs) / 1e3,
      },
      white: {
        timeMs: playerStates ? playerStates.white.time * white.timeUnitMs : this.whiteClock.timeMs,
        byoyomi: (white.byoyomi * white.timeUnitMs) / 1e3,
        increment: (white.increment * white.timeUnitMs) / 1e3,
      },
    };
  }

  private onPlayerMove(move: Move, info?: SearchInfo): void {
    // 着手がサーバーで承認されるまで情報を保持しておく。
    this.searchInfo = info;

    let score: number | undefined = undefined;
    let pv: string | undefined = undefined;
    switch (this._settings.server.protocolVersion) {
      case CSAProtocolVersion.V121:
        // 通常の CSA プロトコルでは次の指し手のみを送信する。
        break;
      case CSAProtocolVersion.V121_FLOODGATE:
        // Floodgate 拡張では評価値と PV を送信する。
        score = info?.score;
        info?.pv?.forEach((move) => {
          pv = pv ? pv + " " : "";
          pv += formatCSAMove(move);
        });
        break;
    }

    // 指し手をサーバーに送信する。
    api.csaMove(this.sessionID, formatCSAMove(move), score, pv);

    // やねうら王拡張モードではサーバーからの応答を待たずに非同期で Ponder を開始する。
    if (this.settings.player.usi?.enableEarlyPonder) {
      this.startEarlyPonder(move);
    }
  }

  private onPlayerResign(): void {
    api.csaResign(this.sessionID);
  }

  private onPlayerWin(): void {
    api.csaWin(this.sessionID);
  }

  private onPlayerError(e: unknown): void {
    this.onError(e);
  }
}

const csaGameManagers: { [sessionID: number]: CSAGameManager } = {};

function entrySession(sessionID: number, gameManager: CSAGameManager): void {
  csaGameManagers[sessionID] = gameManager;
}

function releaseSession(sessionID: number): void {
  delete csaGameManagers[sessionID];
}

export function onCSAGameSummary(sessionID: number, gameSummary: CSAGameSummary): void {
  csaGameManagers[sessionID]?.onGameSummary(gameSummary);
}

export function onCSAReject(sessionID: number): void {
  csaGameManagers[sessionID]?.onReject();
}

export function onCSAStart(sessionID: number, playerStates: CSAPlayerStates): void {
  csaGameManagers[sessionID]?.onStart(playerStates);
}

export function onCSAMove(sessionID: number, move: string, playerStates: CSAPlayerStates): void {
  csaGameManagers[sessionID]?.onMove(move, playerStates);
}

export function onCSAGameResult(
  sessionID: number,
  specialMove: CSASpecialMove,
  gameResult: CSAGameResult,
) {
  csaGameManagers[sessionID]?.onGameResult(specialMove, gameResult);
}

export function onCSAClose(sessionID: number) {
  csaGameManagers[sessionID]?.onClose();
}
