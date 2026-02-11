import { LogLevel } from "@/common/log.js";
import api from "@/renderer/ipc/api.js";
import { Player, SearchInfo } from "@/renderer/players/player.js";
import {
  defaultTimeLimitSettings,
  JishogiRule,
  LinearGameSettings,
} from "@/common/settings/game.js";
import {
  Color,
  formatMove,
  JishogiDeclarationResult,
  JishogiDeclarationRule,
  judgeJishogiDeclaration,
  Move,
  PieceType,
  reverseColor,
  SpecialMoveType,
  Square,
} from "tsshogi";
import { CommentBehavior } from "@/common/settings/comment.js";
import { RecordManager, SearchInfoSenderType } from "@/renderer/record/manager.js";
import { Clock } from "./clock.js";
import { defaultPlayerBuilder, PlayerBuilder } from "@/renderer/players/builder.js";
import { GameResult } from "@/common/game/result.js";
import { t } from "@/common/i18n/index.js";
import { TimeStates } from "@/common/game/time.js";
import {
  buildGameCoordinator,
  emptyGameCoodinator,
  GameConditions,
  GameCoordinator,
} from "./coordinator.js";
import { GameResults, newGameResults } from "./result.js";
import * as uri from "@/common/uri.js";
import { defaultPlayerSettings } from "@/common/settings/player.js";

enum GameState {
  IDLE = "idle",
  STARTING = "starting",
  ACTIVE = "active",
  PENDING = "pending",
  BUSY = "busy",
}

type SaveRecordCallback = (dir: string) => void;
type GameNextCallback = () => void;
type GameResultSummary = {
  gameIndex: number;
  pairIndex: number;
  result: GameResult;
};
type GameResultCallback = (summary: GameResultSummary) => void;
type ClosedCallback = (results: GameResults, specialMoveType: SpecialMoveType) => void;
type FlipBoardCallback = (flip: boolean) => void;
type PieceBeatCallback = () => void;
type BeepShortCallback = () => void;
type BeepUnlimitedCallback = () => void;
type StopBeepCallback = () => void;
type ErrorCallback = (e: unknown) => void;

export class GameManager {
  private state = GameState.IDLE;
  private coordinator = emptyGameCoodinator();
  private blackPlayerSettings = defaultPlayerSettings();
  private whitePlayerSettings = defaultPlayerSettings();
  private blackTimeLimit = defaultTimeLimitSettings();
  private whiteTimeLimit = defaultTimeLimitSettings();
  private blackPlayer?: Player;
  private whitePlayer?: Player;
  private swapped = false;
  private playerBuilder = defaultPlayerBuilder();
  private _results: GameResults = newGameResults("", "");
  private currentGameConditions?: GameConditions;
  private lastEventID = 0;
  private onSaveRecord: SaveRecordCallback = () => {
    /* noop */
  };
  private onGameNext: GameNextCallback = () => {
    /* noop */
  };
  private onGameResult: GameResultCallback = () => {
    /* noop */
  };
  private onClosed: ClosedCallback = () => {
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
  ) {}

  on(event: "saveRecord", handler: SaveRecordCallback): this;
  on(event: "gameNext", handler: GameNextCallback): this;
  on(event: "gameResult", handler: GameResultCallback): this;
  on(event: "closed", handler: ClosedCallback): this;
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
      case "gameResult":
        this.onGameResult = handler as GameResultCallback;
        break;
      case "closed":
        this.onClosed = handler as ClosedCallback;
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

  get waitingForHumanPlayerMove(): boolean {
    return (
      (this.recordManager.record.position.color === Color.BLACK
        ? this.blackPlayerSettings.uri
        : this.whitePlayerSettings.uri) === uri.ES_HUMAN
    );
  }

  get results(): GameResults {
    return this._results;
  }

  async startLinear(settings: LinearGameSettings, playerBuilder: PlayerBuilder): Promise<void> {
    const gameTask = await buildGameCoordinator({
      settings,
      currentPly: this.recordManager.record.current.ply,
    });
    await this.start(gameTask, playerBuilder);
  }

  async start(coordinator: GameCoordinator, playerBuilder: PlayerBuilder): Promise<void> {
    if (this.state !== GameState.IDLE) {
      throw Error(
        "GameManager#start: 前回の対局が正常に終了できていません。アプリを再起動してください。",
      );
    }
    this.state = GameState.STARTING;
    this.coordinator = coordinator;
    this.blackPlayerSettings = coordinator.black;
    this.whitePlayerSettings = coordinator.white;
    this.blackTimeLimit = coordinator.timeLimit;
    this.whiteTimeLimit = coordinator.whiteTimeLimit || coordinator.timeLimit;
    this.playerBuilder = playerBuilder;
    this._results = newGameResults(this.blackPlayerSettings.name, this.whitePlayerSettings.name);
    const firstGameConditions = this.coordinator.next(this.recordManager);
    if (firstGameConditions === null) {
      this.state = GameState.IDLE;
      throw new Error("GameManager#start: 対局タスクが空です。");
    } else if (firstGameConditions instanceof Error) {
      this.state = GameState.IDLE;
      throw new Error(`GameManager#start: ${firstGameConditions.message}`);
    }
    try {
      // プレイヤーを初期化する。
      this.blackPlayer = await this.playerBuilder.build(this.blackPlayerSettings, (info) =>
        this.updateSearchInfo(SearchInfoSenderType.OPPONENT, info),
      );
      this.whitePlayer = await this.playerBuilder.build(this.whitePlayerSettings, (info) =>
        this.updateSearchInfo(SearchInfoSenderType.OPPONENT, info),
      );
      this.swapped = false;
      await this.goNextGame(firstGameConditions);
    } catch (e) {
      try {
        await this.closePlayers();
      } catch (errorOnClose) {
        this.onError(errorOnClose);
      } finally {
        this.state = GameState.IDLE;
      }
      throw new Error(`GameManager#start: ${t.failedToStartNewGame}: ${e}`);
    }
  }

  private async goNextGame(gameConditions: GameConditions): Promise<void> {
    if (this.blackPlayer === undefined || this.whitePlayer === undefined) {
      throw new Error("GameManager#goNextGame: プレイヤーが初期化されていません。");
    }
    // 手番を調整する。
    if (gameConditions.swapPlayers !== this.swapped) {
      this.swapPlayers();
    }
    this.currentGameConditions = gameConditions;
    // 対局のメタデータを設定する。
    this.recordManager.setGameStartMetadata({
      gameTitle: gameConditions.gameTitle,
      blackName: this.blackPlayerSettings.name,
      whiteName: this.whitePlayerSettings.name,
      blackTimeLimit: this.blackTimeLimit,
      whiteTimeLimit: this.whiteTimeLimit,
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

  private getBlackClockSettings() {
    return {
      timeMs: this.blackTimeLimit.timeSeconds * 1e3,
      byoyomi: this.blackTimeLimit.byoyomi,
      increment: this.blackTimeLimit.increment,
      onBeepShort: () => this.onBeepShort(),
      onBeepUnlimited: () => this.onBeepUnlimited(),
      onStopBeep: () => this.onStopBeep(),
      onTimeout: () => {
        this.timeout(Color.BLACK);
      },
    };
  }

  private getWhiteClockSettings() {
    return {
      timeMs: this.whiteTimeLimit.timeSeconds * 1e3,
      byoyomi: this.whiteTimeLimit.byoyomi,
      increment: this.whiteTimeLimit.increment,
      onBeepShort: () => this.onBeepShort(),
      onBeepUnlimited: () => this.onBeepUnlimited(),
      onStopBeep: () => this.onStopBeep(),
      onTimeout: () => {
        this.timeout(Color.WHITE);
      },
    };
  }

  private adjustBoardOrientation(): void {
    if (this.coordinator.humanIsFront) {
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
      this.coordinator.maxMoves &&
      this.recordManager.record.current.ply >= this.coordinator.maxMoves &&
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
    if (info && this.coordinator.enableComment) {
      const engineName =
        move.color === Color.BLACK ? this.blackPlayerSettings.name : this.whitePlayerSettings.name;
      this.recordManager.appendSearchComment(
        SearchInfoSenderType.PLAYER,
        this.coordinator.searchCommentFormat,
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
      this.coordinator.jishogiRule == JishogiRule.TRY &&
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
      this.coordinator.jishogiRule == JishogiRule.NONE ||
      this.coordinator.jishogiRule == JishogiRule.TRY
    ) {
      this.end(SpecialMoveType.FOUL_LOSE);
      return;
    }
    const rule =
      this.coordinator.jishogiRule == JishogiRule.GENERAL24
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
    if (player?.isEngine() && !this.coordinator.enableEngineTimeout) {
      player.stop().catch((e) => {
        this.onError(new Error(`GameManager#timeout: ${t.failedToSendStopCommand}: ${e}`));
      });
      return;
    }
    // 時間切れ負けで対局を終了する。
    this.end(SpecialMoveType.TIMEOUT);
  }

  stop(): void {
    const timer = setInterval(() => {
      switch (this.state) {
        case GameState.ACTIVE:
        case GameState.PENDING:
          clearInterval(timer);
          this.end(SpecialMoveType.INTERRUPT);
          break;
        case GameState.IDLE:
          clearInterval(timer);
          break;
      }
    }, 100);
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
        const gameResult = this.addGameResults(color, specialMoveType);
        if (gameResult && this.currentGameConditions) {
          this.onGameResult({
            gameIndex: this.currentGameConditions.gameIndex,
            pairIndex: this.currentGameConditions.pairIndex,
            result: gameResult,
          });
        }
        // 自動保存が有効な場合は棋譜を保存する。
        if (this.coordinator.enableAutoSave) {
          this.onSaveRecord(this.coordinator.autoSaveDirectory);
        }
        // 次の対局の設定を取得する。
        const nextGameConditions = this.coordinator.next(this.recordManager);
        if (nextGameConditions instanceof Error) {
          this.onError(new Error(`GameManager#end: ${nextGameConditions.message}`));
        }
        // 連続対局の終了条件を満たす場合または中断が要求された場合、エラーが発生した場合は対局を終了する。
        const complete =
          specialMoveType === SpecialMoveType.INTERRUPT ||
          nextGameConditions === null ||
          nextGameConditions instanceof Error;
        if (complete) {
          // プレイヤーを解放する。
          this.closePlayers()
            .catch((e) => {
              this.onError(e);
            })
            .finally(() => {
              this.state = GameState.IDLE;
              this.onClosed(this.results, specialMoveType);
            });
          return;
        }
        // 次の対局を開始する。
        this.state = GameState.STARTING;
        this.goNextGame(nextGameConditions).catch((e) => {
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

  private addGameResults(color: Color, specialMoveType: SpecialMoveType): GameResult | null {
    const player1Color = this.swapped ? Color.WHITE : Color.BLACK;
    const gameResult = specialMoveToPlayerGameResult(color, player1Color, specialMoveType);
    switch (gameResult) {
      case GameResult.WIN:
        this._results.player1.win++;
        if (player1Color === Color.BLACK) {
          this._results.player1.winBlack++;
        } else {
          this._results.player1.winWhite++;
        }
        break;
      case GameResult.LOSE:
        this._results.player2.win++;
        if (player1Color === Color.BLACK) {
          this._results.player2.winWhite++;
        } else {
          this._results.player2.winBlack++;
        }
        break;
      case GameResult.DRAW:
        this._results.draw++;
        break;
      default:
        this._results.invalid++;
        break;
    }
    this._results.total++;
    return gameResult;
  }

  private swapPlayers(): void {
    this.swapped = !this.swapped;
    [this.blackPlayerSettings, this.whitePlayerSettings] = [
      this.whitePlayerSettings,
      this.blackPlayerSettings,
    ];
    [this.blackTimeLimit, this.whiteTimeLimit] = [this.whiteTimeLimit, this.blackTimeLimit];
    [this.blackPlayer, this.whitePlayer] = [this.whitePlayer, this.blackPlayer];
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
