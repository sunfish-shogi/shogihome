/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  collectSessionStates,
  getUSIEngineInfo,
  go,
  goPonder,
  isActiveSessionExists,
  ponderHit,
  ready,
  sendOptionButtonSignal,
  setHandlers,
  setOption,
  setupPlayer,
} from "@/background/usi/index.js";
import { ChildProcess } from "@/background/usi/process.js";
import { testUSIEngine } from "@/tests/mock/usi.js";
import { MockedClass } from "vitest";

vi.mock("@/background/usi/process.js");

const mockChildProcess = ChildProcess as MockedClass<typeof ChildProcess>;

function getChildProcessHandler(name: string): any {
  return mockChildProcess.prototype.on.mock.calls.find((call) => call[0] === name)![1];
}

const handlers = {
  onUSIBestMove: vi.fn(),
  onUSICheckmate: vi.fn(),
  onUSICheckmateNotImplemented: vi.fn(),
  onUSICheckmateTimeout: vi.fn(),
  onUSINoMate: vi.fn(),
  onUSIInfo: vi.fn(),
  onUSIPonderInfo: vi.fn(),
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
    const timeStates = {
      black: { timeMs: 37082, byoyomi: 10, increment: 0 },
      white: { timeMs: 28103, byoyomi: 0, increment: 5 },
    };

    // go:black
    const position1 = "position startpos moves 7g7f 3c3d";
    go(sessionID, position1, timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "go btime 37082 wtime 23103 byoyomi 10000",
    );
    onReceive("bestmove 2g2f ponder 8c8d");
    expect(handlers.onUSIBestMove).lastCalledWith(sessionID, position1, "2g2f", "8c8d");

    // go:white
    const position2 = "position startpos moves 7g7f 3c3d 2g2f";
    go(sessionID, position2, timeStates);
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "go btime 37082 wtime 23103 binc 0 winc 5000",
    );
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

    onClose();
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
