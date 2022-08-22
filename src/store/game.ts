import { LogLevel } from "@/ipc/log";
import api from "@/ipc/api";
import { GameResult, Player } from "@/players/player";
import { humanPlayer } from "@/players/human";
import { USIPlayer } from "@/players/usi";
import {
  defaultGameSetting,
  GameSetting,
  PlayerSetting,
} from "@/settings/game";
import { Color, Move, reverseColor, SpecialMove } from "@/shogi";
import * as uri from "@/uri";
import { RecordManager } from "./record";
import { Clock } from "./clock";

export interface PlayerBuilder {
  build(playerSetting: PlayerSetting): Promise<Player>;
}

export const defaultPlayerBuilder: PlayerBuilder = {
  async build(playerSetting: PlayerSetting): Promise<Player> {
    if (playerSetting.uri === uri.ES_HUMAN) {
      return humanPlayer;
    } else if (uri.isUSIEngine(playerSetting.uri) && playerSetting.usi) {
      const player = new USIPlayer(playerSetting.usi);
      await player.launch();
      return player;
    }
    throw new Error("予期せぬプレイヤーURIです: " + playerSetting.uri);
  },
};

export interface GameHandlers {
  onEndGame(specialMove?: SpecialMove): void;
  onPieceBeat(): void;
  onBeepShort(): void;
  onBeepUnlimited(): void;
  onStopBeep(): void;
  onError(e: unknown): void;
}

enum GameState {
  IDLE = "idle",
  ACTIVE = "active",
  PENDING = "pending",
  BUSSY = "bussy",
}

export class GameManager {
  private state: GameState;
  private blackClock: Clock;
  private whiteClock: Clock;
  private _setting: GameSetting;
  private blackPlayer?: Player;
  private whitePlayer?: Player;
  private lastEventID: number;

  constructor(
    private recordManager: RecordManager,
    private playerBuilder: PlayerBuilder,
    private handlers: GameHandlers
  ) {
    this.state = GameState.IDLE;
    this.blackClock = new Clock({ timeMs: 0, byoyomi: 0, increment: 0 });
    this.whiteClock = new Clock({ timeMs: 0, byoyomi: 0, increment: 0 });
    this._setting = defaultGameSetting();
    this.lastEventID = 0;
  }

  get blackTimeMs(): number {
    return this.blackClock.timeMs;
  }

  get blackByoyomi(): number {
    return this.blackClock.byoyomi;
  }

  get whiteTimeMs(): number {
    return this.whiteClock.timeMs;
  }

  get whiteByoyomi(): number {
    return this.whiteClock.byoyomi;
  }

  get setting(): GameSetting {
    return this._setting;
  }

  async startGame(setting: GameSetting): Promise<void> {
    if (this.state !== GameState.IDLE) {
      throw Error(
        "前回の対局が正常に終了できていません。アプリを再起動してください。"
      );
    }
    if (setting.startPosition) {
      this.recordManager.reset(setting.startPosition);
    }
    this.recordManager.setGameStartMetadata({
      blackName: setting.black.name,
      whiteName: setting.white.name,
      timeLimit: setting.timeLimit,
    });
    const clockSetting = {
      timeMs: setting.timeLimit.timeSeconds * 1e3,
      byoyomi: setting.timeLimit.byoyomi,
      increment: setting.timeLimit.increment,
      onBeepShort: () => this.handlers.onBeepShort(),
      onBeepUnlimited: () => this.handlers.onBeepUnlimited(),
      onStopBeep: () => this.handlers.onStopBeep(),
    };
    this.blackClock = new Clock({
      ...clockSetting,
      onTimeout: () => {
        this.timeout(Color.BLACK);
      },
    });
    this.whiteClock = new Clock({
      ...clockSetting,
      onTimeout: () => {
        this.timeout(Color.WHITE);
      },
    });
    this._setting = setting;
    try {
      this.blackPlayer = await this.playerBuilder.build(setting.black);
      this.whitePlayer = await this.playerBuilder.build(setting.white);
    } catch (e) {
      try {
        await this.closePlayers();
      } catch (errorOnClose) {
        this.handlers.onError(errorOnClose);
      }
      throw e;
    }
    this.state = GameState.ACTIVE;
    setTimeout(() => this.next());
  }

  private next(): void {
    if (this.state !== GameState.ACTIVE) {
      this.handlers.onError(
        "予期せぬステータスです: GameManager.next(): " + this.state
      );
      return;
    }
    const color = this.recordManager.record.position.color;
    this.getActiveClock().start();
    const player = this.getPlayer(color);
    const ponderPlayer = this.getPlayer(reverseColor(color));
    if (!player || !ponderPlayer) {
      this.handlers.onError(
        "致命的なエラーが発生しました: GameManager.next(): player is undefined"
      );
      return;
    }
    const eventID = this.issueEventID();
    player
      .startSearch(
        this.recordManager.record,
        this.setting,
        this.blackTimeMs,
        this.whiteTimeMs,
        {
          onMove: (move: Move) => this.onMove(eventID, move),
          onResign: () => this.onResign(eventID),
          onWin: () => this.onWin(eventID),
          onError: (e) => this.handlers.onError(e),
        }
      )
      .catch((e) => {
        this.handlers.onError(
          new Error("プレイヤーにコマンドを送信できませんでした: " + e)
        );
      });
    ponderPlayer
      .startPonder(
        this.recordManager.record,
        this.setting,
        this.blackTimeMs,
        this.whiteTimeMs
      )
      .catch((e) => {
        this.handlers.onError(
          new Error("プレイヤーにPonderコマンドを送信できませんでした: " + e)
        );
      });
  }

  private onMove(eventID: number, move: Move): void {
    if (eventID !== this.lastEventID) {
      api.log(LogLevel.WARN, "指し手を受信しましたが既にイベントは無効です。");
      return;
    }
    if (this.state !== GameState.ACTIVE) {
      api.log(
        LogLevel.WARN,
        "指し手を受信しましたが既に対局中ではありません。"
      );
      return;
    }
    if (!this.recordManager.record.position.isValidMove(move)) {
      this.handlers.onError("反則手: " + move.getDisplayText());
      this.endGame(SpecialMove.FOUL_LOSE);
      return;
    }
    this.getActiveClock().stop();
    this.recordManager.appendMove({
      move,
      moveOption: { ignoreValidation: true },
      elapsedMs: this.getActiveClock().elapsedMs,
    });
    this.handlers.onPieceBeat();
    const faulColor = this.recordManager.record.perpetualCheck;
    if (faulColor) {
      if (faulColor === this.recordManager.record.position.color) {
        this.endGame(SpecialMove.FOUL_LOSE);
        return;
      } else {
        this.endGame(SpecialMove.FOUL_WIN);
        return;
      }
    } else if (this.recordManager.record.repetition) {
      this.endGame(SpecialMove.REPETITION_DRAW);
      return;
    }
    this.next();
  }

  private onResign(eventID: number): void {
    if (eventID !== this.lastEventID) {
      api.log(LogLevel.WARN, "投了を受信しましたが既にイベントは無効です。");
      return;
    }
    if (this.state !== GameState.ACTIVE) {
      api.log(LogLevel.WARN, "投了を受信しましたが既に対局中ではありません。");
      return;
    }
    this.endGame(SpecialMove.RESIGN);
  }

  private onWin(eventID: number): void {
    if (eventID !== this.lastEventID) {
      api.log(
        LogLevel.WARN,
        "勝ち宣言を受信しましたが既にイベントは無効です。"
      );
      return;
    }
    if (this.state !== GameState.ACTIVE) {
      api.log(
        LogLevel.WARN,
        "勝ち宣言を受信しましたが既に対局中ではありません。"
      );
      return;
    }
    this.endGame(SpecialMove.ENTERING_OF_KING);
  }

  private onTimeout(): void {
    if (this.state !== GameState.ACTIVE) {
      this.handlers.onError(
        "予期せぬステータスです: GameManager.onTimeout(): " + this.state
      );
      return;
    }
    this.endGame(SpecialMove.TIMEOUT);
  }

  private timeout(color: Color): void {
    this.handlers.onStopBeep();
    const player = this.getPlayer(color);
    if (player && player.isEngine() && !this.setting.enableEngineTimeout) {
      player.stop().catch((e) => {
        this.handlers.onError(
          new Error("プレイヤーにコマンドを送信できませんでした: " + e)
        );
      });
      return;
    }
    this.onTimeout();
  }

  endGame(specialMove?: SpecialMove): void {
    if (this.state !== GameState.ACTIVE && this.state !== GameState.PENDING) {
      return;
    }
    this.state = GameState.BUSSY;
    Promise.resolve()
      .then(() => {
        if (!specialMove) {
          return;
        }
        const color = this.recordManager.record.position.color;
        return this.sendGameResults(color, specialMove);
      })
      .then(() => {
        return this.closePlayers();
      })
      .then(() => {
        this.getActiveClock().pause();
        this.recordManager.appendMove({
          move: specialMove || SpecialMove.INTERRUPT,
          elapsedMs: this.getActiveClock().elapsedMs,
        });
        this.recordManager.setGameEndMetadata();
        this.state = GameState.IDLE;
        this.handlers.onEndGame(specialMove);
      })
      .catch((e) => {
        this.handlers.onError(e);
        this.state = GameState.PENDING;
      });
  }

  private async sendGameResults(
    color: Color,
    specialMove: SpecialMove
  ): Promise<void> {
    if (this.blackPlayer) {
      const gameResult = this.getGameResult(color, Color.BLACK, specialMove);
      if (gameResult) {
        await this.blackPlayer.gameover(gameResult);
      }
    }
    if (this.whitePlayer) {
      const gameResult = this.getGameResult(color, Color.WHITE, specialMove);
      if (gameResult) {
        await this.whitePlayer.gameover(gameResult);
      }
    }
  }

  private getGameResult(
    currentColor: Color,
    playerColor: Color,
    specialMove: SpecialMove
  ): GameResult | null {
    switch (specialMove) {
      case SpecialMove.FOUL_WIN:
      case SpecialMove.ENTERING_OF_KING:
        return currentColor == playerColor ? GameResult.WIN : GameResult.LOSE;
      case SpecialMove.RESIGN:
      case SpecialMove.MATE:
      case SpecialMove.TIMEOUT:
      case SpecialMove.FOUL_LOSE:
        return currentColor == playerColor ? GameResult.LOSE : GameResult.WIN;
      case SpecialMove.DRAW:
      case SpecialMove.REPETITION_DRAW:
        return GameResult.DRAW;
    }
    return null;
  }

  private async closePlayers(): Promise<void> {
    if (this.blackPlayer) {
      await this.blackPlayer.close();
      this.blackPlayer = undefined;
    }
    if (this.whitePlayer) {
      await this.whitePlayer.close();
      this.whitePlayer = undefined;
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
