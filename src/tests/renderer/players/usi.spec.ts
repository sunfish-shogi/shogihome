import api, { API } from "@/renderer/ipc/api.js";
import {
  onUSIBestMove,
  onUSICheckmate,
  onUSICheckmateNotImplemented,
  onUSIInfo,
  onUSINoMate,
  USIPlayer,
} from "@/renderer/players/usi.js";
import { Move, parsePV, Record } from "tsshogi";
import { testUSIEngine, testUSIEngineWithPonder } from "@/tests/mock/usi.js";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

const timeStates = {
  black: {
    timeMs: 250,
    byoyomi: 30,
    increment: 0,
  },
  white: {
    timeMs: 160,
    byoyomi: 0,
    increment: 5,
  },
};

describe("usi", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("ponderHit", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiGoPonder.mockResolvedValueOnce();
    mockAPI.usiPonderHit.mockResolvedValueOnce();
    mockAPI.usiQuit.mockResolvedValueOnce();
    const usi1 = "position startpos moves 7g7f 3c3d";
    const usi2 = "position startpos moves 7g7f 3c3d 2g2f";
    const usi3 = "position startpos moves 7g7f 3c3d 2g2f 8c8d";
    const record1 = Record.newByUSI(usi1) as Record;
    const record2 = Record.newByUSI(usi2) as Record;
    const record3 = Record.newByUSI(usi3) as Record;
    const player = new USIPlayer(testUSIEngineWithPonder, 10);
    await player.launch();
    expect(mockAPI.usiLaunch).toBeCalledTimes(1);
    const searchHandler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };

    // search
    await player.startSearch(record1.position, usi1, timeStates, searchHandler);
    expect(mockAPI.usiGo).toBeCalledWith(100, usi1, timeStates);
    onUSIInfo(100, usi1, {
      depth: 32,
      nodes: 12345678,
      scoreCP: 138,
      pv: ["2g2f", "8c8d", "2f2e"],
    });
    onUSIBestMove(100, usi1, "2g2f", "8c8d");
    expect(searchHandler.onMove.mock.calls[0][0].usi).toBe("2g2f");
    expect(searchHandler.onMove.mock.calls[0][1].depth).toBe(32);
    expect(searchHandler.onMove.mock.calls[0][1].nodes).toBe(12345678);
    expect(searchHandler.onMove.mock.calls[0][1].score).toBe(138);
    expect(searchHandler.onMove.mock.calls[0][1].pv.map((m: Move) => m.usi)).toEqual([
      "8c8d",
      "2f2e",
    ]);

    // ponder
    await player.startPonder(record2.position, usi2, timeStates);
    expect(mockAPI.usiGoPonder).toBeCalled();
    onUSIInfo(100, usi3, {
      pv: ["2f2e", "8d8e", "6i7h", "4a3b"],
    });

    // startPonder を連続して呼び出すと無視される。
    await player.startPonder(record2.position, usi2, timeStates);
    expect(mockAPI.usiGoPonder).toBeCalledTimes(1);

    // search (ponderHit)
    await player.startSearch(record3.position, usi3, timeStates, searchHandler);
    expect(mockAPI.usiPonderHit).toBeCalledWith(100, timeStates);
    onUSIBestMove(100, usi3, "2f2e");
    expect(searchHandler.onMove.mock.calls[1][0].usi).toBe("2f2e");
    expect(searchHandler.onMove.mock.calls[1][1].pv.map((m: Move) => m.usi)).toEqual([
      "8d8e",
      "6i7h",
      "4a3b",
    ]);
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
  });

  it("bookHit", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiQuit.mockResolvedValueOnce();
    mockAPI.openBookAsNewSession.mockResolvedValueOnce(123);
    mockAPI.searchBookMoves.mockResolvedValueOnce([{ usi: "2g2f", comment: "" }]);
    mockAPI.closeBookSession.mockResolvedValueOnce();
    const usi = "position startpos moves 7g7f 3c3d";
    const record = Record.newByUSI(usi) as Record;
    const player = new USIPlayer(
      {
        ...testUSIEngine,
        extraBook: { enabled: true, filePath: "/path/to/book", onTheFly: false },
      },
      10,
    );
    await player.launch();
    expect(mockAPI.openBookAsNewSession).toBeCalledWith("/path/to/book", { forceOnTheFly: false });
    expect(mockAPI.usiLaunch).toBeCalledTimes(1);
    const searchHandler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };
    await player.startSearch(record.position, usi, timeStates, searchHandler);
    expect(mockAPI.searchBookMoves).toBeCalledWith(123, record.position.sfen);
    expect(searchHandler.onMove.mock.calls[0][0].usi).toBe("2g2f");
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
    expect(mockAPI.closeBookSession).toBeCalledTimes(1);
  });

  it("bookMiss", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiQuit.mockResolvedValueOnce();
    mockAPI.openBookAsNewSession.mockResolvedValueOnce(123);
    mockAPI.searchBookMoves.mockResolvedValueOnce([]);
    mockAPI.closeBookSession.mockResolvedValueOnce();
    const usi = "position startpos moves 7g7f 3c3d";
    const record = Record.newByUSI(usi) as Record;
    const player = new USIPlayer(
      {
        ...testUSIEngine,
        extraBook: { enabled: true, filePath: "/path/to/book", onTheFly: false },
      },
      10,
    );
    await player.launch();
    expect(mockAPI.openBookAsNewSession).toBeCalledWith("/path/to/book", { forceOnTheFly: false });
    expect(mockAPI.usiLaunch).toBeCalledTimes(1);
    const searchHandler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };
    await player.startSearch(record.position, usi, timeStates, searchHandler);
    expect(mockAPI.searchBookMoves).toBeCalledWith(123, record.position.sfen);
    expect(mockAPI.usiGo).toBeCalledWith(100, usi, timeStates);
    expect(searchHandler.onMove).not.toBeCalled();
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
    expect(mockAPI.closeBookSession).toBeCalledTimes(1);
  });

  it("bookHit/ponder", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiGoPonder.mockResolvedValueOnce();
    mockAPI.usiQuit.mockResolvedValueOnce();
    mockAPI.openBookAsNewSession.mockResolvedValueOnce(123);
    mockAPI.searchBookMoves.mockResolvedValueOnce([]);
    mockAPI.searchBookMoves.mockResolvedValueOnce([{ usi: "2f2e", comment: "" }]);
    mockAPI.closeBookSession.mockResolvedValueOnce();
    const usi1 = "position startpos moves 7g7f 3c3d";
    const usi2 = "position startpos moves 7g7f 3c3d 2g2f";
    const usi3 = "position startpos moves 7g7f 3c3d 2g2f 8c8d";
    const record1 = Record.newByUSI(usi1) as Record;
    const record2 = Record.newByUSI(usi2) as Record;
    const record3 = Record.newByUSI(usi3) as Record;
    const player = new USIPlayer(
      {
        ...testUSIEngineWithPonder,
        extraBook: { enabled: true, filePath: "/path/to/book", onTheFly: false },
      },
      10,
    );
    await player.launch();
    expect(mockAPI.openBookAsNewSession).toBeCalledWith("/path/to/book", { forceOnTheFly: false });
    expect(mockAPI.usiLaunch).toBeCalledTimes(1);
    const searchHandler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };
    await player.startSearch(record1.position, usi1, timeStates, searchHandler);
    expect(mockAPI.searchBookMoves).toBeCalledWith(123, record1.position.sfen);
    expect(mockAPI.usiGo).toBeCalledWith(100, usi1, timeStates);
    onUSIBestMove(100, usi1, "2g2f", "8c8d");
    await player.startPonder(record2.position, usi2, timeStates);
    expect(mockAPI.usiGoPonder).toBeCalled();
    await player.startSearch(record3.position, usi3, timeStates, searchHandler);
    expect(mockAPI.searchBookMoves).toBeCalledWith(123, record3.position.sfen);
    expect(searchHandler.onMove.mock.calls[1][0].usi).toBe("2f2e");
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
    expect(mockAPI.closeBookSession).toBeCalledTimes(1);
  });

  it("illegalPonderMove", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiGoPonder.mockResolvedValueOnce();
    mockAPI.usiQuit.mockResolvedValueOnce();
    const usi1 = "position startpos moves 7g7f 3c3d";
    const usi2 = "position startpos moves 7g7f 3c3d 2g2f";
    const record1 = Record.newByUSI(usi1) as Record;
    const record2 = Record.newByUSI(usi2) as Record;
    const player = new USIPlayer(testUSIEngineWithPonder, 10);
    await player.launch();
    const searchHandler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };
    await player.startSearch(record1.position, usi1, timeStates, searchHandler);
    expect(mockAPI.usiGo).toBeCalledWith(100, usi1, timeStates);
    onUSIBestMove(100, usi1, "2g2f", "4a3a");
    expect(searchHandler.onMove.mock.calls[0][0].usi).toBe("2g2f");
    await player.startPonder(record2.position, usi2, timeStates);
    expect(mockAPI.usiGoPonder).not.toBeCalled();
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
  });

  it("checkmate", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGoMate.mockResolvedValueOnce();
    const usi = "position sfen 3sks3/9/4+P4/9/7+B1/9/9/9/9 b S2rb4gs4n4l17p 1";
    const record = Record.newByUSI(usi) as Record;
    const player = new USIPlayer(testUSIEngine, 10);
    await player.launch();
    const handler = {
      onCheckmate: vi.fn(),
      onNotImplemented: vi.fn(),
      onTimeout: vi.fn(),
      onNoMate: vi.fn(),
      onError: vi.fn(),
    };
    await player.startMateSearch(record.position, usi, 10, handler);
    expect(mockAPI.usiGoMate).toBeCalledWith(100, usi, 10);
    onUSICheckmate(100, usi, ["2e5b", "4a5b", "S*4b"]);
    expect(handler.onCheckmate).toBeCalledTimes(1);
    expect(handler.onCheckmate.mock.calls[0][0][0].usi).toBe("2e5b");
    expect(handler.onCheckmate.mock.calls[0][0][1].usi).toBe("4a5b");
    expect(handler.onCheckmate.mock.calls[0][0][2].usi).toBe("S*4b");
    expect(handler.onNotImplemented).not.toBeCalled();
    expect(handler.onTimeout).not.toBeCalled();
    expect(handler.onNoMate).not.toBeCalled();
    expect(handler.onError).not.toBeCalled();
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
  });

  it("checkmate/notImplemented", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGoMate.mockResolvedValueOnce();
    const usi = "position sfen 3sks3/9/4+P4/9/7+B1/9/9/9/9 b S2rb4gs4n4l17p 1";
    const record = Record.newByUSI(usi) as Record;
    const player = new USIPlayer(testUSIEngine, 10);
    await player.launch();
    const handler = {
      onCheckmate: vi.fn(),
      onNotImplemented: vi.fn(),
      onTimeout: vi.fn(),
      onNoMate: vi.fn(),
      onError: vi.fn(),
    };
    await player.startMateSearch(record.position, usi, undefined, handler);
    expect(mockAPI.usiGoMate).toBeCalledWith(100, usi, undefined);
    onUSICheckmateNotImplemented(100);
    expect(handler.onCheckmate).not.toBeCalled();
    expect(handler.onNotImplemented).toBeCalledTimes(1);
    expect(handler.onTimeout).not.toBeCalled();
    expect(handler.onNoMate).not.toBeCalled();
    expect(handler.onError).not.toBeCalled();
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
  });

  it("checkmate/noMate", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGoMate.mockResolvedValueOnce();
    const usi = "position sfen 3sks3/9/4+P4/9/7+B1/9/9/9/9 b S2rb4gs4n4l17p 1";
    const record = Record.newByUSI(usi) as Record;
    const player = new USIPlayer(testUSIEngine, 10);
    await player.launch();
    const handler = {
      onCheckmate: vi.fn(),
      onNotImplemented: vi.fn(),
      onTimeout: vi.fn(),
      onNoMate: vi.fn(),
      onError: vi.fn(),
    };
    await player.startMateSearch(record.position, usi, undefined, handler);
    expect(mockAPI.usiGoMate).toBeCalledWith(100, usi, undefined);
    onUSINoMate(100, usi);
    expect(handler.onCheckmate).not.toBeCalled();
    expect(handler.onNotImplemented).not.toBeCalled();
    expect(handler.onTimeout).not.toBeCalled();
    expect(handler.onNoMate).toBeCalledTimes(1);
    expect(handler.onError).not.toBeCalled();
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
  });

  it("onUSIInfo", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    const usi = "position startpos moves 7g7f 3c3d";
    const record = Record.newByUSI(usi) as Record;
    const onSearchInfo = vi.fn();
    const player = new USIPlayer(testUSIEngine, 10, onSearchInfo);
    await player.launch();
    const searchHandler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };
    await player.startSearch(record.position, usi, timeStates, searchHandler);

    // 深さ 15 の評価値と最善種
    onUSIInfo(100, usi, {
      multipv: 1,
      depth: 15,
      scoreCP: 81,
      currmove: "2g2f",
    });
    expect(onSearchInfo).not.toBeCalled();
    vi.runOnlyPendingTimers();
    expect(onSearchInfo).toBeCalledTimes(1);
    expect(onSearchInfo).lastCalledWith({
      usi,
      depth: 15,
      pv: parsePV(record.position, "▲２六歩"),
      score: 81,
    });

    // 深さ 16
    onUSIInfo(100, usi, {
      multipv: 1,
      depth: 16,
      scoreCP: 32,
      currmove: "5g5f",
      pv: ["5g5f", "8c8d", "5f5e"],
    });
    expect(onSearchInfo).toBeCalledTimes(1);
    // タイマーが作動する前に深さ 17 が来た場合はその情報で上書きされる。

    // 深さ 17 の評価値と PV
    onUSIInfo(100, usi, {
      multipv: 1,
      depth: 17,
      scoreCP: 123,
      currmove: "2g2f",
      pv: ["2g2f", "8c8d", "2f2e"],
    });
    vi.runOnlyPendingTimers();
    expect(onSearchInfo).toBeCalledTimes(2);
    expect(onSearchInfo).lastCalledWith({
      usi,
      depth: 17,
      pv: parsePV(record.position, "▲２六歩△８四歩▲２五歩"),
      score: 123,
    });

    // 評価値とメッセージ
    onUSIInfo(100, usi, {
      multipv: 1,
      scoreCP: -75,
      string: "free format message",
    });
    vi.runOnlyPendingTimers();
    expect(onSearchInfo).toBeCalledTimes(3);
    expect(onSearchInfo).lastCalledWith({
      usi,
      depth: 17,
      pv: parsePV(record.position, "▲２六歩△８四歩▲２五歩"),
      score: -75,
    });

    // Multi PV 第 2 位
    onUSIInfo(100, usi, {
      multipv: 2,
      depth: 17,
      scoreCP: -98,
      currmove: "5g5f",
      pv: ["5g5f", "8c8d", "5f5e"],
    });
    vi.runOnlyPendingTimers();
    expect(onSearchInfo).toBeCalledTimes(3);
    await player.close();
    expect(mockAPI.usiQuit).toBeCalledWith(100);
  });
});
