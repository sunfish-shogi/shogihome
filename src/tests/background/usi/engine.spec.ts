/* eslint-disable @typescript-eslint/no-explicit-any */

import * as log4js from "log4js";
import { EngineProcess, GameResult } from "@/background/usi/engine.js";
import { ChildProcess } from "@/background/usi/process.js";
import { MockedClass } from "vitest";

vi.mock("@/background/usi/process.js");

const mockChildProcess = ChildProcess as MockedClass<typeof ChildProcess>;

function getChildProcessHandler(mock: MockedClass<typeof ChildProcess>, name: string): any {
  return mock.prototype.on.mock.calls.find((call) => call[0] === name)![1];
}

function bindHandlers(engine: EngineProcess) {
  const handlers = {
    timeout: vi.fn(),
    error: vi.fn(),
    usiok: vi.fn(),
    ready: vi.fn(),
    bestmove: vi.fn(),
    checkmate: vi.fn(),
    checkmateNotImplemented: vi.fn(),
    checkmateTimeout: vi.fn(),
    noMate: vi.fn(),
    info: vi.fn(),
  };
  engine.on("timeout", handlers.timeout);
  engine.on("error", handlers.error);
  engine.on("usiok", handlers.usiok);
  engine.on("ready", handlers.ready);
  engine.on("bestmove", handlers.bestmove);
  engine.on("checkmate", handlers.checkmate);
  engine.on("checkmateNotImplemented", handlers.checkmateNotImplemented);
  engine.on("checkmateTimeout", handlers.checkmateTimeout);
  engine.on("noMate", handlers.noMate);
  engine.on("info", handlers.info);
  return handlers;
}

describe("background/usi/engine", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("get-options", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    expect(mockChildProcess).toBeCalledTimes(1);
    expect(mockChildProcess).lastCalledWith("/path/to/engine");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(1);
    expect(mockChildProcess.prototype.send).lastCalledWith("usi");
    expect(mockChildProcess.prototype.on).nthCalledWith(1, "error", expect.any(Function));
    expect(mockChildProcess.prototype.on).nthCalledWith(2, "close", expect.any(Function));
    expect(mockChildProcess.prototype.on).nthCalledWith(3, "receive", expect.any(Function));
    const onClose = getChildProcessHandler(mockChildProcess, "close");
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("id author Ryosuke Kubo");
    onReceive("option name StringA type string default foo");
    onReceive("option name StringB type string");
    onReceive("option name CheckA type check default true");
    onReceive("option name CheckB type check");
    onReceive("option name ComboA type combo default baz var bar var baz var qux");
    onReceive("option name ComboB type combo default quux var default var quux var corge");
    onReceive("option name Filename type filename default /path/to/file");
    onReceive("option name SpinA type spin");
    onReceive("option name SpinB type spin default 8 min -20 max 30");
    onReceive("usiok");
    expect(handlers.usiok).toBeCalledTimes(1);
    expect(engine.name).toBe("DummyEngine");
    expect(engine.author).toBe("Ryosuke Kubo");
    expect(engine.engineOptions).toStrictEqual({
      USI_Hash: { name: "USI_Hash", type: "spin", default: 32, order: 1 },
      USI_Ponder: { name: "USI_Ponder", type: "check", default: "true", order: 2 },
      StringA: { name: "StringA", type: "string", default: "foo", order: 100 },
      StringB: { name: "StringB", type: "string", order: 101 },
      CheckA: { name: "CheckA", type: "check", default: "true", order: 102 },
      CheckB: { name: "CheckB", type: "check", order: 103 },
      ComboA: {
        name: "ComboA",
        type: "combo",
        default: "baz",
        vars: ["bar", "baz", "qux"],
        order: 104,
      },
      ComboB: {
        name: "ComboB",
        type: "combo",
        default: "quux",
        vars: ["default", "quux", "corge"],
        order: 105,
      },
      Filename: { name: "Filename", type: "filename", default: "/path/to/file", order: 106 },
      SpinA: { name: "SpinA", type: "spin", order: 107 },
      SpinB: { name: "SpinB", type: "spin", default: 8, min: -20, max: 30, order: 108 },
    });
    engine.quit();
    expect(mockChildProcess.prototype.send).toBeCalledTimes(2);
    expect(mockChildProcess.prototype.send).lastCalledWith("quit");
    onClose();
    expect(handlers.timeout).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();
    expect(handlers.ready).not.toBeCalled();
  });

  it("set-options", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {
      engineOptions: [
        { name: "USI_Hash", type: "spin", order: 1, value: 32 },
        { name: "USI_Ponder", type: "check", order: 2, value: "true" },
        { name: "StringA", type: "string", default: "foo", order: 100 },
        { name: "StringB", type: "string", default: "bar", order: 101, value: "baz" },
        { name: "StringC", type: "string", order: 102 },
        { name: "Filename", type: "filename", order: 103, value: "/path/to/file" },
        { name: "Spin", type: "spin", order: 104, value: -81 },
        { name: "Button", type: "button", order: 105 },
      ],
    });
    const handlers = bindHandlers(engine);
    engine.launch();
    const onClose = getChildProcessHandler(mockChildProcess, "close");
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("option name Button type button");
    onReceive("usiok");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(7);
    expect(mockChildProcess.prototype.send).nthCalledWith(2, "setoption name USI_Hash value 32");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      3,
      "setoption name USI_Ponder value true",
    );
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "setoption name StringA value foo");
    expect(mockChildProcess.prototype.send).nthCalledWith(5, "setoption name StringB value baz");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      6,
      "setoption name Filename value /path/to/file",
    );
    expect(mockChildProcess.prototype.send).nthCalledWith(7, "setoption name Spin value -81");
    engine.setOption("Button");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(8);
    expect(mockChildProcess.prototype.send).lastCalledWith("setoption name Button");
    engine.quit();
    onClose();
    expect(handlers.timeout).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();
    expect(handlers.ready).not.toBeCalled();
  });

  it("ready", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    const onClose = getChildProcessHandler(mockChildProcess, "close");
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");
    engine.ready();
    expect(mockChildProcess.prototype.send).toBeCalledTimes(2);
    expect(mockChildProcess.prototype.send).lastCalledWith("isready");
    onReceive("readyok");
    expect(handlers.ready).toBeCalledTimes(1);
    expect(mockChildProcess.prototype.send).toBeCalledTimes(3);
    expect(mockChildProcess.prototype.send).lastCalledWith("usinewgame");
    engine.ready(); // 連続して ready を呼び出した場合は自動的に gameover コマンドを送信する。
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "gameover draw");
    expect(mockChildProcess.prototype.send).lastCalledWith("isready");
    engine.quit();
    onClose();
    expect(handlers.timeout).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();
  });

  it("games", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    const onClose = getChildProcessHandler(mockChildProcess, "close");
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");

    // first game
    engine.ready();
    onReceive("readyok");
    expect(handlers.ready).toBeCalledTimes(1);
    engine.go("position test01", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "position test01");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      5,
      "go btime 60000 wtime 60000 binc 5000 winc 5000",
    );
    onReceive(
      "info depth 5 seldepth 10 time 79 nodes 432 nps 7654321 multipv 1 score cp 123 currmove 7g7f hashfull 300 pv 7g7f 3c3d 2g2f",
    );
    expect(handlers.info).lastCalledWith("position test01", {
      depth: 5,
      seldepth: 10,
      scoreCP: 123,
      timeMs: 79,
      nodes: 432,
      nps: 7654321,
      currmove: "7g7f",
      pv: ["7g7f", "3c3d", "2g2f"],
      hashfullPerMill: 300,
      multipv: 1,
    });
    onReceive("info string foo bar baz");
    expect(handlers.info).lastCalledWith("position test01", {
      string: "foo bar baz",
    });
    onReceive("bestmove 7g7f ponder 3c3d");
    expect(handlers.bestmove).lastCalledWith("position test01", "7g7f", "3c3d");
    engine.goPonder("position test01-ponder", {
      btime: 53e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(7);
    expect(mockChildProcess.prototype.send).nthCalledWith(6, "position test01-ponder");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      7,
      "go ponder btime 53000 wtime 60000 binc 5000 winc 5000",
    );
    onReceive("info depth 5 seldepth 10 currmove 2g2f");
    expect(handlers.info).lastCalledWith("position test01-ponder", {
      depth: 5,
      seldepth: 10,
      currmove: "2g2f",
    });
    engine.ponderHit({
      btime: 53e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).lastCalledWith("ponderhit");
    onReceive("bestmove 1g1f");
    expect(handlers.bestmove).lastCalledWith("position test01-ponder", "1g1f", undefined);
    engine.gameover(GameResult.WIN);
    expect(mockChildProcess.prototype.send).lastCalledWith("gameover win");

    // second game
    engine.ready();
    onReceive("readyok");
    expect(handlers.ready).toBeCalledTimes(2);
    engine.go("position test02", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(13);
    expect(mockChildProcess.prototype.send).nthCalledWith(12, "position test02");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      13,
      "go btime 60000 wtime 60000 binc 5000 winc 5000",
    );
    onReceive("info depth 3 score mate -");
    expect(handlers.info).lastCalledWith("position test02", {
      depth: 3,
      scoreMate: -10000,
    });
    engine.stop();
    expect(mockChildProcess.prototype.send).lastCalledWith("stop");
    onReceive("bestmove 2g2f");
    expect(handlers.bestmove).lastCalledWith("position test02", "2g2f", undefined);
    engine.gameover(GameResult.LOSE);
    expect(mockChildProcess.prototype.send).lastCalledWith("gameover lose");

    engine.quit();
    onClose();
    expect(handlers.timeout).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();
  });

  it("earlyPonder", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {
      enableEarlyPonder: true,
    });
    const handlers = bindHandlers(engine);
    engine.launch();
    const onClose = getChildProcessHandler(mockChildProcess, "close");
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");

    engine.ready();
    onReceive("readyok");
    expect(handlers.ready).toBeCalledTimes(1);
    engine.go("position test01", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "position test01");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      5,
      "go btime 60000 wtime 60000 binc 5000 winc 5000",
    );
    onReceive(
      "info depth 5 seldepth 10 time 79 nodes 432 nps 7654321 multipv 1 score cp 123 currmove 7g7f hashfull 300 pv 7g7f 3c3d 2g2f",
    );
    expect(handlers.info).lastCalledWith("position test01", {
      depth: 5,
      seldepth: 10,
      scoreCP: 123,
      timeMs: 79,
      nodes: 432,
      nps: 7654321,
      currmove: "7g7f",
      pv: ["7g7f", "3c3d", "2g2f"],
      hashfullPerMill: 300,
      multipv: 1,
    });
    onReceive("info string foo bar baz");
    expect(handlers.info).lastCalledWith("position test01", {
      string: "foo bar baz",
    });
    onReceive("bestmove 7g7f ponder 3c3d");
    expect(handlers.bestmove).lastCalledWith("position test01", "7g7f", "3c3d");
    engine.goPonder("position test01-ponder", {
      btime: 53e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(7);
    expect(mockChildProcess.prototype.send).nthCalledWith(6, "position test01-ponder");
    expect(mockChildProcess.prototype.send).nthCalledWith(7, "go ponder"); // early-ponder では go ponder で時間情報を送信しない。
    onReceive("info depth 5 seldepth 10 currmove 2g2f");
    expect(handlers.info).lastCalledWith("position test01-ponder", {
      depth: 5,
      seldepth: 10,
      currmove: "2g2f",
    });
    engine.ponderHit({
      btime: 53e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).lastCalledWith(
      "ponderhit btime 53000 wtime 60000 binc 5000 winc 5000", // early-ponder では ponderhit で時間情報を送信する。
    );
    onReceive("bestmove 1g1f");
    expect(handlers.bestmove).lastCalledWith("position test01-ponder", "1g1f", undefined);
    engine.gameover(GameResult.WIN);
    expect(mockChildProcess.prototype.send).lastCalledWith("gameover win");

    engine.quit();
    onClose();
    expect(handlers.timeout).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();
  });

  it("mate", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    const onClose = getChildProcessHandler(mockChildProcess, "close");
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");
    engine.ready();
    onReceive("readyok");
    expect(handlers.ready).toBeCalledTimes(1);

    engine.goMate("position test01");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    expect(mockChildProcess.prototype.send).nthCalledWith(4, "position test01");
    expect(mockChildProcess.prototype.send).nthCalledWith(5, "go mate infinite");
    onReceive("checkmate 2c2b 3a2b 3c3a+");
    expect(handlers.checkmate).lastCalledWith("position test01", ["2c2b", "3a2b", "3c3a+"]);

    engine.goMate("position test02");
    onReceive("checkmate nomate");
    expect(handlers.noMate).lastCalledWith("position test02");

    engine.goMate("position test03");
    onReceive("checkmate timeout");
    expect(handlers.checkmateTimeout).lastCalledWith("position test03");

    engine.goMate("position test04");
    onReceive("checkmate notimplemented");
    expect(handlers.checkmateNotImplemented).toBeCalled();

    engine.goMate("position test05", 12.3456);
    expect(mockChildProcess.prototype.send).lastCalledWith("go mate 12345");
    onReceive("checkmate 2c2b 3a2b 3c3a+");
    expect(handlers.checkmate).lastCalledWith("position test05", ["2c2b", "3a2b", "3c3a+"]);

    engine.quit();
    onClose();
    expect(handlers.timeout).not.toBeCalled();
    expect(handlers.error).not.toBeCalled();
  });

  it("first_game_interrupted_in_my_turn", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");

    engine.ready();
    onReceive("readyok");
    engine.go("position test01", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);

    // go コマンドに対する bestmove を待たずに次の対局を開始する。
    // CSA サーバーとの接続が切れた場合等に発生する。
    engine.ready();
    expect(mockChildProcess.prototype.send).toBeCalledTimes(8);
    expect(mockChildProcess.prototype.send).nthCalledWith(6, "stop");
    expect(mockChildProcess.prototype.send).nthCalledWith(7, "gameover draw");
    expect(mockChildProcess.prototype.send).nthCalledWith(8, "isready");
    onReceive("readyok");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(9);
    expect(mockChildProcess.prototype.send).lastCalledWith("usinewgame");
    engine.go("position test02", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(11);
    expect(mockChildProcess.prototype.send).nthCalledWith(10, "position test02");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      11,
      "go btime 60000 wtime 60000 binc 5000 winc 5000",
    );
    onReceive("bestmove 7g7f ponder 3c3d");
    expect(handlers.bestmove).not.toBeCalled(); // 1 局目で要求していた bestmove は無視される。
    onReceive("bestmove 2g2f ponder 8c8d");
    expect(handlers.bestmove).lastCalledWith("position test02", "2g2f", "8c8d");
  });

  it("first_game_interrupted_in_ponder", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");

    engine.ready();
    onReceive("readyok");
    engine.goPonder("position test01-ponder", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(5);
    engine.go("position test01", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(6);
    expect(mockChildProcess.prototype.send).lastCalledWith("stop");

    // ponder 後の stop コマンドに対する bestmove を待たずに次の対局を開始する。
    // CSA サーバーとの接続が切れた場合等に発生する。
    engine.ready();
    expect(mockChildProcess.prototype.send).toBeCalledTimes(8);
    expect(mockChildProcess.prototype.send).nthCalledWith(7, "gameover draw");
    expect(mockChildProcess.prototype.send).nthCalledWith(8, "isready");
    onReceive("readyok");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(9);
    expect(mockChildProcess.prototype.send).lastCalledWith("usinewgame");
    engine.go("position test02", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    expect(mockChildProcess.prototype.send).toBeCalledTimes(11);
    expect(mockChildProcess.prototype.send).nthCalledWith(10, "position test02");
    expect(mockChildProcess.prototype.send).nthCalledWith(
      11,
      "go btime 60000 wtime 60000 binc 5000 winc 5000",
    );
    onReceive("bestmove 7g7f ponder 3c3d");
    expect(handlers.bestmove).not.toBeCalled(); // 1 局目で要求していた bestmove は無視される。
    onReceive("bestmove 2g2f ponder 8c8d");
    expect(handlers.bestmove).lastCalledWith("position test02", "2g2f", "8c8d");
  });

  it("setoption_reservation", async () => {
    const engine = new EngineProcess("/path/to/engine", 123, log4js.getLogger(), {});
    const handlers = bindHandlers(engine);
    engine.launch();
    const onReceive = getChildProcessHandler(mockChildProcess, "receive");
    onReceive("id name DummyEngine");
    onReceive("usiok");

    engine.ready();
    onReceive("readyok");
    expect(handlers.ready).toBeCalledTimes(1);
    engine.go("position test01", {
      btime: 60e3,
      wtime: 60e3,
      byoyomi: 0,
      binc: 5e3,
      winc: 5e3,
    });
    engine.stop();
    engine.setOption("USI_Hash", 64); // should be reserved
    engine.setOption("MultiPV", 3); // should be reserved
    expect(mockChildProcess.prototype.send).toBeCalledTimes(6);
    expect(mockChildProcess.prototype.send).nthCalledWith(6, "stop"); // only stop command should be sent
    onReceive("bestmove 7g7f ponder 3c3d");
    expect(mockChildProcess.prototype.send).toBeCalledTimes(8);
    expect(mockChildProcess.prototype.send).nthCalledWith(7, "setoption name USI_Hash value 64");
    expect(mockChildProcess.prototype.send).lastCalledWith("setoption name MultiPV value 3");
  });
});
