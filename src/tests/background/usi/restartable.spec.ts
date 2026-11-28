/* eslint-disable @typescript-eslint/no-explicit-any */

import * as log4js from "log4js";
import { GameResult, State } from "@/background/usi/engine.js";
import {
  deductElapsedTime,
  launchRetryIntervalMs,
  maxRestartsPerGame,
  RestartableEngineProcess,
  USIEngineRestartEvent,
} from "@/background/usi/restartable.js";
import { ChildProcess } from "@/background/usi/process.js";
import { MockedClass } from "vitest";

vi.mock("@/background/usi/process.js");

const mockChildProcess = ChildProcess as MockedClass<typeof ChildProcess>;

/** index 番目に起動したプロセスのハンドラーを返す。 */
function getChildProcessHandler(name: string, index: number): any {
  const calls = mockChildProcess.prototype.on.mock.calls.filter((call) => call[0] === name);
  return calls[index][1];
}

function receive(index: number, ...commands: string[]) {
  const onReceive = getChildProcessHandler("receive", index);
  for (const command of commands) {
    onReceive(command);
  }
}

/** 再起動の完了処理 (マイクロタスク) を実行する。 */
async function flush() {
  await Promise.resolve();
}

function crash(index: number) {
  getChildProcessHandler("close", index)(1, null);
}

function sentCommands(): string[] {
  return mockChildProcess.prototype.send.mock.calls.map((call) => call[0]);
}

function launchedProcessCount(): number {
  return mockChildProcess.mock.calls.length;
}

function setup() {
  let clock = 0;
  const events: USIEngineRestartEvent[] = [];
  const engine = new RestartableEngineProcess(
    "/path/to/engine",
    123,
    log4js.getLogger(),
    {},
    {
      onRestartEvent: (event) => events.push(event),
      now: () => clock,
    },
  );
  const handlers = {
    timeout: vi.fn(),
    error: vi.fn(),
    close: vi.fn(),
    usiok: vi.fn(),
    ready: vi.fn(),
    bestmove: vi.fn(),
    goEnd: vi.fn(),
    info: vi.fn(),
  };
  engine
    .on("timeout", handlers.timeout)
    .on("error", handlers.error)
    .on("close", handlers.close)
    .on("usiok", handlers.usiok)
    .on("ready", handlers.ready)
    .on("bestmove", handlers.bestmove)
    .on("goEnd", handlers.goEnd)
    .on("info", handlers.info);
  return {
    engine,
    handlers,
    events,
    setClock: (ms: number) => {
      clock = ms;
    },
  };
}

/** 起動して対局を開始した状態にする。 */
function startGame(engine: RestartableEngineProcess) {
  engine.launch();
  receive(0, "id name DummyEngine", "usiok");
  engine.ready();
  receive(0, "readyok");
}

const byoyomiTimeState = { btime: 3000, wtime: 5000, byoyomi: 10000, binc: 0, winc: 0 };

describe("background/usi/restartable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("restart_and_resume_search", async () => {
    const { engine, handlers, events, setClock } = setup();
    startGame(engine);
    expect(handlers.usiok).toBeCalledTimes(1);
    expect(handlers.ready).toBeCalledTimes(1);
    engine.setOption("MultiPV", 3);

    setClock(1000);
    engine.go("position startpos", byoyomiTimeState);
    expect(sentCommands().slice(-1)).toEqual(["go btime 3000 wtime 5000 byoyomi 10000"]);

    // 探索中に異常終了する。
    setClock(6000);
    crash(0);
    expect(events).toEqual([{ type: "crashed" }]);
    expect(engine.state).toBe(State.Restarting);
    expect(launchedProcessCount()).toBe(2);
    expect(sentCommands().slice(-1)).toEqual(["usi"]);
    expect(handlers.close).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();

    // 新しいプロセスが起動したら、オプションを再送して isready を送る。
    receive(1, "id name DummyEngine", "usiok");
    expect(handlers.usiok).toBeCalledTimes(1);
    expect(sentCommands().slice(-2)).toEqual(["setoption name MultiPV value 3", "isready"]);

    // readyok を受信したら、経過時間を差し引いて探索をやり直す。
    setClock(7000);
    receive(1, "readyok");
    await flush();
    expect(handlers.ready).toBeCalledTimes(1);
    expect(sentCommands().slice(-3)).toEqual([
      "usinewgame",
      "position startpos",
      "go btime 0 wtime 5000 byoyomi 7000",
    ]);
    expect(engine.state).toBe(State.WaitingForBestMove);
    expect(events).toEqual([{ type: "crashed" }, { type: "restarted", elapsedMs: 1000 }]);

    receive(1, "info depth 3 pv 7g7f", "bestmove 7g7f");
    expect(handlers.info).lastCalledWith("position startpos", { depth: 3, pv: ["7g7f"] });
    expect(handlers.bestmove).toBeCalledTimes(1);
    expect(handlers.bestmove).lastCalledWith("position startpos", "7g7f", undefined);

    // 終了したら close が 1 回だけ呼ばれる。
    engine.quit();
    expect(sentCommands().slice(-1)).toEqual(["quit"]);
    getChildProcessHandler("close", 1)(0, null);
    expect(handlers.close).toBeCalledTimes(1);
    expect(engine.state).toBe(State.QuitCompleted);
  });

  it("restart_on_ponder_without_resuming_ponder", async () => {
    const { engine, handlers, setClock } = setup();
    startGame(engine);
    engine.goPonder("position startpos moves 7g7f 3c3d", byoyomiTimeState);
    expect(sentCommands().slice(-1)).toEqual(["go ponder btime 3000 wtime 5000 byoyomi 10000"]);

    crash(0);
    receive(1, "usiok", "readyok");
    await flush();
    // Ponder は再開しない。
    expect(sentCommands().slice(-1)).toEqual(["usinewgame"]);
    expect(engine.state).toBe(State.Ready);
    // ponderhit の手番の判定に使われるので、局面は保持する。
    expect(engine.currentPosition).toBe("position startpos moves 7g7f 3c3d");

    // ponderhit は通常の探索に変換される。
    setClock(500);
    engine.ponderHit({ btime: 2000, wtime: 5000, byoyomi: 10000, binc: 0, winc: 0 });
    expect(sentCommands().slice(-2)).toEqual([
      "position startpos moves 7g7f 3c3d",
      "go btime 2000 wtime 5000 byoyomi 10000",
    ]);
    receive(1, "bestmove 2g2f");
    expect(handlers.bestmove).lastCalledWith(
      "position startpos moves 7g7f 3c3d",
      "2g2f",
      undefined,
    );
  });

  it("ponderhit_while_restarting", async () => {
    const { engine, setClock } = setup();
    startGame(engine);
    engine.goPonder("position startpos moves 7g7f 3c3d", byoyomiTimeState);
    crash(0);

    // 再起動中に ponderhit が来たら、その時点から経過時間を測る。
    setClock(1000);
    engine.ponderHit({ btime: 2000, wtime: 5000, byoyomi: 10000, binc: 0, winc: 0 });
    setClock(4000);
    receive(1, "usiok", "readyok");
    await flush();
    expect(sentCommands().slice(-2)).toEqual([
      "position startpos moves 7g7f 3c3d",
      "go btime 0 wtime 5000 byoyomi 9000",
    ]);
  });

  it("go_while_restarting", async () => {
    const { engine, setClock } = setup();
    startGame(engine);
    engine.goPonder("position startpos moves 7g7f 3c3d", byoyomiTimeState);
    crash(0);

    // Ponder が外れて別の局面の探索が要求される。
    setClock(1000);
    engine.go("position startpos moves 7g7f 8c8d", byoyomiTimeState);
    setClock(2500);
    receive(1, "usiok", "readyok");
    await flush();
    expect(sentCommands().slice(-2)).toEqual([
      "position startpos moves 7g7f 8c8d",
      "go btime 1500 wtime 5000 byoyomi 10000",
    ]);
  });

  it("restart_without_pending_search", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    receive(0, "bestmove 7g7f");
    expect(handlers.bestmove).toBeCalledTimes(1);

    crash(0);
    receive(1, "usiok", "readyok");
    await flush();
    expect(sentCommands().slice(-1)).toEqual(["usinewgame"]);
    expect(handlers.bestmove).toBeCalledTimes(1);
  });

  it("stop_while_restarting", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    engine.stop();
    receive(1, "usiok", "readyok");
    await flush();
    expect(sentCommands().slice(-2)).toEqual(["go btime 3000 wtime 5000 byoyomi 10000", "stop"]);
    receive(1, "bestmove 7g7f");
    expect(handlers.bestmove).lastCalledWith("position startpos", "7g7f", undefined);
  });

  it("gameover_while_restarting", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    engine.gameover(GameResult.LOSE);
    // 終局後は isready を送らない。
    receive(1, "usiok");
    expect(sentCommands().slice(-1)).toEqual(["usi"]);
    expect(engine.state).toBe(State.NotReady);

    // 次の対局。
    engine.ready();
    receive(1, "readyok");
    await flush();
    expect(handlers.ready).toBeCalledTimes(2);
    expect(sentCommands().slice(-2)).toEqual(["isready", "usinewgame"]);
  });

  it("gameover_while_waiting_for_readyok", async () => {
    const { engine } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    receive(1, "usiok");
    engine.gameover(GameResult.WIN);
    receive(1, "readyok");
    await flush();
    expect(sentCommands().slice(-2)).toEqual(["usinewgame", "gameover win"]);
    expect(engine.state).toBe(State.NotReady);
  });

  it("new_game_without_gameover_while_restarting", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    // CSA の再接続などで gameover を経ずに次の対局が始まる。
    engine.ready();
    receive(1, "usiok", "readyok");
    await flush();
    // 前の対局の探索は再開しない。
    expect(sentCommands().slice(-1)).toEqual(["usinewgame"]);
    expect(handlers.ready).toBeCalledTimes(2);
    expect(engine.currentPosition).toBe("");
  });

  it("new_game_without_gameover_after_restart_failure", async () => {
    const { engine } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    crash(1);
    vi.advanceTimersByTime(launchRetryIntervalMs);
    crash(2);
    engine.ready();
    receive(3, "usiok", "readyok");
    await flush();
    expect(sentCommands().slice(-1)).toEqual(["usinewgame"]);
  });

  it("ready_while_restarting", async () => {
    const { engine, handlers } = setup();
    engine.launch();
    receive(0, "usiok");
    crash(0);
    expect(engine.state).toBe(State.Restarting);
    engine.ready();
    receive(1, "usiok");
    expect(sentCommands().slice(-1)).toEqual(["isready"]);
    receive(1, "readyok");
    await flush();
    expect(handlers.ready).toBeCalledTimes(1);
  });

  it("quit_while_restarting", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    engine.quit();
    expect(sentCommands().slice(-1)).toEqual(["quit"]);
    getChildProcessHandler("close", 1)(0, null);
    expect(handlers.close).toBeCalledTimes(1);
    expect(engine.state).toBe(State.QuitCompleted);
  });

  it("crash_before_first_usiok", async () => {
    const { engine, handlers, events } = setup();
    engine.launch();
    crash(0);
    expect(handlers.error).toBeCalledTimes(1);
    expect(handlers.close).toBeCalledTimes(1);
    expect(events).toEqual([]);
    expect(launchedProcessCount()).toBe(1);
  });

  it("retry_launch", async () => {
    const { engine, handlers, events } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);

    // 1 回目の起動に失敗する。
    crash(1);
    expect(engine.state).toBe(State.Restarting);
    expect(launchedProcessCount()).toBe(2);
    vi.advanceTimersByTime(launchRetryIntervalMs);
    expect(launchedProcessCount()).toBe(3);

    // 2 回目の起動に失敗したら諦める。
    crash(2);
    expect(events.map((e) => e.type)).toEqual(["crashed", "failed"]);
    expect(engine.state).toBe(State.QuitCompleted);
    expect(handlers.close).not.toBeCalled();
    vi.advanceTimersByTime(launchRetryIntervalMs);
    expect(launchedProcessCount()).toBe(3);

    // 次の対局の開始時に改めて再起動する。
    engine.ready();
    expect(launchedProcessCount()).toBe(4);
    receive(3, "usiok", "readyok");
    await flush();
    expect(handlers.ready).toBeCalledTimes(2);

    engine.quit();
    getChildProcessHandler("close", 3)(0, null);
    expect(handlers.close).toBeCalledTimes(1);
  });

  it("quit_after_restart_failure", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    crash(0);
    crash(1);
    vi.advanceTimersByTime(launchRetryIntervalMs);
    crash(2);
    engine.quit();
    expect(handlers.close).toBeCalledTimes(1);
  });

  it("quit_while_waiting_for_retry", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    crash(0);
    crash(1);
    engine.quit();
    expect(handlers.close).toBeCalledTimes(1);
    vi.advanceTimersByTime(launchRetryIntervalMs);
    expect(launchedProcessCount()).toBe(2);
  });

  it("restart_limit_per_game", async () => {
    const { engine, handlers, events } = setup();
    startGame(engine);
    for (let i = 0; i < maxRestartsPerGame; i++) {
      crash(i);
      receive(i + 1, "usiok", "readyok");
      await flush();
    }
    expect(launchedProcessCount()).toBe(maxRestartsPerGame + 1);
    crash(maxRestartsPerGame);
    expect(launchedProcessCount()).toBe(maxRestartsPerGame + 1);
    expect(events.slice(-1)[0].type).toBe("failed");
    // ready の待機中でなければ error は通知しない。
    expect(handlers.error).not.toBeCalled();

    // 次の対局では回数がリセットされる。
    engine.ready();
    expect(launchedProcessCount()).toBe(maxRestartsPerGame + 2);
  });

  it("ignore_events_from_old_process", async () => {
    const { engine, handlers } = setup();
    startGame(engine);
    engine.go("position startpos", byoyomiTimeState);
    crash(0);
    receive(0, "bestmove 7g7f");
    expect(handlers.bestmove).not.toBeCalled();
  });

  it("command_history_across_processes", async () => {
    const { engine } = setup();
    startGame(engine);
    crash(0);
    receive(1, "usiok", "readyok");
    await flush();
    const commands = engine.commandHistory.commands.map((c) => c.command);
    expect(commands).toContain("crashed");
    expect(commands).toContain("restarted: 0 ms");
    expect(commands.filter((c) => c === "usi")).toHaveLength(2);
    expect(engine.lastReceived?.command).toBe("readyok");
    expect(engine.lastSent?.command).toBe("usinewgame");
  });

  describe("deductElapsedTime", () => {
    const black = "position startpos";
    const white = "position startpos moves 7g7f";

    it("byoyomi", async () => {
      const ts = { btime: 3000, wtime: 5000, byoyomi: 10000, binc: 0, winc: 0 };
      expect(deductElapsedTime(black, ts, 1000)).toEqual({ ...ts, btime: 2000 });
      expect(deductElapsedTime(black, ts, 3000)).toEqual({ ...ts, btime: 0 });
      expect(deductElapsedTime(black, ts, 4500)).toEqual({ ...ts, btime: 0, byoyomi: 8500 });
      expect(deductElapsedTime(black, ts, 20000)).toEqual({ ...ts, btime: 0, byoyomi: 0 });
      expect(deductElapsedTime(white, ts, 1000)).toEqual({ ...ts, wtime: 4000 });
      expect(deductElapsedTime(white, ts, 6000)).toEqual({ ...ts, wtime: 0, byoyomi: 9000 });
    });

    it("fischer", async () => {
      const ts = { btime: 3000, wtime: 5000, byoyomi: 0, binc: 2000, winc: 1000 };
      expect(deductElapsedTime(black, ts, 1000)).toEqual({ ...ts, btime: 2000 });
      expect(deductElapsedTime(black, ts, 3000)).toEqual({ ...ts, btime: 0 });
      expect(deductElapsedTime(black, ts, 4500)).toEqual({ ...ts, btime: 0, binc: 500 });
      expect(deductElapsedTime(black, ts, 9000)).toEqual({ ...ts, btime: 0, binc: 0 });
      expect(deductElapsedTime(white, ts, 5500)).toEqual({ ...ts, wtime: 0, winc: 500 });
    });

    it("sudden_death", async () => {
      const ts = { btime: 3000, wtime: 5000, byoyomi: 0, binc: 0, winc: 0 };
      expect(deductElapsedTime(black, ts, 1000)).toEqual({ ...ts, btime: 2000 });
      expect(deductElapsedTime(black, ts, 4000)).toEqual({ ...ts, btime: 0 });
      // 相手だけに加算時間がある場合
      const ts2 = { btime: 3000, wtime: 5000, byoyomi: 0, binc: 0, winc: 1000 };
      expect(deductElapsedTime(black, ts2, 1000)).toEqual({ ...ts2, btime: 2000 });
    });

    it("fraction_and_negative", async () => {
      const ts = { btime: 3000, wtime: 5000, byoyomi: 10000, binc: 0, winc: 0 };
      expect(deductElapsedTime(black, ts, 1000.7)).toEqual({ ...ts, btime: 1999 });
      expect(deductElapsedTime(black, ts, 3000.3)).toEqual({ ...ts, btime: 0, byoyomi: 9999 });
      expect(deductElapsedTime(black, ts, -100)).toEqual(ts);
    });
  });
});
