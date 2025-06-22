import { LogLevel } from "@/common/log.js";
import api from "@/renderer/ipc/api.js";
import { Player, SearchInfo } from "@/renderer/players/player.js";
import { defaultGameSettings, GameSettings, JishogiRule } from "@/common/settings/game.js";
import {
  Color,
  detectRecordFormat,
  formatMove,
  JishogiDeclarationResult,
  JishogiDeclarationRule,
  judgeJishogiDeclaration,
  Move,
  PieceType,
  Record,
  RecordFormatType,
  reverseColor,
  SpecialMoveType,
  Square,
} from "tsshogi";
import { CommentBehavior } from "@/common/settings/comment.js";
import { RecordManager, SearchInfoSenderType } from "./record.js";
import { Clock } from "./clock.js";
import { defaultPlayerBuilder, PlayerBuilder } from "@/renderer/players/builder.js";
import { GameResult } from "@/common/game/result.js";
import { t } from "@/common/i18n/index.js";
import { TimeStates } from "@/common/game/time.js";
import {
  calculateEloRatingFromWinRate,
  calculateWinRateConfidenceInterval,
  calculateZValue,
  Z_VALUE_95,
  Z_VALUE_99,
} from "@/common/statistics.js";
import { useAppSettings } from "./settings.js";

enum GameState {
  IDLE = "idle",
  STARTING = "STARTING",
  ACTIVE = "active",
  PENDING = "pending",
  BUSY = "busy",
}

export type PlayerGameResults = {
  name: string;
  win: number;
  winBlack: number;
  winWhite: number;
};

export type GameResults = {
  player1: PlayerGameResults;
  player2: PlayerGameResults;
  draw: number;
  invalid: number;
  total: number;
};

export type GameStatistics = {
  rating: number;
  ratingLower: number;
  ratingUpper: number;
  npIsGreaterThan5: boolean;
  zValue: number;
  significance5pc: boolean;
  significance1pc: boolean;
};

export function calculateGameStatistics(results: GameResults): GameStatistics {
  const n = results.player1.win + results.player2.win;
  const wins = Math.max(results.player1.win, results.player2.win);
  const winRate = wins / n;
  const winRateCI = calculateWinRateConfidenceInterval(Z_VALUE_95, winRate, n);
  const rating = calculateEloRatingFromWinRate(winRate);
  const ratingLower = calculateEloRatingFromWinRate(winRate - winRateCI);
  const ratingUpper = calculateEloRatingFromWinRate(winRate + winRateCI);
  const zValue = Math.abs(calculateZValue(results.player1.win, n, 0.5));
  return {
    rating,
    ratingLower,
    ratingUpper,
    npIsGreaterThan5: n > 10,
    zValue,
    significance5pc: zValue > Z_VALUE_95,
    significance1pc: zValue > Z_VALUE_99,
  };
}

type SaveRecordCallback = () => void;
type GameNextCallback = () => void;
type GameEndCallback = (results: GameResults, specialMoveType: SpecialMoveType) => void;
type FlipBoardCallback = (flip: boolean) => void;
type PieceBeatCallback = () => void;
type BeepShortCallback = () => void;
type BeepUnlimitedCallback = () => void;
type StopBeepCallback = () => void;
type ErrorCallback = (e: unknown) => void;

function newGameResults(name1: string, name2: string): GameResults {
  return {
    player1: { name: name1, win: 0, winBlack: 0, winWhite: 0 },
    player2: { name: name2, win: 0, winBlack: 0, winWhite: 0 },
    draw: 0,
    invalid: 0,
    total: 0,
  };
}

export class StartPositionList {
  private usiList: string[] = [];
  private maxRepeat: number = 1;
  private index = 0;
  private repeat = 0;

  clear(): void {
    this.usiList = [];
    this.maxRepeat = 1;
    this.index = 0;
    this.repeat = 0;
  }

  async reset(params: {
    filePath: string;
    swapPlayers: boolean;
    order: "sequential" | "shuffle";
    maxGames: number;
  }): Promise<void> {
    // load SFEN file
    const usiList = await api.loadSFENFile(params.filePath);
    if (params.order === "shuffle") {
      for (let i = usiList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [usiList[i], usiList[j]] = [usiList[j], usiList[i]];
      }
    }
    const maxPositions = Math.ceil(params.maxGames / (params.swapPlayers ? 2 : 1));
    if (usiList.length > maxPositions) {
      usiList.length = maxPositions;
    }

    // add "sfen " prefix to simple SFEN strings
    for (let i = 0; i < usiList.length; i++) {
      if (
        !usiList[i].startsWith("sfen ") &&
        detectRecordFormat(usiList[i]) === RecordFormatType.SFEN
      ) {
        usiList[i] = `sfen ${usiList[i]}`;
      }
    }

    // validate USI
    if (usiList.length === 0) {
      throw new Error("No available positions in the list.");
    }
    for (let i = 0; i < usiList.length; i++) {
      const record = Record.newByUSI(usiList[i]);
      if (!(record instanceof Record)) {
        throw record;
      }
    }

    this.usiList = usiList;
    this.maxRepeat = params.swapPlayers ? 2 : 1;
    this.index = 0;
    this.repeat = 0;
  }

  next(): string {
    if (this.usiList.length === 0) {
      return "position startpos";
    }
    if (this.repeat < this.maxRepeat) {
      this.repeat++;
    } else {
      this.index++;
      this.repeat = 1;
      if (this.index >= this.usiList.length) {
        this.index = 0;
      }
    }
    return this.usiList[this.index];
  }
}

export class GameManager {
  private state: GameState;
  private _settings: GameSettings;
  private startPly = 0;
  private repeat = 0;
  private startPositionList = new StartPositionList();
  private blackPlayer?: Player;
  private whitePlayer?: Player;
  private playerBuilder = defaultPlayerBuilder();
  private _results: GameResults = newGameResults("", "");
  private lastEventID: number;
  private onSaveRecord: SaveRecordCallback = () => {
    /* noop */
  };
  private onGameNext: GameNextCallback = () => {
    /* noop */
  };
  private onGameEnd: GameEndCallback = () => {
    /* noop */
  };
  private onFlipBoard: FlipBoardCallback = () => {
    /* noop */
  };
  private onPieceBeat: PieceBeatCallback = () => {
    /* noop */
  };
  private onBeepShort: BeepShortCallback = () => {
    /* noop */
  };
  private onBeepUnlimited: BeepUnlimitedCallback = () => {
    /* noop */
  };
  private onStopBeep: StopBeepCallback = () => {
    /* noop */
  };
  private onError: ErrorCallback = () => {
    /* noop */
  };

  constructor(
    private recordManager: RecordManager,
    private blackClock: Clock,
    private whiteClock: Clock,
  ) {
    this.state = GameState.IDLE;
    this._settings = defaultGameSettings();
    this.lastEventID = 0;
  }

  on(event: "saveRecord", handler: SaveRecordCallback): this;
  on(event: "gameNext", handler: GameNextCallback): this;
  on(event: "gameEnd", handler: GameEndCallback): this;
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
      case "gameEnd":
        this.onGameEnd = handler as GameEndCallback;
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

  get settings(): GameSettings {
    return this._settings;
  }

  get results(): GameResults {
    return this._results;
  }

  async start(settings: GameSettings, playerBuilder: PlayerBuilder): Promise<void> {
    if (this.state !== GameState.IDLE) {
      throw Error(
        "GameManager#start: 前回の対局が正常に終了できていません。アプリを再起動してください。",
      );
    }
    this.state = GameState.STARTING;
    this._settings = settings;
    this.playerBuilder = playerBuilder;
    this.repeat = 0;
    if (settings.startPosition === "current") {
      // 連続対局用に何手目から開始するかを記憶する。
      this.startPly = this.recordManager.record.current.ply;
    }
    this._results = newGameResults(settings.black.name, settings.white.name);
    try {
      // 初期局面リストを読み込む。
      if (settings.startPosition === "list") {
        await this.startPositionList.reset({
          filePath: settings.startPositionListFile,
          swapPlayers: settings.swapPlayers,
          order: settings.startPositionListOrder,
          maxGames: settings.repeat,
        });
      }
      // プレイヤーを初期化する。
      this.blackPlayer = await this.playerBuilder.build(this.settings.black, (info) =>
        this.updateSearchInfo(SearchInfoSenderType.OPPONENT, info),
      );
      this.whitePlayer = await this.playerBuilder.build(this.settings.white, (info) =>
        this.updateSearchInfo(SearchInfoSenderType.OPPONENT, info),
      );
      await this.goNextGame();
    } catch (e) {
      try {
        await this.closePlayers();
      } catch (errorOnClose) {
        this.onError(errorOnClose);
      } finally {
        this.state = GameState.IDLE;
        this.startPositionList.clear();
      }
      throw new Error(`GameManager#start: ${t.failedToStartNewGame}: ${e}`);
    }
  }

  private async goNextGame(): Promise<void> {
    if (this.blackPlayer === undefined || this.whitePlayer === undefined) {
      throw new Error("GameManager#goNextGame: プレイヤーが初期化されていません。");
    }
    // 連続対局の回数をカウントアップする。
    this.repeat++;
    // 初期局面を設定する。
    switch (this.settings.startPosition) {
      case "current":
        if (this.recordManager.record.current.ply !== this.startPly) {
          this.recordManager.changePly(this.startPly);
          this.recordManager.removeNextMove();
        }
        break;
      case "list":
        this.recordManager.importRecord(this.startPositionList.next(), {
          type: RecordFormatType.USI,
          markAsSaved: true,
        });
        this.recordManager.updateComment(t.beginFromThisPosition);
        break;
      default:
        this.recordManager.resetByInitialPositionType(this.settings.startPosition);
    }
    // 対局のメタデータを設定する。
    this.recordManager.setGameStartMetadata({
      gameTitle:
        this.settings.repeat >= 2 ? `連続対局 ${this.repeat}/${this.settings.repeat}` : undefined,
      blackName: this.settings.black.name,
      whiteName: this.settings.white.name,
      blackTimeLimit: this.settings.timeLimit,
      whiteTimeLimit: this.settings.whiteTimeLimit || this.settings.timeLimit,
    });
    // 対局時計を設定する。
    this.blackClock.setup(this.getBlackClockSettings());
    this.whiteClock.setup(this.getWhiteClockSettings());
    // プレイヤーに対局開始を通知する。
    await Promise.all([this.blackPlayer.readyNewGame(), this.whitePlayer.readyNewGame()]);
    // State を更新する。
    this.state = GameState.ACTIVE;
    // ハンドラーを呼び出す。
    this.onGameNext();
    // 盤面の向きを調整する。
    this.adjustBoardOrientation();
    // 最初の手番へ移る。
    setTimeout(() => this.nextMove());
  }

  private getCommonClockSettings() {
    return {
      timeMs: this.settings.timeLimit.timeSeconds * 1e3,
      byoyomi: this.settings.timeLimit.byoyomi,
      increment: this.settings.timeLimit.increment,
      onBeepShort: () => this.onBeepShort(),
      onBeepUnlimited: () => this.onBeepUnlimited(),
      onStopBeep: () => this.onStopBeep(),
    };
  }

  private getBlackClockSettings() {
    return {
      ...this.getCommonClockSettings(),
      onTimeout: () => {
        this.timeout(Color.BLACK);
      },
    };
  }

  private getWhiteClockSettings() {
    const settings = {
      ...this.getCommonClockSettings(),
      onTimeout: () => {
        this.timeout(Color.WHITE);
      },
    };
    if (!this.settings.whiteTimeLimit) {
      return settings;
    }
    return {
      ...settings,
      timeMs: this.settings.whiteTimeLimit.timeSeconds * 1e3,
      byoyomi: this.settings.whiteTimeLimit.byoyomi,
      increment: this.settings.whiteTimeLimit.increment,
    };
  }

  private adjustBoardOrientation(): void {
    if (this.settings.humanIsFront) {
      if (!this.blackPlayer?.isEngine() && this.whitePlayer?.isEngine()) {
        this.onFlipBoard(false);
      } else if (this.blackPlayer?.isEngine() && !this.whitePlayer?.isEngine()) {
        this.onFlipBoard(true);
      }
    }
  }

  private nextMove(): void {
    if (this.state !== GameState.ACTIVE) {
      return;
    }
    // 最大手数に到達したら終了する。
    // ただし、最後の2手のどちらかが王手なら対局を延長する。
    if (
      this._settings.maxMoves &&
      this.recordManager.record.current.ply >= this._settings.maxMoves &&
      !this.recordManager.record.current.isCheck &&
      !this.recordManager.record.current.prev?.isCheck
    ) {
      this.end(SpecialMoveType.IMPASS);
      return;
    }
    // 手番側の時計をスタートする。
    this.getActiveClock().start();
    // プレイヤーを取得する。
    const color = this.recordManager.record.position.color;
    const player = this.getPlayer(color);
    const ponderPlayer = this.getPlayer(reverseColor(color));
    if (!player || !ponderPlayer) {
      this.onError(new Error("GameManager#nextMove: プレイヤーが初期化されていません。"));
      return;
    }
    // イベント ID を発行する。
    const eventID = this.issueEventID();
    // 時間の情報をまとめる。
    const timeStates: TimeStates = {
      black: {
        timeMs: this.blackClock.timeMs,
        byoyomi: this.blackClock.settings.byoyomi || 0,
        increment: this.blackClock.settings.increment || 0,
      },
      white: {
        timeMs: this.whiteClock.timeMs,
        byoyomi: this.whiteClock.settings.byoyomi || 0,
        increment: this.whiteClock.settings.increment || 0,
      },
    };
    // 手番側のプレイヤーの思考を開始する。
    player
      .startSearch(this.recordManager.record.position, this.recordManager.record.usi, timeStates, {
        onMove: (move, info) => this.onMove(eventID, move, info),
        onResign: () => this.onResign(eventID),
        onWin: () => this.onWin(eventID),
        onError: (e) => this.onError(e),
      })
      .catch((e) => {
        this.onError(new Error(`GameManager#nextMove: ${t.failedToSendGoCommand}: ${e}`));
      });
    // Ponder を開始する。
    ponderPlayer
      .startPonder(this.recordManager.record.position, this.recordManager.record.usi, timeStates)
      .catch((e) => {
        this.onError(new Error(`GameManager#nextMove: ${t.failedToSendPonderCommand}: ${e}`));
      });
  }

  private onMove(eventID: number, move: Move, info?: SearchInfo): void {
    if (eventID !== this.lastEventID) {
      api.log(LogLevel.ERROR, "GameManager#onMove: event ID already disabled");
      return;
    }
    if (this.state !== GameState.ACTIVE) {
      api.log(LogLevel.ERROR, "GameManager#onMove: invalid state: " + this.state);
      return;
    }
    // 合法手かどうかをチェックする。
    if (!this.recordManager.record.position.isValidMove(move)) {
      this.onError("反則手: " + formatMove(this.recordManager.record.position, move));
      this.end(SpecialMoveType.FOUL_LOSE);
      return;
    }
    // 手番側の時計をストップする。
    this.getActiveClock().stop();
    // 指し手を追加して局面を進める。
    this.recordManager.appendMove({
      move,
      moveOption: { ignoreValidation: true },
      elapsedMs: this.getActiveClock().elapsedMs,
    });
    // 評価値を記録する。
    if (info) {
      this.updateSearchInfo(SearchInfoSenderType.PLAYER, info);
    }
    // コメントを追加する。
    if (info && this.settings.enableComment) {
      const appSettings = useAppSettings();
      const engineName = this.settings[move.color].name;
      this.recordManager.appendSearchComment(
        SearchInfoSenderType.PLAYER,
        appSettings.searchCommentFormat,
        info,
        CommentBehavior.APPEND,
        { engineName },
      );
    }
    // 駒音を鳴らす。
    this.onPieceBeat();
    // 千日手をチェックする。
    const faulColor = this.recordManager.record.perpetualCheck;
    if (faulColor) {
      // 連続王手の場合は王手した側を反則負けとする。
      if (faulColor === this.recordManager.record.position.color) {
        this.end(SpecialMoveType.FOUL_LOSE);
        return;
      } else {
        this.end(SpecialMoveType.FOUL_WIN);
        return;
      }
    } else if (this.recordManager.record.repetition) {
      // シンプルな千日手の場合は引き分けとする。
      this.end(SpecialMoveType.REPETITION_DRAW);
      return;
    }
    // トライルールのチェックを行う。
    if (
      this.settings.jishogiRule == JishogiRule.TRY &&
      move.pieceType === PieceType.KING &&
      ((move.color === Color.BLACK && move.to.equals(new Square(5, 1))) ||
        (move.color === Color.WHITE && move.to.equals(new Square(5, 9))))
    ) {
      this.end(SpecialMoveType.TRY);
      return;
    }
    // 次の手番へ移る。
    this.nextMove();
  }

  private onResign(eventID: number): void {
    if (eventID !== this.lastEventID) {
      api.log(LogLevel.ERROR, "GameManager#onResign: event ID already disabled");
      return;
    }
    if (this.state !== GameState.ACTIVE) {
      api.log(LogLevel.ERROR, "GameManager#onResign: invalid state: " + this.state);
      return;
    }
    this.end(SpecialMoveType.RESIGN);
  }

  private onWin(eventID: number): void {
    if (eventID !== this.lastEventID) {
      api.log(LogLevel.ERROR, "GameManager#onWin: event ID already disabled");
      return;
    }
    if (this.state !== GameState.ACTIVE) {
      api.log(LogLevel.ERROR, "GameManager#onWin: invalid state: " + this.state);
      return;
    }
    const position = this.recordManager.record.position;
    if (
      this.settings.jishogiRule == JishogiRule.NONE ||
      this.settings.jishogiRule == JishogiRule.TRY
    ) {
      this.end(SpecialMoveType.FOUL_LOSE);
      return;
    }
    const rule =
      this.settings.jishogiRule == JishogiRule.GENERAL24
        ? JishogiDeclarationRule.GENERAL24
        : JishogiDeclarationRule.GENERAL27;
    switch (judgeJishogiDeclaration(rule, position, position.color)) {
      case JishogiDeclarationResult.WIN:
        this.end(SpecialMoveType.ENTERING_OF_KING);
        break;
      case JishogiDeclarationResult.DRAW:
        this.end(SpecialMoveType.DRAW);
        break;
      case JishogiDeclarationResult.LOSE:
        this.end(SpecialMoveType.FOUL_LOSE);
        break;
    }
  }

  private timeout(color: Color): void {
    // 時計音を止める。
    this.onStopBeep();
    // エンジンの時間切れが無効の場合は通知を送って対局を継続する。
    const player = this.getPlayer(color);
    if (player?.isEngine() && !this.settings.enableEngineTimeout) {
      player.stop().catch((e) => {
        this.onError(new Error(`GameManager#timeout: ${t.failedToSendStopCommand}: ${e}`));
      });
      return;
    }
    // 時間切れ負けで対局を終了する。
    this.end(SpecialMoveType.TIMEOUT);
  }

  stop(): void {
    this.end(SpecialMoveType.INTERRUPT);
  }

  private end(specialMoveType: SpecialMoveType): void {
    if (this.state !== GameState.ACTIVE && this.state !== GameState.PENDING) {
      return;
    }
    this.state = GameState.BUSY;
    const color = this.recordManager.record.position.color;
    Promise.resolve()
      .then(() => {
        // プレイヤーに対局結果を通知する。
        return this.sendGameResult(color, specialMoveType);
      })
      .then(() => {
        // インクリメントせずに時計を停止する。
        this.getActiveClock().pause();
        // 終局理由を棋譜に記録する。
        this.recordManager.appendMove({
          move: specialMoveType,
          elapsedMs: this.getActiveClock().elapsedMs,
        });
        this.recordManager.setGameEndMetadata();
        // 連続対局の記録に追加する。
        this.addGameResults(color, specialMoveType);
        // 自動保存が有効な場合は棋譜を保存する。
        if (this._settings.enableAutoSave) {
          this.onSaveRecord();
        }
        // 連続対局の終了条件を満たしているか中断が要求されていれば終了する。
        const complete =
          specialMoveType === SpecialMoveType.INTERRUPT || this.repeat >= this.settings.repeat;
        if (complete) {
          // プレイヤーを解放する。
          this.closePlayers()
            .catch((e) => {
              this.onError(e);
            })
            .finally(() => {
              this.state = GameState.IDLE;
              this.startPositionList.clear();
              this.onGameEnd(this.results, specialMoveType);
            });
          return;
        }
        // 連続対局時の手番入れ替えが有効ならプレイヤーを入れ替える。
        if (this.settings.swapPlayers) {
          this.swapPlayers();
        }
        // 次の対局を開始する。
        this.state = GameState.STARTING;
        this.goNextGame().catch((e) => {
          this.onError(new Error(`GameManager#end: ${t.failedToStartNewGame}: ${e}`));
        });
      })
      .catch((e) => {
        this.onError(new Error(`GameManager#end: ${t.errorOccuredWhileEndingGame}: ${e}`));
        this.state = GameState.PENDING;
      });
  }

  private updateSearchInfo(senderType: SearchInfoSenderType, info: SearchInfo): void {
    if (this.state !== GameState.ACTIVE) {
      return;
    }
    this.recordManager.updateSearchInfo(senderType, info);
  }

  private addGameResults(color: Color, specialMoveType: SpecialMoveType): void {
    const gameResult = specialMoveToPlayerGameResult(color, Color.BLACK, specialMoveType);
    switch (gameResult) {
      case GameResult.WIN:
        this._results.player1.win++;
        this._results.player1.winBlack++;
        break;
      case GameResult.LOSE:
        this._results.player2.win++;
        this._results.player2.winWhite++;
        break;
      case GameResult.DRAW:
        this._results.draw++;
        break;
      default:
        this._results.invalid++;
        break;
    }
    this._results.total++;
  }

  private swapPlayers(): void {
    this._settings = {
      ...this.settings,
      black: this.settings.white,
      white: this.settings.black,
    };
    if (this._settings.whiteTimeLimit) {
      this._settings = {
        ...this.settings,
        timeLimit: this._settings.whiteTimeLimit,
        whiteTimeLimit: this._settings.timeLimit,
      };
    }
    [this.blackPlayer, this.whitePlayer] = [this.whitePlayer, this.blackPlayer];
    this._results = {
      ...this.results,
      player1: this.results.player2,
      player2: this.results.player1,
    };
  }

  private async sendGameResult(color: Color, specialMoveType: SpecialMoveType): Promise<void> {
    if (this.blackPlayer) {
      const gameResult = specialMoveToPlayerGameResult(color, Color.BLACK, specialMoveType);
      if (gameResult) {
        await this.blackPlayer.gameover(gameResult);
      }
    }
    if (this.whitePlayer) {
      const gameResult = specialMoveToPlayerGameResult(color, Color.WHITE, specialMoveType);
      if (gameResult) {
        await this.whitePlayer.gameover(gameResult);
      }
    }
  }

  private async closePlayers(): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (this.blackPlayer) {
      tasks.push(this.blackPlayer.close());
      this.blackPlayer = undefined;
    }
    if (this.whitePlayer) {
      tasks.push(this.whitePlayer.close());
      this.whitePlayer = undefined;
    }
    try {
      await Promise.all(tasks);
    } catch (e) {
      throw new Error(`GameManager#closePlayers: ${t.failedToShutdownEngines}: ${e}`);
    }
  }

  private getPlayer(color: Color): Player | undefined {
    switch (color) {
      case Color.BLACK:
        return this.blackPlayer;
      case Color.WHITE:
        return this.whitePlayer;
    }
  }

  private getActiveClock(): Clock {
    const color = this.recordManager.record.position.color;
    switch (color) {
      case Color.BLACK:
        return this.blackClock;
      case Color.WHITE:
        return this.whiteClock;
    }
  }

  private issueEventID(): number {
    this.lastEventID += 1;
    return this.lastEventID;
  }
}

function specialMoveToPlayerGameResult(
  currentColor: Color,
  playerColor: Color,
  specialMoveType: SpecialMoveType,
): GameResult | null {
  switch (specialMoveType) {
    case SpecialMoveType.FOUL_WIN:
    case SpecialMoveType.ENTERING_OF_KING:
      return currentColor == playerColor ? GameResult.WIN : GameResult.LOSE;
    case SpecialMoveType.RESIGN:
    case SpecialMoveType.MATE:
    case SpecialMoveType.TIMEOUT:
    case SpecialMoveType.FOUL_LOSE:
    case SpecialMoveType.TRY:
      return currentColor == playerColor ? GameResult.LOSE : GameResult.WIN;
    case SpecialMoveType.IMPASS:
    case SpecialMoveType.REPETITION_DRAW:
      return GameResult.DRAW;
  }
  return null;
}
