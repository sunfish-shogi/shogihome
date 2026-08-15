// WebAssembly エンジンの USI セッション管理。
//
// Electron 版の src/background/usi/{engine,index}.ts と役割は同じだが、
// renderer から background を参照できないため独立した実装になっている。
// Web で不要な機能 (統計収集・prompt 連携・早期 ponder の回避策) は持たない。
// USI の汎用実装ではなく、あくまで WebAssembly エンジンを動かすためのものである。
import { Command, CommandType, newCommand } from "@/common/advanced/command.js";
import { USISessionState } from "@/common/advanced/monitor.js";
import { GameResult } from "@/common/game/result.js";
import { TimeStates } from "@/common/game/time.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import { t } from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import {
  emptyUSIEngine,
  getUSIEngineOptionCurrentValue,
  USIEngine,
  USIEngineLaunchOptions,
  USIEngineOptions,
  USIHash,
  USIPonder,
} from "@/common/settings/usi.js";
import * as uri from "@/common/uri.js";
import { getNextColorFromUSI } from "tsshogi";
import {
  buildTimeOptions,
  parseBestMove,
  parseInfoCommand,
  parseOptionCommand,
} from "./protocol.js";
import { EngineTransport, EngineTransportFactory } from "./transport.js";

const DEFAULT_TIMEOUT_SECONDS = 10;
// 終了したセッションを monitor 画面から見られるように、少しの間だけ残す。
const SESSION_REMOVE_DELAY_MS = 20 * 1e3;
const USI_HASH_OPTION_ORDER = 1;
const USI_PONDER_OPTION_ORDER = 2;
const USER_DEFINED_OPTION_ORDER_START = 100;

export type USILogger = (level: LogLevel, message: string) => void;

export enum SessionState {
  WAITING_FOR_USIOK = "waitingForUSIOK",
  NOT_READY = "notReady",
  WAITING_FOR_READYOK = "waitingForReadyOK",
  READY = "ready",
  WAITING_FOR_BEST_MOVE = "waitingForBestMove",
  WAITING_FOR_CHECKMATE = "waitingForCheckmate",
  QUIT_COMPLETED = "quitCompleted",
}

export type USISessionHandlers = {
  onUSIBestMove(sessionID: number, usi: string, usiMove: string, ponder?: string): void;
  onUSICheckmate(sessionID: number, usi: string, usiMoves: string[]): void;
  onUSICheckmateNotImplemented(sessionID: number): void;
  onUSICheckmateTimeout(sessionID: number, usi: string): void;
  onUSINoMate(sessionID: number, usi: string): void;
  onUSIInfo(sessionID: number, usi: string, info: USIInfoCommand): void;
};

type SessionCallbacks = {
  onUSIOk?: () => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

// エンジン 1 つ分のセッション。USI プロトコルの状態遷移を担う。
class Session {
  readonly createdMs = Date.now();
  private transport: EngineTransport;
  private state = SessionState.WAITING_FOR_USIOK;
  private engineName = "NO NAME";
  private engineAuthor = "";
  private engineOptions: USIEngineOptions = {};
  private currentPosition = "";
  private lastSentCommand?: Command;
  private lastReceivedCommand?: Command;
  private launchTimer?: ReturnType<typeof setTimeout>;
  private callbacks: SessionCallbacks = {};

  constructor(
    readonly sessionID: number,
    readonly engine: USIEngine,
    transportFactory: EngineTransportFactory,
    private launchOptions: USIEngineLaunchOptions,
    private handlers: () => USISessionHandlers | undefined,
    private logger?: USILogger,
  ) {
    this.transport = transportFactory(engine.path);
    this.transport
      .on("receive", (line) => this.onReceive(line))
      .on("error", (error) => this.callbacks.onError?.(error))
      .on("close", () => this.onClose());
  }

  get sessionState(): SessionState {
    return this.state;
  }

  get name(): string {
    return this.engineName;
  }

  get author(): string {
    return this.engineAuthor;
  }

  get options(): USIEngineOptions {
    return this.engineOptions;
  }

  get closed(): boolean {
    return this.state === SessionState.QUIT_COMPLETED;
  }

  get lastSent(): Command | undefined {
    return this.lastSentCommand;
  }

  get lastReceived(): Command | undefined {
    return this.lastReceivedCommand;
  }

  get timeoutSeconds(): number {
    return this.launchOptions.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
  }

  setCallbacks(callbacks: SessionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  launch(): void {
    const timeoutSeconds = this.timeoutSeconds;
    this.launchTimer = setTimeout(() => {
      this.launchTimer = undefined;
      this.callbacks.onError?.(
        new Error(t.noResponseFromEnginePleaseExtendTimeout(timeoutSeconds)),
      );
    }, timeoutSeconds * 1e3);
    this.send("usi");
  }

  ready(): void {
    // 通常は対局の終わりに gameover が送られるが、異常終了時には送られないことがある。
    // その場合でも次の対局を始められるよう、ここで終局を通知して思考を打ち切る。
    // 勝敗は判断できないので引き分け扱いにする (Electron 版と同じ)。
    if (
      this.state === SessionState.WAITING_FOR_BEST_MOVE ||
      this.state === SessionState.WAITING_FOR_CHECKMATE
    ) {
      this.gameover(GameResult.DRAW);
    }
    if (this.state !== SessionState.NOT_READY && this.state !== SessionState.READY) {
      this.callbacks.onError?.(new Error(`unexpected state: ${this.state}`));
      return;
    }
    this.state = SessionState.WAITING_FOR_READYOK;
    this.send("isready");
  }

  setOption(name: string, value?: string | number): void {
    this.send(
      value !== undefined ? `setoption name ${name} value ${value}` : `setoption name ${name}`,
    );
  }

  go(usi: string, timeStates?: TimeStates): void {
    this.currentPosition = usi;
    this.state = SessionState.WAITING_FOR_BEST_MOVE;
    this.send(usi);
    this.send(
      timeStates ? `go ${buildTimeOptions(getNextColorFromUSI(usi), timeStates)}` : "go infinite",
    );
  }

  goPonder(usi: string, timeStates: TimeStates): void {
    this.currentPosition = usi;
    this.state = SessionState.WAITING_FOR_BEST_MOVE;
    this.send(usi);
    this.send(`go ponder ${buildTimeOptions(getNextColorFromUSI(usi), timeStates)}`);
  }

  ponderHit(timeStates: TimeStates): void {
    this.send(
      `ponderhit ${buildTimeOptions(getNextColorFromUSI(this.currentPosition), timeStates)}`,
    );
  }

  goMate(usi: string, maxSeconds?: number): void {
    this.currentPosition = usi;
    this.state = SessionState.WAITING_FOR_CHECKMATE;
    this.send(usi);
    this.send(maxSeconds ? `go mate ${maxSeconds * 1e3}` : "go mate infinite");
  }

  stop(): void {
    this.send("stop");
  }

  gameover(result: GameResult): void {
    switch (this.state) {
      case SessionState.WAITING_FOR_USIOK:
      case SessionState.NOT_READY:
      case SessionState.WAITING_FOR_READYOK:
      case SessionState.QUIT_COMPLETED:
        this.logger?.(
          LogLevel.WARN,
          `usi: sid=${this.sessionID}: gameover: unexpected state: ${this.state}`,
        );
        return;
      case SessionState.WAITING_FOR_BEST_MOVE:
      case SessionState.WAITING_FOR_CHECKMATE:
        // 対局を終えるので思考を打ち切る。
        this.stop();
        break;
    }
    switch (result) {
      case GameResult.WIN:
        this.send("gameover win");
        break;
      case GameResult.LOSE:
        this.send("gameover lose");
        break;
      case GameResult.DRAW:
        this.send("gameover draw");
        break;
    }
    // 次の対局に備えて未初期化の状態に戻す。連続対局では同じセッションに対して
    // もう一度 ready() が呼ばれるため、思考中のまま残してはいけない。
    // 打ち切った探索から遅れて届く bestmove は onBestMove の状態チェックが捨てる。
    this.state = SessionState.NOT_READY;
    this.currentPosition = "";
  }

  quit(): void {
    if (this.state === SessionState.QUIT_COMPLETED) {
      return;
    }
    this.send("quit");
    // WebAssembly エンジンは quit に応答しないため、待たずに Worker を終了させる。
    this.transport.close();
  }

  private clearLaunchTimer(): void {
    if (this.launchTimer !== undefined) {
      clearTimeout(this.launchTimer);
      this.launchTimer = undefined;
    }
  }

  private send(command: string): void {
    if (this.state === SessionState.QUIT_COMPLETED) {
      return;
    }
    this.lastSentCommand = newCommand(CommandType.SEND, command);
    this.logger?.(LogLevel.INFO, `usi: sid=${this.sessionID}: > ${command}`);
    this.transport.send(command);
  }

  private onReceive(command: string): void {
    this.lastReceivedCommand = newCommand(CommandType.RECEIVE, command);
    this.logger?.(LogLevel.INFO, `usi: sid=${this.sessionID}: < ${command}`);
    if (command.startsWith("id name ")) {
      this.engineName = command.substring(8);
    } else if (command.startsWith("id author ")) {
      this.engineAuthor = command.substring(10);
    } else if (command.startsWith("option ")) {
      const option = parseOptionCommand(
        command.substring(7),
        USER_DEFINED_OPTION_ORDER_START + Object.keys(this.engineOptions).length,
      );
      if (option) {
        this.engineOptions[option.name] = option;
      }
    } else if (command === "usiok") {
      this.onUSIOk();
    } else if (command === "readyok") {
      this.onReadyOk();
    } else if (command.startsWith("bestmove ")) {
      this.onBestMove(command.substring(9));
    } else if (command.startsWith("checkmate ")) {
      this.onCheckmate(command.substring(10));
    } else if (command.startsWith("info ")) {
      if (!this.launchOptions.discardUSIInfo) {
        this.handlers()?.onUSIInfo(
          this.sessionID,
          this.currentPosition,
          parseInfoCommand(command.substring(5)),
        );
      }
    }
  }

  private onUSIOk(): void {
    if (this.state !== SessionState.WAITING_FOR_USIOK) {
      return;
    }
    // USI の予約オプションはエンジンが宣言していなくても GUI から設定できるようにする。
    // (Electron 版と挙動を揃えている)
    if (!this.engineOptions[USIHash]) {
      this.engineOptions[USIHash] = {
        name: USIHash,
        type: "spin",
        order: USI_HASH_OPTION_ORDER,
        default: 32,
      };
    }
    if (!this.engineOptions[USIPonder]) {
      this.engineOptions[USIPonder] = {
        name: USIPonder,
        type: "check",
        order: USI_PONDER_OPTION_ORDER,
        default: "true",
      };
    }
    for (const option of Object.values(this.engine.options)) {
      const value = getUSIEngineOptionCurrentValue(option);
      if (value !== undefined) {
        this.setOption(option.name, value);
      }
    }
    this.clearLaunchTimer();
    this.state = SessionState.NOT_READY;
    this.callbacks.onUSIOk?.();
  }

  private onReadyOk(): void {
    if (this.state !== SessionState.WAITING_FOR_READYOK) {
      return;
    }
    this.state = SessionState.READY;
    this.send("usinewgame");
    this.callbacks.onReady?.();
  }

  private onBestMove(args: string): void {
    if (this.state !== SessionState.WAITING_FOR_BEST_MOVE) {
      return;
    }
    this.state = SessionState.READY;
    const usi = this.currentPosition;
    this.currentPosition = "";
    const bestMove = parseBestMove(args);
    this.handlers()?.onUSIBestMove(this.sessionID, usi, bestMove.move, bestMove.ponder);
  }

  private onCheckmate(args: string): void {
    if (this.state !== SessionState.WAITING_FOR_CHECKMATE) {
      return;
    }
    this.state = SessionState.READY;
    const usi = this.currentPosition;
    const handlers = this.handlers();
    const value = args.trim();
    if (value === "notimplemented") {
      handlers?.onUSICheckmateNotImplemented(this.sessionID);
    } else if (value === "timeout") {
      handlers?.onUSICheckmateTimeout(this.sessionID, usi);
    } else if (value === "nomate") {
      handlers?.onUSINoMate(this.sessionID, usi);
    } else {
      handlers?.onUSICheckmate(this.sessionID, usi, value.split(" "));
    }
  }

  private onClose(): void {
    this.clearLaunchTimer();
    this.state = SessionState.QUIT_COMPLETED;
    this.callbacks.onClose?.();
  }
}

export class USISessionManager {
  private sessions = new Map<number, Session>();
  private lastSessionID = 0;
  private handlers?: USISessionHandlers;

  constructor(
    private transportFactory: EngineTransportFactory,
    private logger?: USILogger,
  ) {}

  setHandlers(handlers: USISessionHandlers): void {
    this.handlers = handlers;
  }

  private issueSessionID(): number {
    this.lastSessionID += 1;
    return this.lastSessionID;
  }

  private getSession(sessionID: number): Session {
    const session = this.sessions.get(sessionID);
    if (!session) {
      throw new Error("No engine session: SessionID=" + sessionID);
    }
    return session;
  }

  private newSession(engine: USIEngine, options: USIEngineLaunchOptions): Session {
    const sessionID = this.issueSessionID();
    const session = new Session(
      sessionID,
      engine,
      this.transportFactory,
      options,
      () => this.handlers,
      this.logger,
    );
    this.sessions.set(sessionID, session);
    return session;
  }

  // 一時的にエンジンを起動して情報を取得する。オプションダイアログの再取得で使う。
  getEngineInfo(path: string, timeoutSeconds: number): Promise<USIEngine> {
    return new Promise<USIEngine>((resolve, reject) => {
      let settled = false;
      const session = this.newSession({ ...emptyUSIEngine(), path }, { timeoutSeconds });
      session.setCallbacks({
        onUSIOk: () => {
          settled = true;
          resolve({
            ...emptyUSIEngine(),
            uri: uri.issueEngineURI(),
            name: session.name,
            defaultName: session.name,
            author: session.author,
            path,
            options: session.options,
          });
          this.close(session);
        },
        onError: (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
          this.close(session);
        },
        onClose: () => {
          if (!settled) {
            settled = true;
            reject(new Error(t.engineProcessWasClosedUnexpectedly));
          }
          this.sessions.delete(session.sessionID);
        },
      });
      session.launch();
    });
  }

  sendOptionButtonSignal(path: string, name: string, timeoutSeconds: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const session = this.newSession({ ...emptyUSIEngine(), path }, { timeoutSeconds });
      session.setCallbacks({
        onUSIOk: () => {
          settled = true;
          session.setOption(name);
          resolve();
          this.close(session);
        },
        onError: (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
          this.close(session);
        },
        onClose: () => {
          if (!settled) {
            settled = true;
            reject(new Error(t.engineProcessWasClosedUnexpectedly));
          }
          this.sessions.delete(session.sessionID);
        },
      });
      session.launch();
    });
  }

  setupPlayer(engine: USIEngine, options?: USIEngineLaunchOptions): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let settled = false;
      const session = this.newSession(engine, options || {});
      session.setCallbacks({
        onUSIOk: () => {
          settled = true;
          resolve(session.sessionID);
        },
        onError: (error) => {
          if (!settled) {
            settled = true;
            reject(error);
            this.close(session);
          }
        },
        onClose: () => {
          if (!settled) {
            settled = true;
            reject(new Error(t.engineProcessWasClosedUnexpectedly));
          }
          this.scheduleRemove(session);
        },
      });
      session.launch();
    });
  }

  ready(sessionID: number): Promise<void> {
    const session = this.getSession(sessionID);
    return new Promise<void>((resolve, reject) => {
      session.setCallbacks({
        onReady: () => resolve(),
        onError: (error) => reject(error),
      });
      session.ready();
    });
  }

  setOption(sessionID: number, name: string, value: string): void {
    this.getSession(sessionID).setOption(name, value);
  }

  go(sessionID: number, usi: string, timeStates: TimeStates): void {
    this.getSession(sessionID).go(usi, timeStates);
  }

  goPonder(sessionID: number, usi: string, timeStates: TimeStates): void {
    this.getSession(sessionID).goPonder(usi, timeStates);
  }

  ponderHit(sessionID: number, timeStates: TimeStates): void {
    this.getSession(sessionID).ponderHit(timeStates);
  }

  goInfinite(sessionID: number, usi: string): void {
    this.getSession(sessionID).go(usi);
  }

  goMate(sessionID: number, usi: string, maxSeconds?: number): void {
    this.getSession(sessionID).goMate(usi, maxSeconds);
  }

  stop(sessionID: number): void {
    this.getSession(sessionID).stop();
  }

  gameover(sessionID: number, result: GameResult): void {
    this.getSession(sessionID).gameover(result);
  }

  quit(sessionID: number): void {
    const session = this.sessions.get(sessionID);
    if (session) {
      this.close(session);
    }
  }

  quitAll(): void {
    for (const session of Array.from(this.sessions.values())) {
      this.close(session);
    }
  }

  isActiveSessionExists(): boolean {
    for (const session of this.sessions.values()) {
      if (!session.closed) {
        return true;
      }
    }
    return false;
  }

  private close(session: Session): void {
    session.quit();
    this.sessions.delete(session.sessionID);
  }

  private scheduleRemove(session: Session): void {
    setTimeout(() => this.sessions.delete(session.sessionID), SESSION_REMOVE_DELAY_MS);
  }

  collectSessionStates(): USISessionState[] {
    return Array.from(this.sessions.values())
      .map((session) => ({
        sessionID: session.sessionID,
        uri: session.engine.uri,
        name: session.engine.name,
        path: session.engine.path,
        stateCode: session.sessionState,
        createdMs: session.createdMs,
        lastReceived: session.lastReceived,
        lastSent: session.lastSent,
        updatedMs: Date.now(),
        closed: session.closed,
      }))
      .sort((a, b) => b.sessionID - a.sessionID);
  }
}
