import { StartPositionList } from "@/renderer/game/start_position.js";
import api, { API } from "@/renderer/ipc/api.js";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

describe("game/start_position", () => {
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

    // swapping / shuffle / 6 games
    for (let i = 0; i < 100; i++) {
      await expect(
        list.reset({
          filePath: "path/to/file.sfen",
          swapPlayers: true,
          order: "shuffle",
          maxGames: 6,
        }),
      ).resolves.toBeUndefined();
      const first = list.next();
      const second = list.next();
      const third = list.next();
      const fourth = list.next();
      const fifth = list.next();
      const sixth = list.next();
      expect(first).match(/^position startpos moves /);
      expect(third).match(/^position startpos moves /);
      expect(fifth).match(/^position startpos moves /);
      expect(second).toBe(first);
      expect(third).not.toBe(first);
      expect(fourth).toBe(third);
      expect(fifth).not.toBe(first);
      expect(fifth).not.toBe(third);
      expect(sixth).toBe(fifth);
    }

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
});
