import { buildGameCoordinator } from "@/renderer/game/coordinator.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { gameSettings10m30s } from "@/tests/mock/game.js";

describe("game/coordinator", () => {
  it("buildGameCoordinator/startPositionSFEN", async () => {
    const sfen = "ln2kgsnl/1r1sg2b1/p1pppp1pp/6p2/1p7/2PP5/PPBSPPPPP/7R1/LN1GKGSNL b - 1";
    const coordinator = await buildGameCoordinator({
      settings: {
        ...gameSettings10m30s,
        startPosition: "sfen",
        startPositionSFEN: sfen,
      },
      currentPly: 1,
    });
    const recordManager = new RecordManager();

    const result = coordinator.next(recordManager);
    expect(result).not.toBeNull();
    expect(result).not.toBeInstanceOf(Error);
    expect(recordManager.record.usi).toBe(`position sfen ${sfen}`);
  });

  it("buildGameCoordinator/startPositionSFEN-invalid", async () => {
    await expect(
      buildGameCoordinator({
        settings: {
          ...gameSettings10m30s,
          startPosition: "sfen",
          startPositionSFEN: "invalid sfen",
        },
        currentPly: 1,
      }),
    ).rejects.toThrow("Invalid USI");
  });
});
