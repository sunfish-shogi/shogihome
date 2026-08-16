import { GameResult } from "@/common/game/result.js";
import { USIEngine } from "@/common/settings/usi.js";
import { USISessionHandlers, USISessionManager } from "@/renderer/wasm-engine/session.js";
import { EngineTransport } from "@/renderer/wasm-engine/transport.js";

const timeStates = {
  black: { timeMs: 300000, byoyomi: 30, increment: 0 },
  white: { timeMs: 300000, byoyomi: 30, increment: 0 },
};

class MockTransport implements EngineTransport {
  sent: string[] = [];
  closed = false;
  private receiveListeners: ((line: string) => void)[] = [];
  private errorListeners: ((error: Error) => void)[] = [];
  private closeListeners: (() => void)[] = [];

  on(event: "receive", listener: (line: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: string, listener: unknown): this {
    switch (event) {
      case "receive":
        this.receiveListeners.push(listener as (line: string) => void);
        break;
      case "error":
        this.errorListeners.push(listener as (error: Error) => void);
        break;
      case "close":
        this.closeListeners.push(listener as () => void);
        break;
    }
    return this;
  }

  send(line: string): void {
    this.sent.push(line);
  }

  close(): void {
    this.closed = true;
    this.closeListeners.forEach((listener) => listener());
  }

  receive(...lines: string[]): void {
    for (const line of lines) {
      this.receiveListeners.forEach((listener) => listener(line));
    }
  }

  emitError(error: Error): void {
    this.errorListeners.forEach((listener) => listener(error));
  }
}

function newEngine(options: USIEngine["options"] = {}): USIEngine {
  return {
    uri: "es://usi-engine/builtin/test",
    name: "test engine",
    defaultName: "test engine",
    author: "author",
    path: "wasm:test/v1",
    options,
    tags: [],
    enableEarlyPonder: false,
  };
}

function newHandlers(): USISessionHandlers {
  return {
    onUSIBestMove: vi.fn(),
    onUSICheckmate: vi.fn(),
    onUSICheckmateNotImplemented: vi.fn(),
    onUSICheckmateTimeout: vi.fn(),
    onUSINoMate: vi.fn(),
    onUSIInfo: vi.fn(),
  };
}

function setup() {
  let transport = new MockTransport();
  const manager = new USISessionManager(() => {
    transport = new MockTransport();
    return transport;
  });
  const handlers = newHandlers();
  manager.setHandlers(handlers);
  return {
    manager,
    handlers,
    get transport() {
      return transport;
    },
  };
}

const USI_OK_LINES = [
  "id name test engine",
  "id author author",
  "option name Style type combo default static_rook var static_rook var random",
  "usiok",
];

// エンジンを起動して READY にする。go 系のコマンドはこの状態から送られる。
async function launchReady(env: ReturnType<typeof setup>, engine = newEngine()) {
  const promise = env.manager.setupPlayer(engine);
  env.transport.receive(...USI_OK_LINES);
  const sessionID = await promise;
  const ready = env.manager.ready(sessionID);
  env.transport.receive("readyok");
  await ready;
  env.transport.sent.length = 0;
  return sessionID;
}

describe("wasm-engine/session", () => {
  it("setupPlayer/go/bestmove", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(
      newEngine({
        Style: { name: "Style", type: "combo", order: 100, vars: [], value: "random" },
      }),
    );
    expect(env.transport.sent).toEqual(["usi"]);
    env.transport.receive(...USI_OK_LINES);
    const sessionID = await promise;
    expect(sessionID).toBe(1);
    // usiok の後に保存済みのオプション値が送られる。
    expect(env.transport.sent).toEqual(["usi", "setoption name Style value random"]);

    env.transport.sent.length = 0;
    const ready = env.manager.ready(sessionID);
    expect(env.transport.sent).toEqual(["isready"]);
    env.transport.receive("readyok");
    await ready;
    expect(env.transport.sent).toEqual(["isready", "usinewgame"]);

    env.transport.sent.length = 0;
    env.manager.go(sessionID, "position startpos moves 7g7f", timeStates);
    expect(env.transport.sent).toEqual([
      "position startpos moves 7g7f",
      "go btime 300000 wtime 300000 byoyomi 30000",
    ]);

    env.transport.receive("info depth 2 nodes 100 score cp 12 pv 3c3d");
    expect(env.handlers.onUSIInfo).toHaveBeenCalledWith(
      sessionID,
      "position startpos moves 7g7f",
      expect.objectContaining({ depth: 2, nodes: 100, scoreCP: 12, pv: ["3c3d"] }),
    );

    env.transport.receive("bestmove 3c3d ponder 2g2f");
    expect(env.handlers.onUSIBestMove).toHaveBeenCalledWith(
      sessionID,
      "position startpos moves 7g7f",
      "3c3d",
      "2g2f",
    );

    env.manager.gameover(sessionID, GameResult.WIN);
    expect(env.transport.sent).toContain("gameover win");

    env.manager.quit(sessionID);
    expect(env.transport.closed).toBeTruthy();
  });

  it("usiok/reservedOptions", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(newEngine());
    env.transport.receive(...USI_OK_LINES);
    const sessionID = await promise;
    const states = env.manager.collectSessionStates();
    expect(states).toHaveLength(1);
    expect(states[0].sessionID).toBe(sessionID);
    expect(states[0].stateCode).toBe("notReady");
    expect(states[0].lastReceived?.command).toBe("usiok");
  });

  it("getEngineInfo", async () => {
    const env = setup();
    const promise = env.manager.getEngineInfo("wasm:test/v1", 10);
    env.transport.receive(...USI_OK_LINES);
    const engine = await promise;
    expect(engine.name).toBe("test engine");
    expect(engine.author).toBe("author");
    expect(engine.path).toBe("wasm:test/v1");
    expect(engine.options["Style"]).toEqual({
      name: "Style",
      type: "combo",
      order: 100,
      default: "static_rook",
      vars: ["static_rook", "random"],
    });
    // エンジンが宣言していない予約オプションは補完される。
    expect(engine.options["USI_Hash"]?.type).toBe("spin");
    expect(engine.options["USI_Ponder"]?.type).toBe("check");
    // 情報取得後はセッションを閉じる。
    expect(env.manager.collectSessionStates()).toHaveLength(0);
  });

  it("goMate/notImplemented", async () => {
    const env = setup();
    const sessionID = await launchReady(env);
    env.manager.goMate(sessionID, "position startpos", 5);
    expect(env.transport.sent).toEqual(["position startpos", "go mate 5000"]);
    env.transport.receive("checkmate notimplemented");
    expect(env.handlers.onUSICheckmateNotImplemented).toHaveBeenCalledWith(sessionID);
  });

  it("goInfinite/stop", async () => {
    const env = setup();
    const sessionID = await launchReady(env);
    env.manager.goInfinite(sessionID, "position startpos");
    expect(env.transport.sent).toEqual(["position startpos", "go infinite"]);
    env.manager.stop(sessionID);
    expect(env.transport.sent).toContain("stop");
    env.transport.receive("bestmove 7g7f");
    expect(env.handlers.onUSIBestMove).toHaveBeenCalledWith(
      sessionID,
      "position startpos",
      "7g7f",
      undefined,
    );
  });

  // ponder が当たった場合。go ponder で読んでいた局面がそのまま本譜になる。
  it("goPonder/ponderHit", async () => {
    const env = setup();
    const sessionID = await launchReady(env);
    env.manager.goPonder(sessionID, "position startpos moves 7g7f 3c3d", timeStates);
    expect(env.transport.sent).toEqual([
      "position startpos moves 7g7f 3c3d",
      "go ponder btime 300000 wtime 300000 byoyomi 30000",
    ]);

    // ponder 中の info は読み筋として扱う。
    env.transport.receive("info depth 3 nodes 100 score cp 20 pv 2g2f");
    expect(env.handlers.onUSIInfo).toHaveBeenCalledWith(
      sessionID,
      "position startpos moves 7g7f 3c3d",
      expect.objectContaining({ depth: 3 }),
    );

    env.transport.sent.length = 0;
    // 残り時間は go ponder で渡してあるので引数を付けない。
    env.manager.ponderHit(sessionID);
    expect(env.transport.sent).toEqual(["ponderhit"]);
    env.transport.receive("bestmove 2g2f");
    expect(env.handlers.onUSIBestMove).toHaveBeenCalledWith(
      sessionID,
      "position startpos moves 7g7f 3c3d",
      "2g2f",
      undefined,
    );
  });

  // ponder が外れた場合。stop を送り、bestmove を捨ててから次の go を送る。
  it("goPonder/ponderMiss", async () => {
    const env = setup();
    const sessionID = await launchReady(env);
    env.manager.goPonder(sessionID, "position startpos moves 7g7f 3c3d", timeStates);
    env.transport.sent.length = 0;

    // 予想が外れたので別の局面を探索させる。
    env.manager.go(sessionID, "position startpos moves 7g7f 8c8d", timeStates);
    // まだ go は送らず、先に stop で ponder を打ち切る。
    expect(env.transport.sent).toEqual(["stop"]);

    // 打ち切った ponder の bestmove は本譜の指し手ではないので報告しない。
    env.transport.receive("bestmove 2g2f");
    expect(env.handlers.onUSIBestMove).not.toHaveBeenCalled();
    // bestmove を受け取ってから予約しておいた go を送る。
    expect(env.transport.sent).toEqual([
      "stop",
      "position startpos moves 7g7f 8c8d",
      "go btime 300000 wtime 300000 byoyomi 30000",
    ]);

    env.transport.receive("bestmove 2g2f");
    expect(env.handlers.onUSIBestMove).toHaveBeenCalledWith(
      sessionID,
      "position startpos moves 7g7f 8c8d",
      "2g2f",
      undefined,
    );
  });

  // 検討では bestmove を待たずに次の局面の go が来る。
  it("goInfinite/switchPosition", async () => {
    const env = setup();
    const sessionID = await launchReady(env);
    env.manager.goInfinite(sessionID, "position startpos");
    env.transport.sent.length = 0;
    env.manager.goInfinite(sessionID, "position startpos moves 7g7f");
    expect(env.transport.sent).toEqual(["stop"]);
    env.transport.receive("bestmove 2g2f");
    expect(env.transport.sent).toEqual(["stop", "position startpos moves 7g7f", "go infinite"]);
  });

  // readyok より前に go が来た場合は、readyok の後に送る。
  it("go/beforeReadyOk", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(newEngine());
    env.transport.receive(...USI_OK_LINES);
    const sessionID = await promise;
    const ready = env.manager.ready(sessionID);
    env.transport.sent.length = 0;
    env.manager.go(sessionID, "position startpos", timeStates);
    expect(env.transport.sent).toEqual([]);
    env.transport.receive("readyok");
    await ready;
    expect(env.transport.sent).toEqual([
      "usinewgame",
      "position startpos",
      "go btime 300000 wtime 300000 byoyomi 30000",
    ]);
  });

  // 連続対局では同じセッションに対して ready() が繰り返し呼ばれる。
  // 思考中に終局しても次の対局を開始できること。
  it("gameover/whileThinking", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(newEngine());
    env.transport.receive(...USI_OK_LINES);
    const sessionID = await promise;
    const ready = env.manager.ready(sessionID);
    env.transport.receive("readyok");
    await ready;

    env.manager.go(sessionID, "position startpos", timeStates);
    env.transport.sent.length = 0;
    // 思考中に終局した場合は、思考を打ち切ってから結果を送る。
    env.manager.gameover(sessionID, GameResult.LOSE);
    expect(env.transport.sent).toEqual(["stop", "gameover lose"]);

    // 打ち切った探索から遅れて届く bestmove は捨てる。
    env.transport.receive("bestmove 7g7f");
    expect(env.handlers.onUSIBestMove).not.toHaveBeenCalled();

    // 次の対局を開始できる。
    env.transport.sent.length = 0;
    const nextReady = env.manager.ready(sessionID);
    expect(env.transport.sent).toEqual(["isready"]);
    env.transport.receive("readyok");
    await expect(nextReady).resolves.toBeUndefined();
  });

  // gameover が送られないまま次の対局が始まる異常系でも復帰できること。
  it("ready/whileThinking", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(newEngine());
    env.transport.receive(...USI_OK_LINES);
    const sessionID = await promise;
    const ready = env.manager.ready(sessionID);
    env.transport.receive("readyok");
    await ready;

    env.manager.go(sessionID, "position startpos", timeStates);
    env.transport.sent.length = 0;
    const nextReady = env.manager.ready(sessionID);
    // 勝敗が判断できないので引き分けとして終局を通知する。
    expect(env.transport.sent).toEqual(["stop", "gameover draw", "isready"]);
    env.transport.receive("readyok");
    await expect(nextReady).resolves.toBeUndefined();
  });

  // 対局していない状態の gameover は無視する。
  it("gameover/unexpectedState", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(newEngine());
    env.transport.receive(...USI_OK_LINES);
    const sessionID = await promise;
    env.transport.sent.length = 0;
    env.manager.gameover(sessionID, GameResult.WIN);
    expect(env.transport.sent).toEqual([]);
  });

  it("setupPlayer/timeout", async () => {
    vi.useFakeTimers();
    try {
      const env = setup();
      const promise = env.manager.setupPlayer(newEngine(), { timeoutSeconds: 3 });
      vi.advanceTimersByTime(3000);
      await expect(promise).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("setupPlayer/errorOnLaunch", async () => {
    const env = setup();
    const promise = env.manager.setupPlayer(newEngine());
    env.transport.emitError(new Error("failed to load wasm"));
    await expect(promise).rejects.toThrow("failed to load wasm");
    expect(env.manager.collectSessionStates()).toHaveLength(0);
  });
});
