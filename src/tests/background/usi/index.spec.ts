/* eslint-disable @typescript-eslint/no-explicit-any */

import { newUSIEngineStatsEntry } from "@/background/stats/types";
import {
  collectSessionStates,
  gameover,
  getUSIEngineInfo,
  go,
  goInfinite,
  goMate,
  goPonder,
  isActiveSessionExists,
  ponderHit,
  quit,
  quitAll,
  ready,
  sendOptionButtonSignal,
  setHandlers,
  setOption,
  setupPlayer,
  stop,
} from "@/background/usi/index.js";
import { ChildProcess } from "@/background/usi/process.js";
import { GameResult } from "@/common/game/result";
import { testUSIEngine } from "@/tests/mock/usi.js";
import { MockedClass } from "vitest";

vi.mock("@/background/usi/process.js");

const mockChildProcess = ChildProcess as MockedClass<typeof ChildProcess>;

function getChildProcessHandler(name: string, index: number = 0): any {
  const calls = mockChildProcess.prototype.on.mock.calls.filter((call) => call[0] === name);
  return calls[index][1];
}

const handlers = {
  onUSIBestMove: vi.fn(),
  onUSICheckmate: vi.fn(),
  onUSICheckmateNotImplemented: vi.fn(),
  onUSICheckmateTimeout: vi.fn(),
  onUSINoMate: vi.fn(),
  onUSIInfo: vi.fn(),
  onUSIPonderInfo: vi.fn(),
  onEngineProcessStats: vi.fn(),
  sendPromptCommand: vi.fn(),
};
setHandlers(handlers);

describe("background/usi/index", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("getUSIEngineInfo", async () => {
    const promise = getUSIEngineInfo("path/to/engine", 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    expect(handlers.sendPromptCommand.mock.calls[0][1].command).toBe("usi");
    onReceive("id name DummyEngine");
    onReceive("id author Ryosuke Kubo");
    onReceive("option name StringA type string default foo");
    onReceive("option name StringB type string");
    onReceive("option name CheckA type check default true");
    onReceive("option name CheckB type check");
    onReceive("usiok");
    const info = await promise;
    expect(info.path).toBe("path/to/engine");
    expect(info.name).toBe("DummyEngine");
    expect(info.defaultName).toBe("DummyEngine");
    expect(info.author).toBe("Ryosuke Kubo");
    expect(Object.keys(info.options)).toEqual([
      "StringA",
      "StringB",
      "CheckA",
      "CheckB",
      "USI_Hash",
      "USI_Ponder",
    ]);
    expect(handlers.sendPromptCommand).toBeCalledTimes(9);
    expect(mockChildProcess.prototype.send).lastCalledWith("quit");
    onClose();
  });

  it("sendOptionButtonSignal", async () => {
    const promise = sendOptionButtonSignal("path/to/engine", "myopt", 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    onReceive("usiok");
    await promise;
    expect(mockChildProcess.prototype.send).nthCalledWith(2, "setoption name myopt");
    expect(mockChildProcess.prototype.send).lastCalledWith("quit");
    onClose();
  });

  it("setOption", async () => {
    const setupPromise = setupPlayer(testUSIEngine, 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    onReceive("usiok");
    const sessionID = await setupPromise;
    const readyPromise = ready(sessionID);
    onReceive("readyok");
    await readyPromise;

    setOption(sessionID, "Foo", "foo");

    expect(mockChildProcess.prototype.send).lastCalledWith("setoption name Foo value foo");
    onClose();
  });

  it("go", async () => {
    const setupPromise = setupPlayer(testUSIEngine, 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    onReceive("usiok");
    const sessionID = await setupPromise;
    const readyPromise = ready(sessionID);
    expect(mockChildProcess.prototype.send).lastCalledWith("isready");
    onReceive("readyok");
    await readyPromise;
    expect(mockChildProcess.prototype.send).lastCalledWith("usinewgame");
    const timeStates = {
      black: { timeMs: 37082, byoyomi: 10, increment: 0 },
      white: { timeMs: 28103, byoyomi: 0, increment: 5 },
    };

    // go:black
    const position1 = "position startpos moves 7g7f 3c3d";
    go(sessionID, position1, timeStates);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "position startpos moves 7g7f 3c3d");
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "go btime 37082 wtime 23103 byoyomi 10000",
    );
    onReceive(
      "info depth 15 seldepth 23 time 79 nodes 432 nps 7654321 multipv 1 score cp 123 currmove 2g2f hashfull 420 pv 2g2f 8c8d 2f2e",
    );
    expect(handlers.onUSIInfo).toBeCalledTimes(1);
    expect(handlers.onUSIInfo).lastCalledWith(sessionID, position1, {
      depth: 15,
      seldepth: 23,
      timeMs: 79,
      nodes: 432,
      nps: 7654321,
      multipv: 1,
      scoreCP: 123,
      currmove: "2g2f",
      hashfullPerMill: 420,
      pv: ["2g2f", "8c8d", "2f2e"],
    });
    onReceive(
      "info depth 32 seldepth 38 time 150 nodes 1234 nps 1234567 multipv 1 score cp 200 currmove 2g2f hashfull 560 pv 2g2f 8c8d 2f2e",
    );
    expect(handlers.onUSIInfo).toBeCalledTimes(2);
    onReceive("bestmove 2g2f ponder 8c8d");
    expect(handlers.onUSIBestMove).lastCalledWith(sessionID, position1, "2g2f", "8c8d");

    // go:white
    const position2 = "position startpos moves 7g7f 3c3d 2g2f";
    go(sessionID, position2, timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "go btime 37082 wtime 23103 binc 0 winc 5000",
    );
    onReceive(
      "info depth 47 seldepth 53 time 232 nodes 7501 nps 1234567 multipv 1 score cp -25 currmove 8c8d hashfull 720 pv 8c8d 2f2e 4a3b",
    );
    expect(handlers.onUSIInfo).toBeCalledTimes(3);
    onReceive(
      "info depth 53 seldepth 61 time 541 nodes 18091 nps 2105219 multipv 1 score cp 109 currmove 8c8d hashfull 911 pv 8c8d 2f2e 4a3b",
    );
    expect(handlers.onUSIInfo).toBeCalledTimes(4);
    onReceive("bestmove 8c8d ponder 2f2e");
    expect(handlers.onUSIBestMove).lastCalledWith(sessionID, position2, "8c8d", "2f2e");

    // go ponder, ponderhit
    const position3 = "position startpos moves 7g7f 3c3d 2g2f 8c8d";
    goPonder(sessionID, position3, timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "go ponder btime 37082 wtime 23103 byoyomi 10000",
    );
    ponderHit(sessionID, timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith("ponderhit");

    quit(sessionID);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(11);
    expect(mockChildProcess.prototype.send).lastCalledWith("quit");

    expect(handlers.onEngineProcessStats).not.toBeCalled();
    onClose();

    // stats
    expect(handlers.onEngineProcessStats).toBeCalledTimes(1);
    expect(handlers.onEngineProcessStats.mock.calls[0][0]).toBe(sessionID);
    expect(handlers.onEngineProcessStats.mock.calls[0][1]).toBe(testUSIEngine.uri);
    expect(handlers.onEngineProcessStats.mock.calls[0][2]).toStrictEqual({
      ...newUSIEngineStatsEntry(),
      runCount: 1,
      gameCount: 1,
      goCount: 2,
      goPonderCount: 1,
      ponderHitCount: 1,
      totalNodeCount: 19325,
      npsSampleCount: 2,
      maxNPS: 7654321,
      meanNPS: 1669893,
      maxDepth: 53,
      maxDepthTimeMs: 541,
      maxSelDepth: 61,
      depth20Count: 2,
      depth20TotalTimeMs: 382,
      depth30Count: 2,
      depth30TotalTimeMs: 382,
      depth40Count: 1,
      depth40TotalTimeMs: 232,
      depth50Count: 1,
      depth50TotalTimeMs: 541,
      maxHashUsagePercent: 91.1,
      hashUsageSampleCount: 2,
      meanHashUsagePercent: 73.55,
      hashUsageOver50PercentCount: 2,
      hashUsageOver70PercentCount: 1,
      hashUsageOver90PercentCount: 1,
    });
  });

  it("early-ponder", async () => {
    const setupPromise = setupPlayer(
      {
        ...testUSIEngine,
        enableEarlyPonder: true,
      },
      10,
    );
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    onReceive("usiok");
    const sessionID = await setupPromise;
    const readyPromise = ready(sessionID);
    expect(mockChildProcess.prototype.send).lastCalledWith("isready");
    onReceive("readyok");
    await readyPromise;
    const timeStates = {
      black: { timeMs: 37082, byoyomi: 10, increment: 0 },
      white: { timeMs: 28103, byoyomi: 0, increment: 5 },
    };

    goPonder(sessionID, "position startpos moves 7g7f 3c3d 2g2f 8c8d", timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith("go ponder");
    ponderHit(sessionID, timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "ponderhit btime 37082 wtime 23103 byoyomi 10000",
    );

    onClose();
  });

  it("go infinite", async () => {
    const setupPromise = setupPlayer(testUSIEngine, 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    onReceive("usiok");
    const sessionID = await setupPromise;
    const readyPromise = ready(sessionID);
    onReceive("readyok");
    await readyPromise;

    const position1 = "position startpos moves 7g7f 3c3d";
    goInfinite(sessionID, position1);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "position startpos moves 7g7f 3c3d");
    expect(mockChildProcess.prototype.send).lastCalledWith("go infinite");
    stop(sessionID);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(6);
    expect(mockChildProcess.prototype.send).lastCalledWith("stop");
    onReceive("bestmove 2g2f ponder 8c8d");
    expect(handlers.onUSIBestMove).lastCalledWith(sessionID, position1, "2g2f", "8c8d");

    onClose();

    // stats
    expect(handlers.onEngineProcessStats).toBeCalledTimes(1);
    expect(handlers.onEngineProcessStats.mock.calls[0][2]).toStrictEqual({
      ...newUSIEngineStatsEntry(),
      runCount: 1,
      gameCount: 1,
      goInfiniteCount: 1,
    });
  });

  it("go mate", async () => {
    const setupPromise = setupPlayer(testUSIEngine, 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    onReceive("usiok");
    const sessionID = await setupPromise;
    const readyPromise = ready(sessionID);
    onReceive("readyok");
    await readyPromise;

    const position1 = "position sfen 3sks3/9/4+P4/9/9/8+B/9/9/9 b S2rb4gs4n4l17p 1";
    goMate(sessionID, position1);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(
      4,
      "position sfen 3sks3/9/4+P4/9/9/8+B/9/9/9 b S2rb4gs4n4l17p 1",
    );
    expect(mockChildProcess.prototype.send).lastCalledWith("go mate infinite");
    onReceive("checkmate 1f5b 4a5b S*5b");
    expect(handlers.onUSICheckmate).lastCalledWith(sessionID, position1, ["1f5b", "4a5b", "S*5b"]);

    goMate(sessionID, position1, 30);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(7);
    expect(mockChildProcess.prototype.send).nthCalledWith(
      4,
      "position sfen 3sks3/9/4+P4/9/9/8+B/9/9/9 b S2rb4gs4n4l17p 1",
    );
    expect(mockChildProcess.prototype.send).lastCalledWith("go mate 30000");
    onReceive("checkmate 1f5b 4a5b S*5b");
    expect(handlers.onUSICheckmate).lastCalledWith(sessionID, position1, ["1f5b", "4a5b", "S*5b"]);

    onClose();

    // stats
    expect(handlers.onEngineProcessStats).toBeCalledTimes(1);
    expect(handlers.onEngineProcessStats.mock.calls[0][2]).toStrictEqual({
      ...newUSIEngineStatsEntry(),
      runCount: 1,
      gameCount: 1,
      goMateCount: 2,
    });
  });

  it("gameover", async () => {
    const setupPromise = setupPlayer(testUSIEngine, 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    onReceive("usiok");
    const sessionID = await setupPromise;

    for (let i = 0; i < 3; i++) {
      const readyPromise = ready(sessionID);
      onReceive("readyok");
      await readyPromise;
      gameover(sessionID, GameResult.WIN);
      expect(mockChildProcess.prototype.send).toBeCalledTimes(4 + i * 3);
      expect(mockChildProcess.prototype.send).lastCalledWith("gameover win");
    }

    for (let i = 0; i < 2; i++) {
      const readyPromise = ready(sessionID);
      onReceive("readyok");
      await readyPromise;
      gameover(sessionID, GameResult.LOSE);
      expect(mockChildProcess.prototype.send).toBeCalledTimes(13 + i * 3);
      expect(mockChildProcess.prototype.send).lastCalledWith("gameover lose");
    }

    for (let i = 0; i < 2; i++) {
      const readyPromise = ready(sessionID);
      onReceive("readyok");
      await readyPromise;
      gameover(sessionID, GameResult.DRAW);
      expect(mockChildProcess.prototype.send).toBeCalledTimes(19 + i * 3);
      expect(mockChildProcess.prototype.send).lastCalledWith("gameover draw");
    }

    onClose();

    // stats
    expect(handlers.onEngineProcessStats).toBeCalledTimes(1);
    expect(handlers.onEngineProcessStats.mock.calls[0][2]).toStrictEqual({
      ...newUSIEngineStatsEntry(),
      runCount: 1,
      gameCount: 7,
      winCount: 3,
      loseCount: 2,
      drawCount: 2,
    });
  });

  it("quitAll", async () => {
    const setupPromise0 = setupPlayer(testUSIEngine, 10);
    const onReceive0 = getChildProcessHandler("receive", 0);
    const onClose0 = getChildProcessHandler("close", 0);
    onReceive0("usiok");
    await setupPromise0;

    const setupPromise1 = setupPlayer(testUSIEngine, 10);
    const onReceive1 = getChildProcessHandler("receive", 1);
    const onClose1 = getChildProcessHandler("close", 1);
    onReceive1("usiok");
    await setupPromise1;

    quitAll();
    expect(mockChildProcess.prototype.send).toBeCalledTimes(4);
    expect(mockChildProcess.prototype.send).nthCalledWith(3, "quit");
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "quit");

    onClose0();
    onClose1();
  });

  it("activeSessionCount", async () => {
    const setupPromise = setupPlayer(testUSIEngine, 10);
    const onReceive = getChildProcessHandler("receive");
    const onClose = getChildProcessHandler("close");
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    onReceive("usiok");
    const sessionID = await setupPromise;
    const readyPromise = ready(sessionID);
    expect(mockChildProcess.prototype.send).lastCalledWith("isready");
    onReceive("readyok");
    await readyPromise;

    expect(isActiveSessionExists()).toBeTruthy();
    onClose();
    expect(isActiveSessionExists()).toBeFalsy();
    expect(collectSessionStates()).toHaveLength(1);
    expect(collectSessionStates()[0].sessionID).toBe(sessionID);
    vi.runOnlyPendingTimers();
    expect(collectSessionStates()).toHaveLength(0);
  });
});
