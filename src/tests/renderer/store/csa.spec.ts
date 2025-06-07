import api, { API } from "@/renderer/ipc/api.js";
import { CSAGameResult, CSASpecialMove } from "@/common/game/csa.js";
import { CSAProtocolVersion } from "@/common/settings/csa.js";
import {
  Color,
  InitialPositionSFEN,
  Move,
  PieceType,
  SpecialMoveType,
  Square,
  specialMove,
} from "tsshogi";
import { Clock } from "@/renderer/store/clock.js";
import {
  CSAGameManager,
  CSAGameState,
  onCSAGameResult,
  onCSAGameSummary,
  onCSAMove,
  onCSAStart,
} from "@/renderer/store/csa.js";
import { RecordManager } from "@/renderer/store/record.js";
import {
  csaGameSettings,
  csaGameSummary,
  csaGameSummaryInvalidPosition,
  csaGameSummaryWithUnequalTimeConfig,
  playerURI,
} from "@/tests/mock/csa.js";
import {
  createErrorPlayerBuilder,
  createMockPlayer,
  createMockPlayerBuilder,
} from "@/tests/mock/player.js";
import { Mocked } from "vitest";
import { USIEngine } from "@/common/settings/usi.js";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

export function applyMockHandlers(manager: CSAGameManager) {
  const handlers = {
    onSaveRecord: vi.fn().mockReturnValue(Promise.resolve()),
    onGameNext: vi.fn(),
    onGameEnd: vi.fn(),
    onFlipBoard: vi.fn(),
    onPieceBeat: vi.fn(),
    onBeepShort: vi.fn(),
    onBeepUnlimited: vi.fn(),
    onStopBeep: vi.fn(),
    onError: vi.fn(),
  };
  manager
    .on("saveRecord", handlers.onSaveRecord)
    .on("gameNext", handlers.onGameNext)
    .on("gameEnd", handlers.onGameEnd)
    .on("flipBoard", handlers.onFlipBoard)
    .on("pieceBeat", handlers.onPieceBeat)
    .on("beepShort", handlers.onBeepShort)
    .on("beepUnlimited", handlers.onBeepUnlimited)
    .on("stopBeep", handlers.onStopBeep)
    .on("error", handlers.onError);
  return handlers;
}

describe("store/csa", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("CSAManager/resign", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValueOnce(sessionID);
    mockAPI.csaAgree.mockResolvedValueOnce();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
        info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "2g2f",
        info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
      },
      "position startpos moves 7g7f 3c3d 2g2f 8c8d": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(csaGameSettings, mockPlayerBuilder);
    expect(manager.state).toBe(CSAGameState.WAITING_LOGIN);
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(manager.state).toBe(CSAGameState.READY);
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    expect(mockAPI.csaLogin.mock.calls[0][0]).toBe(csaGameSettings.server);
    expect(mockAPI.csaAgree).toBeCalledTimes(0);
    onCSAGameSummary(sessionID, csaGameSummary);
    expect(mockAPI.csaAgree).toBeCalledTimes(1);
    expect(mockAPI.csaMove).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(0);
    onCSAStart(sessionID, { black: { time: 600 }, white: { time: 600 } });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockAPI.csaMove.mock.calls[0][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[0][1]).toBe("+7776FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startSearch.mock.calls[0][0].sfen).toBe(InitialPositionSFEN.STANDARD);
    expect(mockPlayer.startSearch.mock.calls[0][1]).toBe("position startpos");
    expect(mockPlayer.startSearch.mock.calls[0][2]).toEqual({
      black: { timeMs: 600e3, byoyomi: 30, increment: 0 },
      white: { timeMs: 600e3, byoyomi: 30, increment: 0 },
    });
    expect(mockPlayer.startPonder).toBeCalledTimes(0);
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 590 },
      white: { time: 600 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startPonder).toBeCalledTimes(1);
    expect(mockPlayer.startPonder.mock.calls[0][0].sfen).toBe(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
    );
    expect(mockPlayer.startPonder.mock.calls[0][1]).toBe("position startpos moves 7g7f");
    expect(mockPlayer.startPonder.mock.calls[0][2]).toEqual({
      black: { timeMs: 590e3, byoyomi: 30, increment: 0 },
      white: { timeMs: 600e3, byoyomi: 30, increment: 0 },
    });
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 590 },
      white: { time: 580 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaMove.mock.calls[1][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[1][1]).toBe("+2726FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startSearch.mock.calls[1][0].sfen).toBe(
      "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
    expect(mockPlayer.startSearch.mock.calls[1][1]).toBe("position startpos moves 7g7f 3c3d");
    expect(mockPlayer.startSearch.mock.calls[1][2]).toEqual({
      black: { timeMs: 590e3, byoyomi: 30, increment: 0 },
      white: { timeMs: 580e3, byoyomi: 30, increment: 0 },
    });
    expect(mockPlayer.startPonder).toBeCalledTimes(1);
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 580 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    expect(mockPlayer.startPonder.mock.calls[1][0].sfen).toBe(
      "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1",
    );
    expect(mockPlayer.startPonder.mock.calls[1][1]).toBe("position startpos moves 7g7f 3c3d 2g2f");
    expect(mockPlayer.startPonder.mock.calls[1][2]).toEqual({
      black: { timeMs: 570e3, byoyomi: 30, increment: 0 },
      white: { timeMs: 580e3, byoyomi: 30, increment: 0 },
    });
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    expect(mockAPI.csaLogout).toBeCalledTimes(0);
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(3);
    expect(mockPlayer.startSearch.mock.calls[2][0].sfen).toBe(
      "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL b - 1",
    );
    expect(mockPlayer.startSearch.mock.calls[2][1]).toBe(
      "position startpos moves 7g7f 3c3d 2g2f 8c8d",
    );
    expect(mockPlayer.startSearch.mock.calls[2][2]).toEqual({
      black: { timeMs: 570e3, byoyomi: 30, increment: 0 },
      white: { timeMs: 560e3, byoyomi: 30, increment: 0 },
    });
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    expect(mockPlayer.close).toBeCalledTimes(0);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    vi.runOnlyPendingTimers();
    expect(mockAPI.csaLogout).toBeCalledTimes(1);
    expect(mockAPI.csaLogout.mock.calls[0][0]).toBe(sessionID);
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(1);
    expect(mockPlayer.gameover).toBeCalledTimes(1);
    expect(mockPlayer.close).toBeCalledTimes(1);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
    expect(recordManager.record.moves[1].comment).toBe(
      "互角\n*評価値=82\n*読み筋=△３四歩▲２六歩△８四歩\n*エンジン=me\n",
    );
    expect(recordManager.record.moves[2].comment).toBe("");
    expect(recordManager.record.moves[3].comment).toBe(
      "互角\n*評価値=78\n*読み筋=△８四歩▲２五歩△８五歩\n*エンジン=me\n",
    );
    expect(recordManager.record.moves[4].comment).toBe("");
    expect(recordManager.record.moves[5].move).toStrictEqual(specialMove(SpecialMoveType.RESIGN));
  });

  it("CSAManager/earlyPonder", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValueOnce(sessionID);
    mockAPI.csaAgree.mockResolvedValueOnce();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
        info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "2g2f",
        info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
      },
      "position startpos moves 7g7f 3c3d 2g2f 8c8d": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(
      {
        ...csaGameSettings,
        player: {
          ...csaGameSettings.player,
          usi: {
            ...(csaGameSettings.player.usi as USIEngine),
            enableEarlyPonder: true,
          },
        },
      },
      mockPlayerBuilder,
    );
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    expect(mockAPI.csaLogin.mock.calls[0][0]).toBe(csaGameSettings.server);
    expect(mockAPI.csaAgree).toBeCalledTimes(0);
    onCSAGameSummary(sessionID, csaGameSummary);
    expect(mockAPI.csaAgree).toBeCalledTimes(1);
    expect(mockAPI.csaMove).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(0);
    onCSAStart(sessionID, { black: { time: 600 }, white: { time: 600 } });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockAPI.csaMove.mock.calls[0][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[0][1]).toBe("+7776FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startPonder).toBeCalledTimes(1); // start ponder immediately
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 590 },
      white: { time: 600 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 590 },
      white: { time: 580 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaMove.mock.calls[1][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[1][1]).toBe("+2726FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startPonder).toBeCalledTimes(3); // start ponder immediately
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 580 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startPonder).toBeCalledTimes(4);
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    expect(mockAPI.csaLogout).toBeCalledTimes(0);
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(3);
    expect(mockPlayer.startPonder).toBeCalledTimes(4);
    expect(mockPlayer.close).toBeCalledTimes(0);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    vi.runOnlyPendingTimers();
    expect(mockAPI.csaLogout).toBeCalledTimes(1);
    expect(mockAPI.csaLogout.mock.calls[0][0]).toBe(sessionID);
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(1);
    expect(mockPlayer.gameover).toBeCalledTimes(1);
    expect(mockPlayer.close).toBeCalledTimes(1);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
    expect(recordManager.record.moves[1].comment).toBe(
      "互角\n*評価値=82\n*読み筋=△３四歩▲２六歩△８四歩\n*エンジン=me\n",
    );
    expect(recordManager.record.moves[2].comment).toBe("");
    expect(recordManager.record.moves[3].comment).toBe(
      "互角\n*評価値=78\n*読み筋=△８四歩▲２五歩△８五歩\n*エンジン=me\n",
    );
    expect(recordManager.record.moves[4].comment).toBe("");
    expect(recordManager.record.moves[5].move).toStrictEqual(specialMove(SpecialMoveType.RESIGN));
  });

  it("CSAManager/resign/twice", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValue(sessionID);
    mockAPI.csaAgree.mockResolvedValue();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValue();
    const mockPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
        info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "2g2f",
        info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
      },
      "position startpos moves 7g7f 3c3d 2g2f 8c8d": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(
      {
        ...csaGameSettings,
        repeat: 2,
      },
      mockPlayerBuilder,
    );
    await vi.runAllTimersAsync();
    expect(mockHandlers.onGameNext).toBeCalledTimes(1);
    onCSAGameSummary(sessionID, csaGameSummary);
    onCSAStart(sessionID, { black: { time: 600 }, white: { time: 600 } });
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 590 },
      white: { time: 600 },
    });
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 590 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    await vi.runOnlyPendingTimersAsync();
    expect(mockHandlers.onGameNext).toBeCalledTimes(2);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
    expect(mockAPI.csaLogin).toBeCalledTimes(2);
    expect(mockAPI.csaAgree).toBeCalledTimes(1);
    onCSAGameSummary(sessionID, csaGameSummary);
    expect(mockAPI.csaAgree).toBeCalledTimes(2);
    onCSAStart(sessionID, { black: { time: 600 }, white: { time: 600 } });
    expect(recordManager.record.moves).toHaveLength(1);
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 590 },
      white: { time: 600 },
    });
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 590 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    vi.runOnlyPendingTimers();
    expect(mockAPI.csaLogout).toBeCalledTimes(2);
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(2);
    expect(mockPlayer.gameover).toBeCalledTimes(2);
    expect(mockPlayer.close).toBeCalledTimes(1);
    expect(mockHandlers.onGameNext).toBeCalledTimes(2);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
  });

  it("CSAManager/resign/twice/restartEngineEveryGame", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValue(sessionID);
    mockAPI.csaAgree.mockResolvedValue();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValue();
    const mockPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
        info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "2g2f",
        info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
      },
      "position startpos moves 7g7f 3c3d 2g2f 8c8d": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(
      {
        ...csaGameSettings,
        repeat: 2,
        restartPlayerEveryGame: true,
      },
      mockPlayerBuilder,
    );
    await vi.runAllTimersAsync();
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockHandlers.onGameNext).toBeCalledTimes(1);
    onCSAGameSummary(sessionID, csaGameSummary);
    onCSAStart(sessionID, { black: { time: 600 }, white: { time: 600 } });
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 590 },
      white: { time: 600 },
    });
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 590 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    await vi.runOnlyPendingTimersAsync();
    expect(mockPlayer.close).toBeCalledTimes(1); // 1局目終了後に close される。
    expect(mockPlayerBuilder.build).toBeCalledTimes(2); // 2局目開始時に build される。
    expect(mockHandlers.onGameNext).toBeCalledTimes(2);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
    expect(mockAPI.csaLogin).toBeCalledTimes(2);
    expect(mockAPI.csaAgree).toBeCalledTimes(1);
    onCSAGameSummary(sessionID, csaGameSummary);
    expect(mockAPI.csaAgree).toBeCalledTimes(2);
    onCSAStart(sessionID, { black: { time: 600 }, white: { time: 600 } });
    expect(recordManager.record.moves).toHaveLength(1);
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 590 },
      white: { time: 600 },
    });
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 590 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 580 },
    });
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    vi.runOnlyPendingTimers();
    expect(mockAPI.csaLogout).toBeCalledTimes(2);
    expect(mockPlayerBuilder.build).toBeCalledTimes(2);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(2);
    expect(mockPlayer.gameover).toBeCalledTimes(2);
    expect(mockPlayer.close).toBeCalledTimes(2);
    expect(mockHandlers.onGameNext).toBeCalledTimes(2);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
  });

  it("CSAManager/unequal_time_config", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValueOnce(sessionID);
    mockAPI.csaAgree.mockResolvedValueOnce();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayer = createMockPlayer({
      "position startpos": {
        usi: "7g7f",
        info: { score: 82, pv: ["3c3d", "2g2f", "8c8d"] },
      },
      "position startpos moves 7g7f 3c3d": {
        usi: "2g2f",
        info: { score: 78, pv: ["8c8d", "2f2e", "8d8e"] },
      },
      "position startpos moves 7g7f 3c3d 2g2f 8c8d": {
        usi: "resign",
      },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(csaGameSettings, mockPlayerBuilder);
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    expect(mockAPI.csaLogin.mock.calls[0][0]).toBe(csaGameSettings.server);
    expect(mockAPI.csaAgree).toBeCalledTimes(0);
    onCSAGameSummary(sessionID, csaGameSummaryWithUnequalTimeConfig);
    expect(mockAPI.csaAgree).toBeCalledTimes(1);
    expect(mockAPI.csaMove).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(0);
    onCSAStart(sessionID, { black: { time: 305 }, white: { time: 610 } });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockAPI.csaMove.mock.calls[0][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[0][1]).toBe("+7776FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startSearch.mock.calls[0][2]).toEqual({
      black: { timeMs: 305e3, byoyomi: 0, increment: 5 },
      white: { timeMs: 610e3, byoyomi: 0, increment: 10 },
    });
    expect(mockPlayer.startPonder).toBeCalledTimes(0);
    onCSAMove(sessionID, "+7776FU", {
      black: { time: 290 },
      white: { time: 600 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startPonder).toBeCalledTimes(1);
    expect(mockPlayer.startPonder.mock.calls[0][2]).toEqual({
      black: { timeMs: 290e3, byoyomi: 0, increment: 5 },
      white: { timeMs: 600e3, byoyomi: 0, increment: 10 },
    });
    onCSAMove(sessionID, "-3334FU", {
      black: { time: 290 },
      white: { time: 580 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaMove.mock.calls[1][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[1][1]).toBe("+2726FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startSearch.mock.calls[1][2]).toEqual({
      black: { timeMs: 290e3, byoyomi: 0, increment: 5 },
      white: { timeMs: 580e3, byoyomi: 0, increment: 10 },
    });
    expect(mockPlayer.startPonder).toBeCalledTimes(1);
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 270 },
      white: { time: 580 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    expect(mockPlayer.startPonder.mock.calls[1][2]).toEqual({
      black: { timeMs: 270e3, byoyomi: 0, increment: 5 },
      white: { timeMs: 580e3, byoyomi: 0, increment: 10 },
    });
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 270 },
      white: { time: 560 },
    });
    expect(mockAPI.csaLogout).toBeCalledTimes(0);
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(3);
    expect(mockPlayer.startSearch.mock.calls[2][2]).toEqual({
      black: { timeMs: 270e3, byoyomi: 0, increment: 5 },
      white: { timeMs: 560e3, byoyomi: 0, increment: 10 },
    });
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    expect(mockPlayer.close).toBeCalledTimes(0);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    vi.runOnlyPendingTimers();
    expect(mockAPI.csaLogout).toBeCalledTimes(1);
    expect(mockAPI.csaLogout.mock.calls[0][0]).toBe(sessionID);
    expect(mockPlayerBuilder.build).toBeCalledTimes(1);
    expect(mockPlayer.readyNewGame).toBeCalledTimes(1);
    expect(mockPlayer.gameover).toBeCalledTimes(1);
    expect(mockPlayer.close).toBeCalledTimes(1);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(6);
    expect(recordManager.record.moves[1].comment).toBe(
      "互角\n*評価値=82\n*読み筋=△３四歩▲２六歩△８四歩\n*エンジン=me\n",
    );
    expect(recordManager.record.moves[2].comment).toBe("");
    expect(recordManager.record.moves[3].comment).toBe(
      "互角\n*評価値=78\n*読み筋=△８四歩▲２五歩△８五歩\n*エンジン=me\n",
    );
    expect(recordManager.record.moves[4].comment).toBe("");
    expect(recordManager.record.moves[5].move).toStrictEqual(specialMove(SpecialMoveType.RESIGN));
  });

  it("CSAManager/invalidPosition", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValueOnce(sessionID);
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayer = createMockPlayer({});
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(csaGameSettings, mockPlayerBuilder);
    await vi.runAllTimersAsync();
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    expect(mockAPI.csaLogin.mock.calls[0][0]).toBe(csaGameSettings.server);
    expect(mockAPI.csaAgree).toBeCalledTimes(0);
    onCSAGameSummary(sessionID, csaGameSummaryInvalidPosition);
    expect(mockAPI.csaAgree).toBeCalledTimes(0);
    expect(mockAPI.csaLogout).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(1);
  });

  it("CSAManager/initialMoves", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValueOnce(sessionID);
    mockAPI.csaAgree.mockResolvedValueOnce();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayer = createMockPlayer({
      "position startpos moves 3g3f 3c3d 3i4h 4a3b": {
        usi: "4h3g",
      },
      "position startpos moves 3g3f 3c3d 3i4h 4a3b 4h3g 8c8d": { usi: "2g2f" },
      "position startpos moves 3g3f 3c3d 3i4h 4a3b 4h3g 8c8d 2g2f 8d8e": { usi: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI]: mockPlayer,
    });
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await manager.login(csaGameSettings, mockPlayerBuilder);
    await vi.runAllTimersAsync();
    expect(mockAPI.csaLogin).toBeCalledTimes(1);
    expect(mockAPI.csaLogin.mock.calls[0][0]).toBe(csaGameSettings.server);
    expect(mockAPI.csaAgree).toBeCalledTimes(0);
    onCSAGameSummary(sessionID, {
      ...csaGameSummary,
      position: `\
P1-KY-KE-GI-KI-OU-KI-GI-KE-KY
P2 * -HI *  *  *  *  * -KA * 
P3-FU-FU-FU-FU-FU-FU-FU-FU-FU
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  *  *  *  * 
P7+FU+FU+FU+FU+FU+FU+FU+FU+FU
P8 * +KA *  *  *  *  * +HI * 
P9+KY+KE+GI+KI+OU+KI+GI+KE+KY
P+
P-
+
+3736FU,T5
-3334FU,T5
+3948GI,T5
`,
    });
    expect(mockAPI.csaAgree).toBeCalledTimes(1);
    expect(mockAPI.csaMove).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(0);
    onCSAStart(sessionID, { black: { time: 590 }, white: { time: 595 } });
    expect(mockAPI.csaMove).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(0);
    expect(mockPlayer.startPonder).toBeCalledTimes(1);
    onCSAMove(sessionID, "-4132KI", {
      black: { time: 585 },
      white: { time: 588 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockAPI.csaMove.mock.calls[0][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[0][1]).toBe("+4837GI");
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startPonder).toBeCalledTimes(1);
    onCSAMove(sessionID, "+4837GI", {
      black: { time: 585 },
      white: { time: 588 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(1);
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    onCSAMove(sessionID, "-8384FU", {
      black: { time: 585 },
      white: { time: 585 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaMove.mock.calls[1][0]).toBe(sessionID);
    expect(mockAPI.csaMove.mock.calls[1][1]).toBe("+2726FU");
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startPonder).toBeCalledTimes(2);
    onCSAMove(sessionID, "+2726FU", {
      black: { time: 570 },
      white: { time: 585 },
    });
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(0);
    expect(mockPlayer.startSearch).toBeCalledTimes(2);
    expect(mockPlayer.startPonder).toBeCalledTimes(3);
    onCSAMove(sessionID, "-8485FU", {
      black: { time: 570 },
      white: { time: 560 },
    });
    expect(mockAPI.csaLogout).toBeCalledTimes(0);
    expect(mockAPI.csaMove).toBeCalledTimes(2);
    expect(mockAPI.csaResign).toBeCalledTimes(1);
    expect(mockPlayer.startSearch).toBeCalledTimes(3);
    expect(mockPlayer.startPonder).toBeCalledTimes(3);
    expect(mockPlayer.close).toBeCalledTimes(0);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
    onCSAGameResult(sessionID, CSASpecialMove.RESIGN, CSAGameResult.WIN);
    vi.runOnlyPendingTimers();
    expect(mockAPI.csaLogout).toBeCalledTimes(1);
    expect(mockAPI.csaLogout.mock.calls[0][0]).toBe(sessionID);
    expect(mockPlayer.close).toBeCalledTimes(1);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(1);
    expect(mockHandlers.onError).toBeCalledTimes(0);
    expect(recordManager.record.moves).toHaveLength(10);
    expect(recordManager.record.moves[9].move).toStrictEqual(specialMove(SpecialMoveType.RESIGN));
  });

  it("CSAManager/engineLaunchError", async () => {
    const sessionID = Math.floor(Math.random() * 1000);
    mockAPI.csaLogin.mockResolvedValueOnce(sessionID);
    mockAPI.csaAgree.mockResolvedValueOnce();
    mockAPI.csaMove.mockResolvedValue();
    mockAPI.csaLogout.mockResolvedValueOnce();
    const mockPlayerBuilder = createErrorPlayerBuilder();
    const recordManager = new RecordManager();
    const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
    const mockHandlers = applyMockHandlers(manager);
    await expect(manager.login(csaGameSettings, mockPlayerBuilder)).rejects.toThrow();
    expect(manager.state).toBe(CSAGameState.OFFLINE);
    expect(mockHandlers.onGameNext).toBeCalledTimes(0);
    expect(mockHandlers.onGameEnd).toBeCalledTimes(0);
  });

  describe("CSAManager/onPlayerMove", () => {
    mockAPI.csaMove.mockResolvedValue();
    const recordManager = new RecordManager();
    const move = new Move(
      new Square(7, 7),
      new Square(7, 6),
      false,
      Color.BLACK,
      PieceType.PAWN,
      null,
    );
    const info = {
      usi: "",
      score: 159,
      pv: [
        new Move(new Square(3, 3), new Square(3, 4), false, Color.WHITE, PieceType.PAWN, null),
        new Move(new Square(2, 7), new Square(2, 6), false, Color.BLACK, PieceType.PAWN, null),
        new Move(
          new Square(2, 2),
          new Square(8, 8),
          true,
          Color.WHITE,
          PieceType.BISHOP,
          PieceType.BISHOP,
        ),
      ],
    };

    it("standard", () => {
      const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
      manager["_settings"].server.protocolVersion = CSAProtocolVersion.V121;
      manager["onPlayerMove"](move, info);
      expect(mockAPI.csaMove).toBeCalledTimes(1);
      expect(mockAPI.csaMove).toBeCalledWith(0, "+7776FU", undefined, undefined);
    });

    it("floodgate", () => {
      const manager = new CSAGameManager(recordManager, new Clock(), new Clock());
      manager["_settings"].server.protocolVersion = CSAProtocolVersion.V121_FLOODGATE;
      manager["onPlayerMove"](move, info);
      expect(mockAPI.csaMove).toBeCalledTimes(1);
      expect(mockAPI.csaMove).toBeCalledWith(0, "+7776FU", 159, "-3334FU +2726FU -2288UM");
    });
  });
});
