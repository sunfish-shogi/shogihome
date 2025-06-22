import { InitialPositionType, Move, RecordMetadataKey, SpecialMoveType } from "tsshogi";
import { Clock } from "@/renderer/store/clock.js";
import {
  calculateGameStatistics,
  GameManager,
  GameResults,
  StartPositionList,
} from "@/renderer/store/game.js";
import { RecordManager } from "@/renderer/store/record.js";
import { playerURI01, playerURI02, gameSettings10m30s } from "@/tests/mock/game.js";
import { createMockPlayer, createMockPlayerBuilder } from "@/tests/mock/player.js";
import { GameSettings, JishogiRule } from "@/common/settings/game.js";
import { PlayerBuilder } from "@/renderer/players/builder.js";
import api, { API } from "@/renderer/ipc/api.js";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

export interface MockGameHandlers {
  onError(): void;
  onSaveRecord(): void;
  onGameNext(): void;
  onPieceBeat(): void;
  onBeepShort(): void;
  onBeepUnlimited(): void;
  onStopBeep(): void;
}

function createMockHandlers() {
  return {
    onError: vi.fn(),
    onSaveRecord: vi.fn().mockReturnValue(Promise.resolve()),
    onGameNext: vi.fn(),
    onPieceBeat: vi.fn(),
    onBeepShort: vi.fn(),
    onBeepUnlimited: vi.fn(),
    onStopBeep: vi.fn(),
  };
}

function invoke(
  recordManager: RecordManager,
  handlers: MockGameHandlers,
  gameSettings: GameSettings,
  playerBuilder: PlayerBuilder,
  assert: (gameResults: GameResults, specialMoveType: SpecialMoveType) => void,
  interrupt?: (manager: GameManager) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const manager = new GameManager(recordManager, new Clock(), new Clock())
      .on("gameEnd", (gameResults, specialMoveType) => {
        try {
          assert(gameResults, specialMoveType);
          resolve();
        } catch (e) {
          reject(e);
        }
      })
      .on("error", handlers.onError)
      .on("saveRecord", handlers.onSaveRecord)
      .on("gameNext", handlers.onGameNext)
      .on("pieceBeat", handlers.onPieceBeat)
      .on("beepShort", handlers.onBeepShort)
      .on("beepUnlimited", handlers.onBeepUnlimited)
      .on("stopBeep", handlers.onStopBeep);
    manager
      .start(gameSettings, playerBuilder)
      .then(() => {
        if (interrupt) {
          interrupt(manager);
        }
      })
      .catch(reject);
  });
}

describe("store/game", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("statistics/case1", async () => {
    const statistics = calculateGameStatistics({
      player1: { name: "Player1", win: 15, winBlack: 8, winWhite: 7 },
      player2: { name: "Player2", win: 3, winBlack: 1, winWhite: 2 },
      draw: 2,
      invalid: 1,
      total: 21,
    });
    expect(statistics.rating.toPrecision(6)).toBe("279.588");
    expect(statistics.ratingLower.toPrecision(6)).toBe("116.129");
    expect(statistics.ratingUpper.toPrecision(6)).toBe("NaN");
    expect(statistics.zValue.toPrecision(6)).toBe("2.82843");
    expect(statistics.npIsGreaterThan5).toBeTruthy();
    expect(statistics.significance5pc).toBeTruthy();
    expect(statistics.significance1pc).toBeTruthy();
  });

  it("statistics/case2", async () => {
    const statistics = calculateGameStatistics({
      player1: { name: "Player1", win: 9, winBlack: 5, winWhite: 4 },
      player2: { name: "Player2", win: 1, winBlack: 0, winWhite: 1 },
      draw: 2,
      invalid: 1,
      total: 13,
    });
    expect(statistics.npIsGreaterThan5).toBeFalsy();
    expect(statistics.rating.toPrecision(6)).toBe("381.697");
    expect(statistics.ratingLower.toPrecision(6)).toBe("158.982");
    expect(statistics.ratingUpper.toPrecision(6)).toBe("NaN");
    expect(statistics.zValue.toPrecision(6)).toBe("2.52982");
    expect(statistics.significance5pc).toBeTruthy();
    expect(statistics.significance1pc).toBeFalsy();
  });

  it("statistics/case3", async () => {
    const statistics = calculateGameStatistics({
      player1: { name: "Player1", win: 76, winBlack: 31, winWhite: 45 },
      player2: { name: "Player2", win: 21, winBlack: 9, winWhite: 12 },
      draw: 2,
      invalid: 1,
      total: 100,
    });
    expect(statistics.npIsGreaterThan5).toBeTruthy();
    expect(statistics.rating.toPrecision(6)).toBe("223.438");
    expect(statistics.ratingLower.toPrecision(6)).toBe("148.469");
    expect(statistics.ratingUpper.toPrecision(6)).toBe("323.370");
    expect(statistics.zValue.toPrecision(6)).toBe("5.58440");
    expect(statistics.significance5pc).toBeTruthy();
    expect(statistics.significance1pc).toBeTruthy();
  });

  it("StartPositionList", async () => {
    mockAPI.loadSFENFile.mockImplementation(async () => [
      "position startpos moves 2g2f 3c3d 7g7f",
      "position startpos moves 2g2f 8c8d 2f2e",
      "position startpos moves 7g7f 8b3b 2g2f",
      "position startpos moves 7g7f 8c8d 2g2f",
    ]);
    const list = new StartPositionList();
    expect(list.next()).toBe("position startpos");

    // no swapping / sequential / 2 games
    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: false,
        order: "sequential",
        maxGames: 2,
      }),
    ).resolves.toBeUndefined();
    expect(mockAPI.loadSFENFile).toBeCalledWith("path/to/file.sfen");
    expect(list.next()).toBe("position startpos moves 2g2f 3c3d 7g7f");
    expect(list.next()).toBe("position startpos moves 2g2f 8c8d 2f2e");

    // no swapping / shuffle / 2 games
    const variations = new Set<string>();
    for (let i = 0; i < 100; i++) {
      await expect(
        list.reset({
          filePath: "path/to/file.sfen",
          swapPlayers: false,
          order: "shuffle",
          maxGames: 2,
        }),
      ).resolves.toBeUndefined();
      const first = list.next();
      const second = list.next();
      expect(first).match(/^position startpos moves /);
      expect(second).match(/^position startpos moves /);
      expect(first).not.toBe(second);
      variations.add(first);
    }
    expect(variations.size).toBe(4);

    // swapping / sequential / 4 games
    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: true,
        order: "sequential",
        maxGames: 4,
      }),
    ).resolves.toBeUndefined();
    expect(list.next()).toBe("position startpos moves 2g2f 3c3d 7g7f"); // 1st position, 1st game
    expect(list.next()).toBe("position startpos moves 2g2f 3c3d 7g7f"); // 1st position, 2nd game
    expect(list.next()).toBe("position startpos moves 2g2f 8c8d 2f2e"); // 2nd position, 1st game
    expect(list.next()).toBe("position startpos moves 2g2f 8c8d 2f2e"); // 2nd position, 2nd game

    // no swapping / sequential / 6 games
    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: false,
        order: "sequential",
        maxGames: 6,
      }),
    ).resolves.toBeUndefined();
    expect(list.next()).toBe("position startpos moves 2g2f 3c3d 7g7f");
    expect(list.next()).toBe("position startpos moves 2g2f 8c8d 2f2e");
    expect(list.next()).toBe("position startpos moves 7g7f 8b3b 2g2f");
    expect(list.next()).toBe("position startpos moves 7g7f 8c8d 2g2f");
    expect(list.next()).toBe("position startpos moves 2g2f 3c3d 7g7f");
    expect(list.next()).toBe("position startpos moves 2g2f 8c8d 2f2e");
  });

  it("StartPositionList/simple-sfen", async () => {
    mockAPI.loadSFENFile.mockImplementation(async () => [
      "ln1g3+Rl/2sk1s+P2/2ppppb1p/p1b3p2/8P/P4P3/2PPP1P2/1+r2GS3/LN+p2KGNL w GN2Ps 36",
      "ln1g2B+Rl/2s6/pPppppk2/6p1p/9/4P1P1P/P1PPSP3/3+psK3/L+r3G1NL b SNb2gn2p 39",
      "ln+P3s+Pl/2+R1Gsk2/p3pp1g1/4r1ppp/1NS6/6P2/PP1+bPPS1P/3+p1K3/LG3G1NL w Nb3p 72",
      "lnsgk2+Pl/6+N2/p1pp2p1p/4p2R1/9/2P3P2/P2PPPN1P/4s1g1K/L4+r2L w 2B2SN4P2g 56",
    ]);
    const list = new StartPositionList();
    expect(list.next()).toBe("position startpos");

    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: false,
        order: "sequential",
        maxGames: 4,
      }),
    ).resolves.toBeUndefined();
    expect(mockAPI.loadSFENFile).toBeCalledWith("path/to/file.sfen");
    expect(list.next()).toBe(
      "sfen ln1g3+Rl/2sk1s+P2/2ppppb1p/p1b3p2/8P/P4P3/2PPP1P2/1+r2GS3/LN+p2KGNL w GN2Ps 36",
    );
    expect(list.next()).toBe(
      "sfen ln1g2B+Rl/2s6/pPppppk2/6p1p/9/4P1P1P/P1PPSP3/3+psK3/L+r3G1NL b SNb2gn2p 39",
    );
    expect(list.next()).toBe(
      "sfen ln+P3s+Pl/2+R1Gsk2/p3pp1g1/4r1ppp/1NS6/6P2/PP1+bPPS1P/3+p1K3/LG3G1NL w Nb3p 72",
    );
    expect(list.next()).toBe(
      "sfen lnsgk2+Pl/6+N2/p1pp2p1p/4p2R1/9/2P3P2/P2PPPN1P/4s1g1K/L4+r2L w 2B2SN4P2g 56",
    );
  });

  it("StartPositionList/empty", async () => {
    mockAPI.loadSFENFile.mockResolvedValueOnce([]);
    const list = new StartPositionList();
    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: false,
        order: "sequential",
        maxGames: 2,
      }),
    ).rejects.toThrow("No available positions in the list.");
  });

  it("StartPositionList/invalid", async () => {
    mockAPI.loadSFENFile.mockImplementation(async () => [
      "position startpos moves 2g2f 3c3d 7g7f",
      "position startpos moves 2g2f 8c8d 2f2e",
      "invalid position",
      "position startpos moves 7g7f 8c8d 2g2f",
    ]);
    const list = new StartPositionList();
    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: false,
        order: "sequential",
        maxGames: 2,
      }),
    ).resolves.toBeUndefined();
    await expect(
      list.reset({
        filePath: "path/to/file.sfen",
        swapPlayers: false,
        order: "sequential",
        maxGames: 3,
      }),
    ).rejects.toThrow("Invalid USI: invalid position");
  });

  it("GameManager/resign", () => {
    const mockBlackPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
        info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "2g2f",
        info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
      },
    });
    const mockWhitePlayer = createMockPlayer({
      "position startpos moves 7g7f": {
        usi: "3c3d",
        info: { score: 64, pv: ["2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d 2g2f": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      gameSettings10m30s,
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 1, winBlack: 1, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.RESIGN);
        expect(mockBlackPlayer.readyNewGame).toBeCalledTimes(1);
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.readyNewGame).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(recordManager.record.usi).toBe("position startpos moves 7g7f 3c3d 2g2f");
        expect(recordManager.record.moves[1].comment).toBe(
          "互角\n*評価値=82\n*読み筋=△３四歩▲２六歩△８四歩\n*エンジン=USI Engine 01\n",
        );
        expect(recordManager.record.moves[2].comment).toBe(
          "互角\n*評価値=64\n*読み筋=▲２六歩△８四歩\n*エンジン=USI Engine 02\n",
        );
        expect(recordManager.record.moves[3].comment).toBe(
          "互角\n*評価値=78\n*読み筋=△８四歩▲２五歩△８五歩\n*エンジン=USI Engine 01\n",
        );
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/handicap-bishop", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b": {
        usi: "7g7f",
      },
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f 2c2d":
        {
          usi: "resign",
        },
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1": {
        usi: "8b2b",
      },
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f":
        { usi: "2c2d" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: InitialPositionType.HANDICAP_BISHOP,
      },
      mockPlayerBuilder,
      () => {
        expect(mockBlackPlayer.readyNewGame).toBeCalledTimes(1);
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.readyNewGame).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f 2c2d",
        );
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/endGame", () => {
    const mockBlackPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
      },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position startpos moves 7g7f": {
        usi: "3c3d",
      },
      "position startpos moves 7g7f 3c3d 2g2f": {
        usi: "no-reply",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      gameSettings10m30s,
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 1,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.INTERRUPT);
        expect(mockBlackPlayer.readyNewGame).toBeCalledTimes(1);
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(2);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(0);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.readyNewGame).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(2);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(0);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(8);
        expect(recordManager.record.usi).toBe("position startpos moves 7g7f 3c3d 2g2f");
        expect(mockHandlers.onError).not.toBeCalled();
      },
      (manager) => {
        setTimeout(() => manager.stop(), 100);
      },
    );
  });

  it("GameManager/resign/twice", () => {
    const mockBlackPlayer = createMockPlayer({
      // 1st game
      "position startpos": {
        usi: "7g7f",
      },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
      // 2nd game
      "position startpos moves 7g7f": {
        usi: "3c3d",
      },
    });
    const mockWhitePlayer = createMockPlayer({
      // 1st game
      "position startpos moves 7g7f": {
        usi: "3c3d",
      },
      "position startpos moves 7g7f 3c3d 2g2f": {
        usi: "resign",
      },
      // 2nd game
      "position startpos": {
        usi: "7g7f",
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        repeat: 2,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 01", win: 2, winBlack: 1, winWhite: 1 },
          draw: 0,
          invalid: 0,
          total: 2,
        });
        expect(specialMoveType).toBe(SpecialMoveType.RESIGN);
        expect(recordManager.record.metadata.getStandardMetadata(RecordMetadataKey.TITLE)).toBe(
          "連続対局 2/2",
        );
        expect(mockBlackPlayer.readyNewGame).toBeCalledTimes(2);
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(3);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(4);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(2);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.readyNewGame).toBeCalledTimes(2);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(4);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(3);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(2);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(14);
        expect(recordManager.record.usi).toBe("position startpos moves 7g7f 3c3d");
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/noStartPosition/twice", () => {
    const mockBlackPlayer = createMockPlayer({
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position startpos moves 7g7f": {
        usi: "3c3d",
      },
      "position startpos moves 7g7f 3c3d 2g2f": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.appendMove({
      move: recordManager.record.position.createMoveByUSI("7g7f") as Move,
    });

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        repeat: 2,
        swapPlayers: false,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 2, winBlack: 2, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 2,
        });
        expect(specialMoveType).toBe(SpecialMoveType.RESIGN);
        expect(recordManager.record.metadata.getStandardMetadata(RecordMetadataKey.TITLE)).toBe(
          "連続対局 2/2",
        );
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(2);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(4);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(2);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(4);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(2);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(2);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(12);
        expect(recordManager.record.usi).toBe("position startpos moves 7g7f 3c3d 2g2f");
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/maxMoves", () => {
    // 4手で maxMoves に到達して引き分け
    const mockBlackPlayer = createMockPlayer({
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position startpos moves 7g7f": { usi: "3c3d" },
      "position startpos moves 7g7f 3c3d 2g2f": { usi: "8c8d" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        maxMoves: 4,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 1,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.IMPASS);
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
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(9);
        expect(recordManager.record.usi).toBe("position startpos moves 7g7f 3c3d 2g2f 8c8d");
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/maxMoves/extending", () => {
    // 4手で maxMoves に到達するが王手がかかっているため延長する。
    const mockBlackPlayer = createMockPlayer({
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
      "position startpos moves 7g7f 3c3d 2g2f 2b7g+": { usi: "5i5h" },
      "position startpos moves 7g7f 3c3d 2g2f 2b7g+ 5i5h 7g6g": { usi: "5h5i" },
    });
    const mockWhitePlayer = createMockPlayer({
      "position startpos moves 7g7f": { usi: "3c3d" },
      "position startpos moves 7g7f 3c3d 2g2f": { usi: "2b7g+" }, // 王手
      "position startpos moves 7g7f 3c3d 2g2f 2b7g+ 5i5h": { usi: "7g6g" }, // 王手
      "position startpos moves 7g7f 3c3d 2g2f 2b7g+ 5i5h 7g6g 5h5i": { usi: "6g8i" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        maxMoves: 4,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 1,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.IMPASS);
        expect(mockBlackPlayer.startSearch).toBeCalledTimes(4);
        expect(mockBlackPlayer.startPonder).toBeCalledTimes(4);
        expect(mockBlackPlayer.gameover).toBeCalledTimes(1);
        expect(mockBlackPlayer.stop).toBeCalledTimes(0);
        expect(mockBlackPlayer.close).toBeCalledTimes(1);
        expect(mockWhitePlayer.startSearch).toBeCalledTimes(4);
        expect(mockWhitePlayer.startPonder).toBeCalledTimes(4);
        expect(mockWhitePlayer.gameover).toBeCalledTimes(1);
        expect(mockWhitePlayer.stop).toBeCalledTimes(0);
        expect(mockWhitePlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onBeepShort).toBeCalledTimes(0);
        expect(mockHandlers.onBeepUnlimited).toBeCalledTimes(0);
        expect(mockHandlers.onStopBeep).toBeCalledTimes(17);
        expect(recordManager.record.usi).toBe(
          "position startpos moves 7g7f 3c3d 2g2f 2b7g+ 5i5h 7g6g 5h5i 6g8i",
        );
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/declaration/black/accepted", () => {
    // https://denryu-sen.jp/denryusen/dr4_production/dist/#/dr4prd+buoy_blackbid300_dr4b-9-top_4_burningbridges_honeywaffle-600-2F+burningbridges+honeywaffle+20231203185029/358
    const sfen = "1Rn1S+S2+B/2S1GGppK/4pG2L/5G2+B/9/5n3/1+p+l6/+lk7/9 b RS2NL11P3p 1";
    const mockBlackPlayer = createMockPlayer({
      [`position sfen ${sfen}`]: { usi: "4d5c" },
      [`position sfen ${sfen} moves 4d5c 2b2c`]: { usi: "win" },
    });
    const mockWhitePlayer = createMockPlayer({
      [`position sfen ${sfen} moves 4d5c`]: { usi: "2b2c" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(sfen);

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        jishogiRule: JishogiRule.GENERAL24,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 1, winBlack: 1, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.ENTERING_OF_KING);
        expect(recordManager.record.usi).toBe(`position sfen ${sfen} moves 4d5c 2b2c`);
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/declaration/black/rejected", () => {
    // https://denryu-sen.jp/denryusen/dr4_production/dist/#/dr4prd+buoy_blackbid300_dr4b-9-top_4_burningbridges_honeywaffle-600-2F+burningbridges+honeywaffle+20231203185029/356
    const sfen = "1Rn1S+S1p+B/4GGp1K/4pG2L/5G2+B/9/5n3/1+p+l6/+lk7/9 b R2S2NL11P3p 1";
    const mockBlackPlayer = createMockPlayer({
      [`position sfen ${sfen}`]: { usi: "S*7b" },
      [`position sfen ${sfen} moves S*7b 2a2b`]: { usi: "win" },
    });
    const mockWhitePlayer = createMockPlayer({
      [`position sfen ${sfen} moves S*7b`]: { usi: "2a2b" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(sfen);

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        jishogiRule: JishogiRule.GENERAL24,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 1, winBlack: 0, winWhite: 1 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.FOUL_LOSE);
        expect(recordManager.record.usi).toBe(`position sfen ${sfen} moves S*7b 2a2b`);
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/declaration/white/accepted", () => {
    // https://denryu-sen.jp/denryusen/dr4_production/dist/#/dr4prd+buoy_blackbid300_dr4a-7-bottom_4_tanuki_dlshogi-600-2F+tanuki+dlshogi+20231203170524/265
    const sfen = "1+N+L1+S4/9/+PK+P6/1G7/9/2+r6/+p1+p2g+p+p+p/1sk2+p3/8+r w 2b2g2s3n3l10p 1";
    const mockBlackPlayer = createMockPlayer({
      [`position sfen ${sfen} moves G*6g`]: { usi: "9c8b" },
    });
    const mockWhitePlayer = createMockPlayer({
      [`position sfen ${sfen}`]: { usi: "G*6g" },
      [`position sfen ${sfen} moves G*6g 9c8b`]: { usi: "win" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(sfen);

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        jishogiRule: JishogiRule.GENERAL24,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 1, winBlack: 0, winWhite: 1 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.ENTERING_OF_KING);
        expect(recordManager.record.usi).toBe(`position sfen ${sfen} moves G*6g 9c8b`);
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/try/black", () => {
    const sfen = "1R2+SK2+B/2S+SGGp2/4GG1pL/8+B/9/9/1+p+l6/+lk+n3+n2/9 b RS2NL12P3p 1";
    const mockBlackPlayer = createMockPlayer({
      [`position sfen ${sfen}`]: { usi: "5a6a" },
      [`position sfen ${sfen} moves 5a6a P*6g`]: { usi: "4a5a" },
    });
    const mockWhitePlayer = createMockPlayer({
      [`position sfen ${sfen} moves 5a6a`]: { usi: "P*6g" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(sfen);

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        jishogiRule: JishogiRule.TRY,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 1, winBlack: 1, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.TRY);
        expect(recordManager.record.usi).toBe(`position sfen ${sfen} moves 5a6a P*6g 4a5a`);
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/try/white", () => {
    const sfen = "1Rn1S+SK2/2S1GGp2/2R1GG1pL/9/7+B1/2P6/1+p+B+l5/+l3pp+n2/3k5 w S2NL11Pp 1";
    const mockBlackPlayer = createMockPlayer({
      [`position sfen ${sfen} moves 8g7g`]: { usi: "2e3e" },
    });
    const mockWhitePlayer = createMockPlayer({
      [`position sfen ${sfen}`]: { usi: "8g7g" },
      [`position sfen ${sfen} moves 8g7g 2e3e`]: { usi: "6i5i" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(sfen);

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        jishogiRule: JishogiRule.TRY,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 0, winBlack: 0, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 1, winBlack: 0, winWhite: 1 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.TRY);
        expect(recordManager.record.usi).toBe(`position sfen ${sfen} moves 8g7g 2e3e 6i5i`);
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });

  it("GameManager/illegal-try/white", () => {
    const sfen = "1Rn1S+SK2/2S1GGp2/2R1GG1pL/9/7+B1/2P6/1+p+B+l5/+l3pp+n2/3k5 w S2NL11Pp 1";
    const mockBlackPlayer = createMockPlayer({});
    const mockWhitePlayer = createMockPlayer({
      [`position sfen ${sfen}`]: { usi: "6i5i" }, // 王手放置
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.resetBySFEN(sfen);

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "current",
        jishogiRule: JishogiRule.TRY,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 1, winBlack: 1, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 1,
        });
        expect(specialMoveType).toBe(SpecialMoveType.FOUL_LOSE);
        expect(recordManager.record.usi).toBe(`position sfen ${sfen}`);
        expect(mockHandlers.onError).toBeCalledTimes(1);
      },
    );
  });

  it("GameManager/startPositionList/valid", () => {
    mockAPI.loadSFENFile.mockResolvedValueOnce([
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5a6b 6h7h 6b7b",
      "position startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 9c9d 5i6h 5a5b",
      "position startpos moves 7g7f 8b3b 2g2f 5a6b 2f2e 3c3d 5i6h 3a4b 6h7h 2b3c 3i4h",
      "position startpos moves 7g7f 8c8d 2g2f 8d8e 2f2e 4a3b 8h7g 3c3d 7i6h 2b7g+ 6h7g 3a2b",
    ]);
    const mockBlackPlayer = createMockPlayer({
      // 1st game (black)
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5a6b 6h7h 6b7b": { usi: "2f2e" },
      // 2nd game (white)
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5a6b 6h7h 6b7b 4i5h": {
        usi: "resign",
      },
      // 3rd game (black)
      "position startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 9c9d 5i6h 5a5b": {
        usi: "3g3f",
      },
      // 4th game (white)
      "position startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 9c9d 5i6h 5a5b 2e2d": {
        usi: "resign",
      },
    });
    const mockWhitePlayer = createMockPlayer({
      // 1st game (white)
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5a6b 6h7h 6b7b 2f2e": {
        usi: "resign",
      },
      // 2nd game (black)
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5a6b 6h7h 6b7b": { usi: "4i5h" },
      // 3rd game (white)
      "position startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 9c9d 5i6h 5a5b 3g3f": {
        usi: "resign",
      },
      // 4th game (black)
      "position startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 9c9d 5i6h 5a5b": {
        usi: "2e2d",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockBlackPlayer,
      [playerURI02]: mockWhitePlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();

    return invoke(
      recordManager,
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "list",
        startPositionListFile: "test.sfen",
        startPositionListOrder: "sequential",
        repeat: 4,
      },
      mockPlayerBuilder,
      (gameResults, specialMoveType) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 02", win: 2, winBlack: 2, winWhite: 0 },
          player2: { name: "USI Engine 01", win: 2, winBlack: 2, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 4,
        });
        expect(specialMoveType).toBe(SpecialMoveType.RESIGN);
        expect(recordManager.record.metadata.getStandardMetadata(RecordMetadataKey.TITLE)).toBe(
          "連続対局 4/4",
        );
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });
});
