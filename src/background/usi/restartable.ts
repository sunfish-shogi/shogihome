import { Color, getNextColorFromUSI } from "tsshogi";
import { Logger } from "@/background/log.js";
import {
  addCommand,
  Command,
  CommandHistory,
  CommandType,
  newCommand,
} from "@/common/advanced/command.js";
import {
  BestmoveCallback,
  CheckmateCallback,
  CheckmateEndCallback,
  CheckmateNotImplementedCallback,
  CheckmateTimeoutCallback,
  CloseCallback,
  CommandCallback,
  EngineProcess,
  EngineProcessOption,
  ErrorCallback,
  GameResult,
  GoEndCallback,
  InfoCallback,
  NoMateCallback,
  ReadyCallback,
  State,
  TimeoutCallback,
  TimeState,
  USIEngineProcess,
  USIOKCallback,
} from "./engine.js";

/** 1 局あたりの再起動回数の上限 */
export const maxRestartsPerGame = 3;
/** 1 回の再起動での起動の試行回数の上限 */
export const maxLaunchAttempts = 2;
/** 起動に失敗してから再試行するまでの待ち時間 */
export const launchRetryIntervalMs = 1000;

export type USIEngineRestartEvent =
  { type: "crashed" } | { type: "restarted"; elapsedMs: number } | { type: "failed"; error: Error };

export type RestartableEngineProcessHooks = {
  onRestartEvent?: (event: USIEngineRestartEvent) => void;
  /** 経過時間の計測に使う単調時計 (ミリ秒) */
  now?: () => number;
  /** 内部のプロセスを生成する関数 (テスト用) */
  createProcess?: () => EngineProcess;
};

type PendingRequest =
  | { type: "search"; position: string; timeState: TimeState; requestedAt: number }
  | { type: "ponder"; position: string }
  | { type: "other"; position: string };

type RestartPhase = "launching" | "readying" | "waitingForRetry";

type Callbacks = {
  timeout?: TimeoutCallback;
  error?: ErrorCallback;
  close?: CloseCallback;
  usiok?: USIOKCallback;
  ready?: ReadyCallback;
  bestmove?: BestmoveCallback;
  goEnd?: GoEndCallback;
  checkmate?: CheckmateCallback;
  checkmateNotImplemented?: CheckmateNotImplementedCallback;
  checkmateTimeout?: CheckmateTimeoutCallback;
  checkmateEnd?: CheckmateEndCallback;
  noMate?: NoMateCallback;
  info?: InfoCallback;
  command?: CommandCallback;
};

/**
 * 探索を要求された時点からの経過時間を手番側の持ち時間から差し引いた TimeState を返す。
 * TimeState は USI の形式 (btime/wtime は加算時間を含まない) であることを前提とする。
 */
export function deductElapsedTime(
  position: string,
  timeState: TimeState,
  elapsedMs: number,
): TimeState {
  const color = getNextColorFromUSI(position);
  const elapsed = Math.max(0, elapsedMs);
  const isBlack = color === Color.BLACK;
  let time = isBlack ? timeState.btime : timeState.wtime;
  let inc = isBlack ? timeState.binc : timeState.winc;
  let byoyomi = timeState.byoyomi;
  if (inc > 0) {
    // フィッシャー: 加算時間を含めた残り時間から差し引き、足りなくなったら加算時間から差し引く。
    const rest = Math.max(0, time + inc - elapsed);
    if (rest >= inc) {
      time = rest - inc;
    } else {
      time = 0;
      inc = rest;
    }
  } else {
    // 秒読み・切れ負け: 持ち時間から差し引き、足りなくなったら秒読みから差し引く。
    const rest = time - elapsed;
    if (rest >= 0) {
      time = rest;
    } else {
      time = 0;
      byoyomi = Math.max(0, byoyomi + rest);
    }
  }
  const floor = (n: number) => Math.max(0, Math.floor(n));
  return {
    btime: floor(isBlack ? time : timeState.btime),
    wtime: floor(isBlack ? timeState.wtime : time),
    byoyomi: floor(byoyomi),
    binc: floor(isBlack ? inc : timeState.binc),
    winc: floor(isBlack ? timeState.winc : inc),
  };
}

/**
 * 対局中にエンジンのプロセスが異常終了した場合に、新しいプロセスを起動して探索をやり直す EngineProcess のラッパー。
 * 仕様は specs/engine-crash-recovery.md を参照。
 */
export class RestartableEngineProcess implements USIEngineProcess {
  private inner?: EngineProcess;
  private generation = 0;
  private launched = false;
  private closed = false;
  private quitRequested = false;
  private inGame = false;
  private readyPending = false;
  private pending?: PendingRequest;
  private stopRequested = false;
  private pendingGameover?: GameResult;
  private options = new Map<string, string | number>();
  private restartCount = 0;
  private restartPhase?: RestartPhase;
  private restartStartedAt = 0;
  private launchAttempt = 0;
  private retryTimer?: NodeJS.Timeout;
  private callbacks: Callbacks = {};
  private _lastReceived?: Command;
  private _lastSent?: Command;
  private history: CommandHistory = { discarded: 0, commands: [] };
  private now: () => number;
  private createProcess: () => EngineProcess;

  constructor(
    path: string,
    private sessionID: number,
    private logger: Logger,
    option: EngineProcessOption,
    private hooks: RestartableEngineProcessHooks = {},
  ) {
    this.now = hooks.now ?? (() => performance.now());
    this.createProcess =
      hooks.createProcess ?? (() => new EngineProcess(path, sessionID, logger, option));
  }

  get state(): State {
    if (this.closed) {
      return State.QuitCompleted;
    }
    if (this.restartPhase) {
      return State.Restarting;
    }
    return this.inner?.state ?? State.QuitCompleted;
  }

  get currentPosition(): string {
    return this.pending?.position ?? this.inner?.currentPosition ?? "";
  }

  get pid(): number | undefined {
    return this.inner?.pid;
  }

  get lastReceived(): Command | undefined {
    return this._lastReceived;
  }

  get lastSent(): Command | undefined {
    return this._lastSent;
  }

  get commandHistory(): CommandHistory {
    return this.history;
  }

  on(event: "timeout", callback: TimeoutCallback): this;
  on(event: "error", callback: ErrorCallback): this;
  on(event: "close", callback: CloseCallback): this;
  on(event: "usiok", callback: USIOKCallback): this;
  on(event: "ready", callback: ReadyCallback): this;
  on(event: "bestmove", callback: BestmoveCallback): this;
  on(event: "goEnd", callback: GoEndCallback): this;
  on(event: "checkmate", callback: CheckmateCallback): this;
  on(event: "checkmateNotImplemented", callback: CheckmateNotImplementedCallback): this;
  on(event: "checkmateTimeout", callback: CheckmateTimeoutCallback): this;
  on(event: "checkmateEnd", callback: CheckmateEndCallback): this;
  on(event: "noMate", callback: NoMateCallback): this;
  on(event: "info", callback: InfoCallback): this;
  on(event: "command", callback: CommandCallback): this;
  on(event: keyof Callbacks, callback: unknown): this {
    (this.callbacks as Record<string, unknown>)[event] = callback;
    return this;
  }

  /** 再起動中でなく、プロセスが利用可能な場合にそのプロセスを返す。 */
  private get activeInner(): EngineProcess | undefined {
    return this.restartPhase ? undefined : this.inner;
  }

  launch(): void {
    this.startProcess();
  }

  ready(): Error | undefined {
    this.restartCount = 0;
    this.inGame = true;
    this.readyPending = true;
    this.pendingGameover = undefined;
    if (this.restartPhase) {
      // 再起動処理の中で isready を送る。
      return;
    }
    if (!this.inner) {
      // 以前の再起動に失敗している場合は、ここで改めて再起動する。
      this.startRestart();
      return;
    }
    const error = this.inner.ready();
    if (error) {
      this.readyPending = false;
    }
    return error;
  }

  setOption(name: string, value?: string | number): void {
    if (value !== undefined) {
      this.options.set(name, value);
    }
    this.activeInner?.setOption(name, value);
  }

  go(position: string, timeState?: TimeState): void {
    this.pending = timeState
      ? { type: "search", position, timeState, requestedAt: this.now() }
      : { type: "other", position };
    this.stopRequested = false;
    this.activeInner?.go(position, timeState);
  }

  goPonder(position: string, timeState: TimeState): void {
    this.pending = { type: "ponder", position };
    this.stopRequested = false;
    this.activeInner?.goPonder(position, timeState);
  }

  goMate(position: string, maxSeconds?: number): void {
    this.pending = { type: "other", position };
    this.stopRequested = false;
    this.activeInner?.goMate(position, maxSeconds);
  }

  ponderHit(timeState: TimeState): void {
    const pending = this.pending;
    if (pending?.type === "ponder") {
      this.pending = {
        type: "search",
        position: pending.position,
        timeState,
        requestedAt: this.now(),
      };
    }
    const inner = this.activeInner;
    if (!inner) {
      return;
    }
    if (inner.state === State.Ready && this.pending?.type === "search") {
      // 再起動によって Ponder が失われているので通常の探索を開始する。
      inner.go(this.pending.position, timeState);
      return;
    }
    inner.ponderHit(timeState);
  }

  stop(): void {
    if (this.pending) {
      this.stopRequested = true;
    }
    this.activeInner?.stop();
  }

  gameover(gameResult: GameResult): void {
    this.pending = undefined;
    this.stopRequested = false;
    this.inGame = false;
    this.readyPending = false;
    if (this.restartPhase) {
      this.pendingGameover = gameResult;
      return;
    }
    this.inner?.gameover(gameResult);
  }

  quit(): void {
    if (this.quitRequested) {
      return;
    }
    this.quitRequested = true;
    this.pending = undefined;
    this.clearRetryTimer();
    if (this.inner && this.inner.state !== State.QuitCompleted) {
      this.inner.quit();
    } else {
      this.close();
    }
  }

  invoke(type: CommandType, command: string): void {
    const inner = this.activeInner;
    if (!inner) {
      this.logger.warn("sid=%d: invoke: engine is not available: %s", this.sessionID, command);
      return;
    }
    inner.invoke(type, command);
  }

  private startProcess(): void {
    this.generation += 1;
    const generation = this.generation;
    const inner = this.createProcess();
    this.inner = inner;
    const isCurrent = () => generation === this.generation && !this.closed;
    inner
      .on("timeout", () => {
        if (!isCurrent()) {
          return;
        }
        if (!this.launched) {
          this.callbacks.timeout?.();
        } else if (this.restartPhase) {
          this.onLaunchFailure(new Error("timeout"));
        }
      })
      .on("error", (e) => {
        if (!isCurrent()) {
          return;
        }
        if (!this.launched) {
          this.callbacks.error?.(e);
        } else {
          // 続く close で異常終了として扱う。
          this.logger.warn("sid=%d: engine process error: %s", this.sessionID, e.message);
        }
      })
      .on("close", () => {
        if (!isCurrent()) {
          return;
        }
        if (this.quitRequested || !this.launched) {
          this.close();
        } else if (this.restartPhase) {
          this.onLaunchFailure(new Error("engine process was closed unexpectedly"));
        } else {
          this.onCrash();
        }
      })
      .on("usiok", () => {
        if (!isCurrent()) {
          return;
        }
        if (!this.launched) {
          this.launched = true;
          this.callbacks.usiok?.();
        } else if (this.restartPhase === "launching") {
          this.onRestartUSIOK();
        }
      })
      .on("ready", (readyTimeMs) => {
        if (!isCurrent()) {
          return;
        }
        if (this.readyPending) {
          this.readyPending = false;
          this.callbacks.ready?.(readyTimeMs);
        }
        if (this.restartPhase === "readying") {
          // EngineProcess は ready コールバックの後で usinewgame を送るので、それを待ってから探索を再開する。
          queueMicrotask(() => {
            if (isCurrent() && this.restartPhase === "readying") {
              this.finishRestart();
            }
          });
        }
      })
      .on("bestmove", (position, move, ponder) => {
        if (!isCurrent()) {
          return;
        }
        this.clearPending(position);
        this.callbacks.bestmove?.(position, move, ponder);
      })
      .on("goEnd", (thinkingTimeMs) => {
        if (isCurrent()) {
          this.callbacks.goEnd?.(thinkingTimeMs);
        }
      })
      .on("checkmate", (position, moves) => {
        if (isCurrent()) {
          this.clearPending(position);
          this.callbacks.checkmate?.(position, moves);
        }
      })
      .on("checkmateNotImplemented", () => {
        if (isCurrent()) {
          this.pending = undefined;
          this.callbacks.checkmateNotImplemented?.();
        }
      })
      .on("checkmateTimeout", (position) => {
        if (isCurrent()) {
          this.clearPending(position);
          this.callbacks.checkmateTimeout?.(position);
        }
      })
      .on("checkmateEnd", (thinkingTimeMs) => {
        if (isCurrent()) {
          this.callbacks.checkmateEnd?.(thinkingTimeMs);
        }
      })
      .on("noMate", (position) => {
        if (isCurrent()) {
          this.clearPending(position);
          this.callbacks.noMate?.(position);
        }
      })
      .on("info", (position, info) => {
        if (isCurrent()) {
          this.callbacks.info?.(position, info);
        }
      })
      .on("command", (command) => {
        // 古いプロセスのコマンドも履歴には残す。
        this.recordCommand(command);
      });
    inner.launch();
  }

  private clearPending(position: string): void {
    if (this.pending?.position === position) {
      this.pending = undefined;
      this.stopRequested = false;
    }
  }

  private recordCommand(command: Command): void {
    switch (command.type) {
      case CommandType.SEND:
        this._lastSent = command;
        break;
      case CommandType.RECEIVE:
        this._lastReceived = command;
        break;
    }
    addCommand(this.history, command, 100, 10);
    this.callbacks.command?.(command);
  }

  private recordSystemCommand(message: string): void {
    this.recordCommand(newCommand(CommandType.SYSTEM, message));
  }

  private onCrash(): void {
    this.logger.warn("sid=%d: engine process crashed", this.sessionID);
    this.inner = undefined;
    this.recordSystemCommand("crashed");
    this.hooks.onRestartEvent?.({ type: "crashed" });
    this.startRestart();
  }

  private startRestart(): void {
    if (this.restartCount >= maxRestartsPerGame) {
      this.failRestart(new Error(`restart limit exceeded: ${maxRestartsPerGame}`));
      return;
    }
    this.restartCount += 1;
    this.restartStartedAt = this.now();
    this.launchAttempt = 0;
    this.launchForRestart();
  }

  private launchForRestart(): void {
    this.launchAttempt += 1;
    this.restartPhase = "launching";
    this.logger.info(
      "sid=%d: restart engine process: restart=%d attempt=%d",
      this.sessionID,
      this.restartCount,
      this.launchAttempt,
    );
    this.recordSystemCommand(`restarting: attempt=${this.launchAttempt}`);
    this.startProcess();
  }

  private onRestartUSIOK(): void {
    const inner = this.inner;
    if (!inner) {
      return;
    }
    // 対局中に変更されたオプションを再送する。
    for (const [name, value] of this.options) {
      inner.setOption(name, value);
    }
    if (!this.inGame) {
      this.finishRestart();
      return;
    }
    this.restartPhase = "readying";
    const error = inner.ready();
    if (error) {
      this.onLaunchFailure(error);
    }
  }

  private finishRestart(): void {
    const inner = this.inner;
    if (!inner) {
      return;
    }
    this.restartPhase = undefined;
    // 再起動中に終局した場合は、ここで gameover を送る。
    if (this.pendingGameover !== undefined) {
      if (inner.state === State.Ready) {
        inner.gameover(this.pendingGameover);
      }
      this.pendingGameover = undefined;
    }
    // 自分の手番の探索だけをやり直す。Ponder は再開しない。
    const pending = this.pending;
    if (pending?.type === "search" && this.inGame) {
      const elapsedMs = this.now() - pending.requestedAt;
      const timeState = deductElapsedTime(pending.position, pending.timeState, elapsedMs);
      this.logger.info(
        "sid=%d: resume search: elapsed=%d ms",
        this.sessionID,
        Math.floor(elapsedMs),
      );
      inner.go(pending.position, timeState);
      if (this.stopRequested) {
        inner.stop();
      }
    }
    const elapsedMs = Math.floor(this.now() - this.restartStartedAt);
    this.logger.info("sid=%d: engine process restarted: %d ms", this.sessionID, elapsedMs);
    this.recordSystemCommand(`restarted: ${elapsedMs} ms`);
    this.hooks.onRestartEvent?.({ type: "restarted", elapsedMs });
  }

  private onLaunchFailure(error: Error): void {
    this.logger.warn(
      "sid=%d: failed to restart engine process: attempt=%d: %s",
      this.sessionID,
      this.launchAttempt,
      error.message,
    );
    const inner = this.inner;
    this.inner = undefined;
    // 古いプロセスからのイベントを無視する。
    this.generation += 1;
    if (inner && inner.state !== State.WillQuit && inner.state !== State.QuitCompleted) {
      inner.quit();
    }
    if (this.launchAttempt >= maxLaunchAttempts) {
      this.failRestart(error);
      return;
    }
    this.restartPhase = "waitingForRetry";
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.quitRequested) {
        this.launchForRestart();
      }
    }, launchRetryIntervalMs);
  }

  private failRestart(error: Error): void {
    this.restartPhase = undefined;
    this.inner = undefined;
    this.pendingGameover = undefined;
    this.logger.error("sid=%d: gave up restarting engine process: %s", this.sessionID, error);
    this.recordSystemCommand(`restart failed: ${error.message}`);
    this.hooks.onRestartEvent?.({ type: "failed", error });
    if (this.readyPending) {
      this.readyPending = false;
      this.callbacks.error?.(error);
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (this.restartPhase === "waitingForRetry") {
      this.restartPhase = undefined;
    }
  }

  private close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.restartPhase = undefined;
    this.clearRetryTimer();
    this.callbacks.close?.();
  }
}
