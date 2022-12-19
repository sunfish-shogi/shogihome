import { TimeoutChain } from "@/helpers/testing";
import api, { API } from "@/ipc/api";
import { CSAGameResult, CSASpecialMove } from "@/ipc/csa";
import { CSAProtocolVersion } from "@/settings/csa";
import { Color, Move, PieceType, SpecialMove, Square } from "@/shogi";
import { Clock } from "@/store/clock";
import {
  CSAGameManager,
  onCSAGameResult,
  onCSAGameSummary,
  onCSAMove,
  onCSAStart,
} from "@/store/csa";
import { RecordManager } from "@/store/record";
import { csaGameSetting, csaGameSummary, playerURI } from "../mock/csa";
import { createMockPlayer, createMockPlayerBuilder } from "../mock/player";

jest.mock("@/ipc/api");

const mockAPI = api as jest.Mocked<API>;

function createMockHandlers() {
  return {
    onSaveRecord: jest.fn(),
    onGameNext: jest.fn(),
    onGameEnd: jest.fn(),
    onFlipBoard: jest.fn(),
    onPieceBeat: jest.fn(),
    onBeepShort: jest.fn(),
    onBeepUnlimited: jest.fn(),
    onStopBeep: jest.fn(),
    onError: jest.fn(),
  };
}

describe("store/csa", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("CSAManager/resign", () => {
    mockAPI.csaLogin.mockResolvedValueOnce(123);
    mockAPI.csaAgree.mockResolvedValueOnce();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayer = createMockPlayer({
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
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d":
        { sfen: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() => manager.login(csaGameSetting, mockPlayerBuilder))
      .next(() => {
        expect(mockAPI.csaLogin).toBeCalledTimes(1);
        expect(mockAPI.csaLogin.mock.calls[0][0]).toBe(csaGameSetting.server);
        expect(mockAPI.csaAgree).toBeCalledTimes(0);
        onCSAGameSummary(123, csaGameSummary);
        expect(mockAPI.csaAgree).toBeCalledTimes(1);
        expect(mockAPI.csaMove).toBeCalledTimes(0);
        expect(mockPlayer.startSearch).toBeCalledTimes(0);
        onCSAStart(123, { black: { time: 600 }, white: { time: 600 } });
        expect(mockAPI.csaMove).toBeCalledTimes(1);
        expect(mockAPI.csaMove.mock.calls[0][0]).toBe(123);
        expect(mockAPI.csaMove.mock.calls[0][1]).toBe("+7776FU");
        expect(mockPlayer.startSearch).toBeCalledTimes(1);
        expect(mockPlayer.startPonder).toBeCalledTimes(0);
        onCSAMove(123, "+7776FU", {
          black: { time: 590 },
          white: { time: 600 },
        });
        expect(mockAPI.csaMove).toBeCalledTimes(1);
        expect(mockPlayer.startSearch).toBeCalledTimes(1);
        expect(mockPlayer.startPonder).toBeCalledTimes(1);
        onCSAMove(123, "-3334FU", {
          black: { time: 590 },
          white: { time: 580 },
        });
        expect(mockAPI.csaMove).toBeCalledTimes(2);
        expect(mockAPI.csaMove.mock.calls[1][0]).toBe(123);
        expect(mockAPI.csaMove.mock.calls[1][1]).toBe("+2726FU");
        expect(mockPlayer.startSearch).toBeCalledTimes(2);
        expect(mockPlayer.startPonder).toBeCalledTimes(1);
        onCSAMove(123, "+2726FU", {
          black: { time: 570 },
          white: { time: 580 },
        });
        expect(mockAPI.csaMove).toBeCalledTimes(2);
        expect(mockAPI.csaResign).toBeCalledTimes(0);
        expect(mockPlayer.startSearch).toBeCalledTimes(2);
        expect(mockPlayer.startPonder).toBeCalledTimes(2);
        onCSAMove(123, "-8384FU", {
          black: { time: 570 },
          white: { time: 560 },
        });
        expect(mockAPI.csaLogout).toBeCalledTimes(0);
        expect(mockAPI.csaMove).toBeCalledTimes(2);
        expect(mockAPI.csaResign).toBeCalledTimes(1);
        expect(mockPlayer.startSearch).toBeCalledTimes(3);
        expect(mockPlayer.startPonder).toBeCalledTimes(2);
        expect(mockPlayer.close).toBeCalledTimes(0);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
        onCSAGameResult(123, CSASpecialMove.RESIGN, CSAGameResult.WIN);
      })
      .next(() => {
        expect(mockAPI.csaLogout).toBeCalledTimes(1);
        expect(mockAPI.csaLogout.mock.calls[0][0]).toBe(123);
        expect(mockPlayer.close).toBeCalledTimes(1);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.moves).toHaveLength(6);
        expect(recordManager.record.moves[1].comment).toBe(
          "互角\n*評価値=82\n*読み筋=△３四歩(33)▲２六歩(27)△８四歩(83)\n"
        );
        expect(recordManager.record.moves[2].comment).toBe("");
        expect(recordManager.record.moves[3].comment).toBe(
          "互角\n*評価値=78\n*読み筋=△８四歩(83)▲２五歩(26)△８五歩(84)\n"
        );
        expect(recordManager.record.moves[4].comment).toBe("");
        expect(recordManager.record.moves[5].move).toBe(SpecialMove.RESIGN);
      })
      .invoke();
  });

  it("CSAManager/resign/twice", () => {
    mockAPI.csaLogin.mockResolvedValue(123);
    mockAPI.csaAgree.mockResolvedValue();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValue();
    const mockPlayer = createMockPlayer({
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
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d":
        { sfen: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(
      recordManager,
      new Clock(),
      new Clock(),
      mockHandlers
    );
    return new TimeoutChain()
      .next(() =>
        manager.login(
          {
            ...csaGameSetting,
            repeat: 2,
          },
          mockPlayerBuilder
        )
      )
      .next(() => {
        expect(mockHandlers.onGameNext).toBeCalledTimes(1);
        onCSAGameSummary(123, csaGameSummary);
        onCSAStart(123, { black: { time: 600 }, white: { time: 600 } });
        onCSAMove(123, "+7776FU", {
          black: { time: 590 },
          white: { time: 600 },
        });
        onCSAMove(123, "-3334FU", {
          black: { time: 590 },
          white: { time: 580 },
        });
        onCSAMove(123, "+2726FU", {
          black: { time: 570 },
          white: { time: 580 },
        });
        onCSAMove(123, "-8384FU", {
          black: { time: 570 },
          white: { time: 560 },
        });
        expect(mockAPI.csaLogin).toBeCalledTimes(1);
        onCSAGameResult(123, CSASpecialMove.RESIGN, CSAGameResult.WIN);
        expect(mockAPI.csaLogin).toBeCalledTimes(1);
      })
      .next(() => {
        expect(mockHandlers.onGameNext).toBeCalledTimes(2);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
        expect(recordManager.record.moves).toHaveLength(6);
        expect(mockAPI.csaLogin).toBeCalledTimes(2);
        expect(mockAPI.csaAgree).toBeCalledTimes(1);
        onCSAGameSummary(123, csaGameSummary);
        expect(mockAPI.csaAgree).toBeCalledTimes(2);
        onCSAStart(123, { black: { time: 600 }, white: { time: 600 } });
        expect(recordManager.record.moves).toHaveLength(1);
        onCSAMove(123, "+7776FU", {
          black: { time: 590 },
          white: { time: 600 },
        });
        onCSAMove(123, "-3334FU", {
          black: { time: 590 },
          white: { time: 580 },
        });
        onCSAMove(123, "+2726FU", {
          black: { time: 570 },
          white: { time: 580 },
        });
        onCSAMove(123, "-8384FU", {
          black: { time: 570 },
          white: { time: 560 },
        });
        onCSAGameResult(123, CSASpecialMove.RESIGN, CSAGameResult.WIN);
      })
      .next(() => {
        expect(mockAPI.csaLogout).toBeCalledTimes(2);
        expect(mockPlayer.close).toBeCalledTimes(2);
        expect(mockHandlers.onGameNext).toBeCalledTimes(2);
        expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
        expect(mockHandlers.onError).toBeCalledTimes(0);
        expect(recordManager.record.moves).toHaveLength(6);
      })
      .invoke();
  });

  describe("CSAManager/onPlayerMove", () => {
    mockAPI.csaMove.mockResolvedValue();
    const mockHandlers = createMockHandlers();
    const recordManager = new RecordManager();
    const move = new Move(
      new Square(7, 7),
      new Square(7, 6),
      false,
      Color.BLACK,
      PieceType.PAWN,
      null
    );
    const info = {
      usi: "",
      score: 159,
      pv: [
        new Move(
          new Square(3, 3),
          new Square(3, 4),
          false,
          Color.WHITE,
          PieceType.PAWN,
          null
        ),
        new Move(
          new Square(2, 7),
          new Square(2, 6),
          false,
          Color.BLACK,
          PieceType.PAWN,
          null
        ),
        new Move(
          new Square(2, 2),
          new Square(8, 8),
          true,
          Color.WHITE,
          PieceType.BISHOP,
          PieceType.BISHOP
        ),
      ],
    };

    it("standard", () => {
      const manager = new CSAGameManager(
        recordManager,
        new Clock(),
        new Clock(),
        mockHandlers
      );
      manager["_setting"].server.protocolVersion = CSAProtocolVersion.V121;
      manager["onPlayerMove"](move, info);
      expect(mockAPI.csaMove).toBeCalledTimes(1);
      expect(mockAPI.csaMove).toBeCalledWith(
        0,
        "+7776FU",
        undefined,
        undefined
      );
    });

    it("floodgate", () => {
      const manager = new CSAGameManager(
        recordManager,
        new Clock(),
        new Clock(),
        mockHandlers
      );
      manager["_setting"].server.protocolVersion =
        CSAProtocolVersion.V121_FLOODGATE;
      manager["onPlayerMove"](move, info);
      expect(mockAPI.csaMove).toBeCalledTimes(1);
      expect(mockAPI.csaMove).toBeCalledWith(
        0,
        "+7776FU",
        159,
        "-3334FU +2726FU -2288UM"
      );
    });
  });
});
