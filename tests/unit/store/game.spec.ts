import { TimeoutChain } from "@/helpers/testing";
import { Player, SearchHandler } from "@/players/player";
import { GameSetting, PlayerSetting } from "@/settings/game";
import {
  ImmutableRecord,
  InitialPositionType,
  Move,
  Position,
  SpecialMove,
} from "@/shogi";
import { GameManager } from "@/store/game";
import { RecordManager } from "@/store/record";
import { gameSetting10m30s } from "../mock/game";

function createMockPlayer(moves: { [usi: string]: string }) {
  return {
    isEngine(): boolean {
      return false;
    },
    startSearch: jest.fn(
      (
        r: ImmutableRecord,
        s: GameSetting,
        bt: number,
        wt: number,
        h: SearchHandler
      ) => {
        const sfen = moves[r.usi];
        if (sfen === "no-reply") {
          // eslint-disable-next-line  @typescript-eslint/no-empty-function
          return new Promise<void>(() => {});
        }
        if (sfen === "resign") {
          h.onResign();
          return Promise.resolve();
        }
        const move = r.position.createMoveBySFEN(sfen) as Move;
        h.onMove(move);
        return Promise.resolve();
      }
    ),
    startPonder: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    gameover: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve()),
  };
}

function createMockPlayerBuilder(blackPlayer: Player, whitePlayer: Player) {
  return {
    build: (playerSetting: PlayerSetting) => {
      switch (playerSetting.uri) {
        case "es://usi/test-engine-01":
          return Promise.resolve(blackPlayer);
        case "es://usi/test-engine-02":
          return Promise.resolve(whitePlayer);
      }
      throw new Error("unexpected player URI");
    },
  };
}

function createMockHandlers() {
  return {
    onEndGame: jest.fn(),
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
        "7g7f",
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        "2g2f",
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        "3c3d",
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        "resign",
    });
    const mockPlayerBuilder = createMockPlayerBuilder(
      mockBlackPlayer,
      mockWhitePlayer
    );
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      mockPlayerBuilder,
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s))
      .next(() => {
        expect(mockBlackPlayer.startSearch.mock.calls.length).toBe(2);
        expect(mockBlackPlayer.startPonder.mock.calls.length).toBe(2);
        expect(mockBlackPlayer.gameover.mock.calls.length).toBe(1);
        expect(mockBlackPlayer.stop.mock.calls.length).toBe(0);
        expect(mockBlackPlayer.close.mock.calls.length).toBe(1);
        expect(mockWhitePlayer.startSearch.mock.calls.length).toBe(2);
        expect(mockWhitePlayer.startPonder.mock.calls.length).toBe(2);
        expect(mockWhitePlayer.gameover.mock.calls.length).toBe(1);
        expect(mockWhitePlayer.stop.mock.calls.length).toBe(0);
        expect(mockWhitePlayer.close.mock.calls.length).toBe(1);
        expect(mockHandlers.onEndGame.mock.calls.length).toBe(1);
        expect(mockHandlers.onBeepShort.mock.calls.length).toBe(0);
        expect(mockHandlers.onBeepUnlimited.mock.calls.length).toBe(0);
        expect(mockHandlers.onStopBeep.mock.calls.length).toBe(8);
        expect(mockHandlers.onError.mock.calls.length).toBe(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f"
        );
      })
      .invoke();
  });

  it("GameManager/handicap-bishop", () => {
    const initPos = new Position();
    initPos.reset(InitialPositionType.HANDICAP_BISHOP);
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b":
        "7g7f",
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f 2c2d":
        "resign",
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves":
        "8b2b",
      "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f":
        "2c2d",
    });
    const mockPlayerBuilder = createMockPlayerBuilder(
      mockBlackPlayer,
      mockWhitePlayer
    );
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    recordManager.importRecord(initPos.sfen);
    const manager = new GameManager(
      recordManager,
      mockPlayerBuilder,
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s))
      .next(() => {
        expect(mockBlackPlayer.startSearch.mock.calls.length).toBe(2);
        expect(mockBlackPlayer.startPonder.mock.calls.length).toBe(2);
        expect(mockBlackPlayer.gameover.mock.calls.length).toBe(1);
        expect(mockBlackPlayer.stop.mock.calls.length).toBe(0);
        expect(mockBlackPlayer.close.mock.calls.length).toBe(1);
        expect(mockWhitePlayer.startSearch.mock.calls.length).toBe(2);
        expect(mockWhitePlayer.startPonder.mock.calls.length).toBe(2);
        expect(mockWhitePlayer.gameover.mock.calls.length).toBe(1);
        expect(mockWhitePlayer.stop.mock.calls.length).toBe(0);
        expect(mockWhitePlayer.close.mock.calls.length).toBe(1);
        expect(mockHandlers.onEndGame.mock.calls.length).toBe(1);
        expect(mockHandlers.onBeepShort.mock.calls.length).toBe(0);
        expect(mockHandlers.onBeepUnlimited.mock.calls.length).toBe(0);
        expect(mockHandlers.onStopBeep.mock.calls.length).toBe(8);
        expect(mockHandlers.onError.mock.calls.length).toBe(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r7/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 8b2b 7g7f 2c2d"
        );
      })
      .invoke();
  });

  it("GameManager/endGame", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        "7g7f",
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        "2g2f",
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        "3c3d",
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        "no-reply",
    });
    const mockPlayerBuilder = createMockPlayerBuilder(
      mockBlackPlayer,
      mockWhitePlayer
    );
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      mockPlayerBuilder,
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s))
      .next(() => manager.endGame(SpecialMove.INTERRUPT))
      .next(() => {
        expect(mockBlackPlayer.startSearch.mock.calls.length).toBe(2);
        expect(mockBlackPlayer.startPonder.mock.calls.length).toBe(2);
        expect(mockBlackPlayer.gameover.mock.calls.length).toBe(0);
        expect(mockBlackPlayer.stop.mock.calls.length).toBe(0);
        expect(mockBlackPlayer.close.mock.calls.length).toBe(1);
        expect(mockWhitePlayer.startSearch.mock.calls.length).toBe(2);
        expect(mockWhitePlayer.startPonder.mock.calls.length).toBe(2);
        expect(mockWhitePlayer.gameover.mock.calls.length).toBe(0);
        expect(mockWhitePlayer.stop.mock.calls.length).toBe(0);
        expect(mockWhitePlayer.close.mock.calls.length).toBe(1);
        expect(mockHandlers.onEndGame.mock.calls.length).toBe(1);
        expect(mockHandlers.onEndGame.mock.calls[0][0]).toBe(
          SpecialMove.INTERRUPT
        );
        expect(mockHandlers.onBeepShort.mock.calls.length).toBe(0);
        expect(mockHandlers.onBeepUnlimited.mock.calls.length).toBe(0);
        expect(mockHandlers.onStopBeep.mock.calls.length).toBe(8);
        expect(mockHandlers.onError.mock.calls.length).toBe(0);
        expect(recordManager.record.usi).toBe(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f"
        );
      })
      .invoke();
  });

  it("GameManager/time-not-reduced", () => {
    const mockBlackPlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves":
        "7g7f",
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d":
        "2g2f",
    });
    const mockWhitePlayer = createMockPlayer({
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f":
        "3c3d",
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f":
        "resign",
    });
    const mockPlayerBuilder = createMockPlayerBuilder(
      mockBlackPlayer,
      mockWhitePlayer
    );
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new GameManager(
      recordManager,
      mockPlayerBuilder,
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.startGame(gameSetting10m30s))
      .next(() => {
        expect(manager.blackTimeMs).toBe(600 * 1e3);
        expect(manager.whiteTimeMs).toBe(600 * 1e3);
      })
      .invoke();
  });
});
