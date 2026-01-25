import { ParallelGameManager, ParallelGameProgress } from "@/renderer/game/parallel.js";
import { GameResults } from "@/renderer/game/result.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { playerURI01, playerURI02, gameSettings10m30s } from "@/tests/mock/game.js";
import { createMockPlayer, createMockPlayerBuilder } from "@/tests/mock/player.js";
import { GameSettings } from "@/common/settings/game.js";
import { PlayerBuilder } from "@/renderer/players/builder.js";
import api, { API } from "@/renderer/ipc/api.js";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

interface MockParallelGameHandlers {
  onProgress: (progress: ParallelGameProgress) => void;
  onSaveRecord: (dir: string, recordManager: RecordManager) => void;
  onError: (e: unknown) => void;
  records: string[];
}

function createMockHandlers(): MockParallelGameHandlers {
  const records: string[] = [];
  return {
    onProgress: vi.fn(),
    onSaveRecord: (_: string, recordManager: RecordManager) => {
      records.push(recordManager.record.usi);
    },
    onError: vi.fn(),
    records,
  };
}

function invoke(
  handlers: MockParallelGameHandlers,
  gameSettings: GameSettings,
  playerBuilder: PlayerBuilder,
  assert: (gameResults: GameResults) => void,
  interrupt?: (manager: ParallelGameManager) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const manager = new ParallelGameManager()
      .on("progress", handlers.onProgress)
      .on("saveRecord", handlers.onSaveRecord)
      .on("closed", (results) => {
        try {
          assert(results);
          resolve();
        } catch (e) {
          reject(e);
        }
      })
      .on("error", handlers.onError);
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

describe("renderer/game/parallel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ParallelGameManager/basic/2games/parallelism1", () => {
    const mockPlayer01 = createMockPlayer({
      // 1st game (black)
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
      // 2nd game (white)
      "position startpos moves 7g7f": { usi: "3c3d" },
    });
    const mockPlayer02 = createMockPlayer({
      // 1st game (white)
      "position startpos moves 7g7f": { usi: "3c3d" },
      "position startpos moves 7g7f 3c3d 2g2f": { usi: "resign" },
      // 2nd game (black)
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "resign" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockPlayer01,
      [playerURI02]: mockPlayer02,
    });
    const mockHandlers = createMockHandlers();

    return invoke(
      mockHandlers,
      {
        ...gameSettings10m30s,
        repeat: 2,
        parallelism: 1,
      },
      mockPlayerBuilder,
      (gameResults) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 2, winBlack: 1, winWhite: 1 },
          player2: { name: "USI Engine 02", win: 0, winBlack: 0, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 2,
        });
        expect(mockPlayer01.readyNewGame).toBeCalledTimes(2);
        expect(mockPlayer01.gameover).toBeCalledTimes(2);
        expect(mockPlayer01.close).toBeCalledTimes(1);
        expect(mockPlayer02.readyNewGame).toBeCalledTimes(2);
        expect(mockPlayer02.gameover).toBeCalledTimes(2);
        expect(mockPlayer02.close).toBeCalledTimes(1);
        expect(mockHandlers.onProgress).toHaveBeenCalled();
        expect(mockHandlers.onError).not.toBeCalled();
        expect(mockHandlers.records).toHaveLength(2);
        expect(mockHandlers.records[0]).toBe("position startpos moves 7g7f 3c3d 2g2f");
        expect(mockHandlers.records[1]).toBe("position startpos moves 7g7f 3c3d");
      },
    );
  });

  it("ParallelGameManager/4games/parallelism2", () => {
    // Worker 1
    const mockPlayer01_W1 = createMockPlayer({
      // 1st game (black)
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
      // 4th game (white)
      "position startpos moves 7g7f": { usi: "3c3d" },
    });
    const mockPlayer02_W1 = createMockPlayer({
      // 1st game (white)
      "position startpos moves 7g7f": { usi: "3c3d" },
      "position startpos moves 7g7f 3c3d 2g2f": { usi: "resign" },
      // 4th game (black)
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "resign" },
    });

    // Worker 2
    const mockPlayer01_W2 = createMockPlayer({
      // 2nd game (white)
      "position startpos moves 5g5f": { usi: "3c3d" },
      "position startpos moves 5g5f 3c3d 2h5h": { usi: "resign" },
      // 5th game (black)
      "position startpos": { usi: "2g2f" },
      "position startpos moves 2g2f 3c3d": { usi: "2f2e" },
    });
    const mockPlayer02_W2 = createMockPlayer({
      // 2nd game (black)
      "position startpos": { usi: "5g5f" },
      "position startpos moves 5g5f 3c3d": { usi: "2h5h" },
      // 5th game (white)
      "position startpos moves 2g2f": { usi: "3c3d" },
      "position startpos moves 2g2f 3c3d 2f2e": { usi: "resign" },
    });

    // Worker 3
    const mockPlayer01_W3 = createMockPlayer({
      // 3rd game (black)
      "position startpos": { usi: "1g1f" },
      "position startpos moves 1g1f 3c3d": { usi: "1f1e" },
      // 6th game (white)
      "position startpos moves 6i7h": { usi: "8c8d" },
      "position startpos moves 6i7h 8c8d 3i4h": { usi: "resign" },
    });
    const mockPlayer02_W3 = createMockPlayer({
      // 3rd game (white)
      "position startpos moves 1g1f": { usi: "3c3d" },
      "position startpos moves 1g1f 3c3d 1f1e": { usi: "resign" },
      // 6th game (black)
      "position startpos": { usi: "6i7h" },
      "position startpos moves 6i7h 8c8d": { usi: "3i4h" },
    });

    // Create player builders that return different players for each build call
    let player01CallCount = 0;
    let player02CallCount = 0;
    const mockPlayerBuilder = {
      build: vi.fn().mockImplementation((playerSettings: { uri: string }) => {
        if (playerSettings.uri === playerURI01) {
          const player = [mockPlayer01_W1, mockPlayer01_W2, mockPlayer01_W3][player01CallCount];
          player01CallCount++;
          return Promise.resolve(player);
        } else {
          const player = [mockPlayer02_W1, mockPlayer02_W2, mockPlayer02_W3][player02CallCount];
          player02CallCount++;
          return Promise.resolve(player);
        }
      }),
    };
    const mockHandlers = createMockHandlers();

    return invoke(
      mockHandlers,
      {
        ...gameSettings10m30s,
        repeat: 6,
        parallelism: 3,
      },
      mockPlayerBuilder,
      (gameResults) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 4, winBlack: 3, winWhite: 1 },
          player2: { name: "USI Engine 02", win: 2, winBlack: 2, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 6,
        });
        expect(mockPlayerBuilder.build).toBeCalledTimes(6);
        expect(mockHandlers.onProgress).toHaveBeenCalled();
        expect(mockHandlers.onError).not.toBeCalled();
        expect(mockHandlers.records).toHaveLength(6);
        expect(mockHandlers.records).toContain("position startpos moves 7g7f 3c3d 2g2f");
        expect(mockHandlers.records).toContain("position startpos moves 7g7f 3c3d");
        expect(mockHandlers.records).toContain("position startpos moves 5g5f 3c3d 2h5h");
        expect(mockHandlers.records).toContain("position startpos moves 2g2f 3c3d 2f2e");
        expect(mockHandlers.records).toContain("position startpos moves 1g1f 3c3d 1f1e");
        expect(mockHandlers.records).toContain("position startpos moves 6i7h 8c8d 3i4h");
      },
    );
  });

  it("ParallelGameManager/stop", () => {
    const mockPlayer01 = createMockPlayer({
      "position startpos": { usi: "7g7f" },
      "position startpos moves 7g7f 3c3d": { usi: "2g2f" },
    });
    const mockPlayer02 = createMockPlayer({
      "position startpos moves 7g7f": { usi: "3c3d" },
      "position startpos moves 7g7f 3c3d 2g2f": { usi: "no-reply" },
    });
    const mockPlayerBuilder = createMockPlayerBuilder({
      [playerURI01]: mockPlayer01,
      [playerURI02]: mockPlayer02,
    });
    const mockHandlers = createMockHandlers();

    return invoke(
      mockHandlers,
      {
        ...gameSettings10m30s,
        repeat: 2,
        parallelism: 1,
      },
      mockPlayerBuilder,
      (gameResults) => {
        expect(gameResults.total).toBe(1);
        expect(gameResults.invalid).toBe(1);
        expect(mockHandlers.onError).not.toBeCalled();
      },
      (manager) => {
        setTimeout(() => manager.stop(), 100);
      },
    );
  });

  it("ParallelGameManager/validation/parallelismLessThan1", async () => {
    const manager = new ParallelGameManager();
    const mockPlayerBuilder = createMockPlayerBuilder({});
    await expect(
      manager.start(
        {
          ...gameSettings10m30s,
          repeat: 2,
          parallelism: 0,
        },
        mockPlayerBuilder,
      ),
    ).rejects.toThrow("ParallelGameManager#start: settings.parallelism must be 1 or more.");
  });

  it("ParallelGameManager/startPositionList/parallelism1", () => {
    mockAPI.loadSFENFile.mockResolvedValueOnce([
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5a6b 6h7h 6b7b",
      "position startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 9c9d 5i6h 5a5b",
    ]);

    const mockPlayer01 = createMockPlayer({
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
    const mockPlayer02 = createMockPlayer({
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
      [playerURI01]: mockPlayer01,
      [playerURI02]: mockPlayer02,
    });
    const mockHandlers = createMockHandlers();

    return invoke(
      mockHandlers,
      {
        ...gameSettings10m30s,
        startPosition: "list",
        startPositionListFile: "test.sfen",
        startPositionListOrder: "sequential",
        repeat: 4,
        parallelism: 1,
      },
      mockPlayerBuilder,
      (gameResults) => {
        expect(gameResults).toStrictEqual({
          player1: { name: "USI Engine 01", win: 2, winBlack: 2, winWhite: 0 },
          player2: { name: "USI Engine 02", win: 2, winBlack: 2, winWhite: 0 },
          draw: 0,
          invalid: 0,
          total: 4,
        });
        expect(mockHandlers.onError).not.toBeCalled();
      },
    );
  });
});
