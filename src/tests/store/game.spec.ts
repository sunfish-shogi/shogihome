import { TimeoutChain } from "@/helpers/testing";
import {
  InitialPositionType,
  Move,
  RecordMetadataKey,
  SpecialMove,
} from "@/shogi";
import { Clock } from "@/store/clock";
import { GameManager } from "@/store/game";
import { RecordManager } from "@/store/record";
import { playerURI01, playerURI02, gameSetting10m30s } from "../mock/game";
import { createMockPlayer, createMockPlayerBuilder } from "../mock/player";

function createMockHandlers() {
  return {
    onSaveRecord: jest.fn(),
    onGameNext: jest.fn(),
    onGameEnd: jest.fn(),
    onPieceBeat: jest.fn(),
    onBeepShort: jest.fn(),
    onBeepUnlimited: jest.fn(),
    onStopBeep: jest.fn(),
    onError: jest.fn(),
  };
}

describe("store/game", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("GameManager/resign", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        {
          sfen: "7g7f",
          info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
        },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        {
          sfen: "2g2f",
          info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
        },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        {
          sfen: "3c3d",
          info: { score: 64, pv: ["2g2f", "8c8d"] },
        },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        { sfen: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s, mockPlayerBuilder))
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd.mock.calls[0][0]).toStrictEqual({
          player1: { name: "USI Engine 01", win: 1 },
          player2: { name: "USI Engine 02", win: 0 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(mockHandlers.onGameEnd.mock.calls[0][1]).toBe(
          SpecialMove.RESIGN
        );
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f"
        );
        expect(recordManager.record.moves[1].comment).toBe(
          "互角\n*評価値=82\n*読み筋=△３四歩(33)▲２六歩(27)△８四歩(83)\n"
        );
        expect(recordManager.record.moves[2].comment).toBe(
          "互角\n*評価値=64\n*読み筋=▲２六歩(27)△８四歩(83)\n"
        );
        expect(recordManager.record.moves[3].comment).toBe(
          "互角\n*評価値=78\n*読み筋=△８四歩(83)▲２五歩(26)△８五歩(84)\n"
        );
      })
      .invoke();
  });

  it("GameManager/handicap-bishop", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b":
        { sfen: "7g7f" },
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f 2c2d":
        { sfen: "resign" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves":
        { sfen: "8b2b" },
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f":
        { sfen: "2c2d" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() =>
        manager.startGame(
          {
            ...gameSetting10m30s,
            startPosition: InitialPositionType.HANDICAP_BISHOP,
          },
          mockPlayerBuilder
        )
      )
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f 2c2d"
        );
      })
      .invoke();
  });

  it("GameManager/endGame", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        { sfen: "7g7f" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        { sfen: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        { sfen: "3c3d" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        { sfen: "no-reply" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s, mockPlayerBuilder))
      .next(() => manager.endGame(SpecialMove.INTERRUPT))
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(0);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(0);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd.mock.calls[0][0]).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0 },
          player2: { name: "USI Engine 02", win: 0 },
          draw: 0,
          invalid: 1,
          total: 1,
        });
        expect(mockHandlers.onGameEnd.mock.calls[0][1]).toBe(
          SpecialMove.INTERRUPT
        );
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f"
        );
      })
      .invoke();
  });

  it("GameManager/time-not-reduced", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        { sfen: "7g7f" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        { sfen: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        { sfen: "3c3d" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        { sfen: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const blackClock = new Clock();
    const whiteClock = new Clock();
    const manager = new GameManager(
      recordManager,
      blackClock,
      whiteClock,
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s, mockPlayerBuilder))
      .next(() => {
        expect(blackClock.timeMs).toBe(600 * 1e3);
        expect(whiteClock.timeMs).toBe(600 * 1e3);
      })
      .invoke();
  });

  it("GameManager/resign/twice", () => {
    const mockBlackPlayer = createMockPlayer({
      // 1st game
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        { sfen: "7g7f" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        { sfen: "2g2f" },
      // 2nd game
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        { sfen: "3c3d" },
    });
    const mockWhitePlayer = createMockPlayer({
      // 1st game
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        { sfen: "3c3d" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        { sfen: "resign" },
      // 2nd game
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        { sfen: "7g7f" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        { sfen: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => {
        manager.startGame(
          {
            ...gameSetting10m30s,
            repeat: 2,
          },
          mockPlayerBuilder
        );
        expect(
          recordManager.record.metadata.getStandardMetadata(
            RecordMetadataKey.TITLE
          )
        ).toBe("連続対局 1/2");
        expect(manager.setting.black.name).toBe("USI Engine 01");
        expect(manager.setting.white.name).toBe("USI Engine 02");
      })
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves"
        );
        expect(
          recordManager.record.metadata.getStandardMetadata(
            RecordMetadataKey.TITLE
          )
        ).toBe("連続対局 2/2");
        expect(manager.setting.black.name).toBe("USI Engine 02");
        expect(manager.setting.white.name).toBe("USI Engine 01");
      })
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(3);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(4);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(2);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(2);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(4);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(3);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(2);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(2);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd.mock.calls[0][0]).toStrictEqual({
          player1: { name: "USI Engine 02", win: 0 },
          player2: { name: "USI Engine 01", win: 2 },
          draw: 0,
          invalid: 0,
          total: 2,
        });
        expect(mockHandlers.onGameEnd.mock.calls[0][1]).toBe(
          SpecialMove.RESIGN
        );
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(14);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d"
        );
      })
      .invoke();
  });

  it("GameManager/noStartPosition/twice", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        { sfen: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        { sfen: "3c3d" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        { sfen: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.appendMove({
      move: recordManager.record.position.createMoveBySFEN("7g7f") as Move,
    });
    const manager = new GameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => {
        manager.startGame(
          {
            ...gameSetting10m30s,
            startPosition: undefined,
            repeat: 2,
            swapPlayers: false,
          },
          mockPlayerBuilder
        );
        expect(
          recordManager.record.metadata.getStandardMetadata(
            RecordMetadataKey.TITLE
          )
        ).toBe("連続対局 1/2");
        expect(manager.setting.black.name).toBe("USI Engine 01");
        expect(manager.setting.white.name).toBe("USI Engine 02");
      })
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(1);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(1);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(6);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f"
        );
        expect(
          recordManager.record.metadata.getStandardMetadata(
            RecordMetadataKey.TITLE
          )
        ).toBe("連続対局 2/2");
        expect(manager.setting.black.name).toBe("USI Engine 01");
        expect(manager.setting.white.name).toBe("USI Engine 02");
      })
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(4);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(2);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(2);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(4);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(2);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(2);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd.mock.calls[0][0]).toStrictEqual({
          player1: { name: "USI Engine 01", win: 2 },
          player2: { name: "USI Engine 02", win: 0 },
          draw: 0,
          invalid: 0,
          total: 2,
        });
        expect(mockHandlers.onGameEnd.mock.calls[0][1]).toBe(
          SpecialMove.RESIGN
        );
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(12);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f"
        );
      })
      .invoke();
  });

  it("GameManager/maxMoves", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        { sfen: "7g7f" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        { sfen: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        { sfen: "3c3d" },
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        { sfen: "8c8d" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() =>
        manager.startGame(
          {
            ...gameSetting10m30s,
            maxMoves: 4,
          },
          mockPlayerBuilder
        )
      )
      .next(() => {
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd.mock.calls[0][0]).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0 },
          player2: { name: "USI Engine 02", win: 0 },
          draw: 1,
          invalid: 0,
          total: 1,
        });
        expect(mockHandlers.onGameEnd.mock.calls[0][1]).toBe(
          SpecialMove.IMPASS
        );
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(9);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d"
        );
      })
      .invoke();
  });
});
