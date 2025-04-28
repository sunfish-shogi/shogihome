import api, { API } from "@/renderer/ipc/api.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import { BookStore } from "@/renderer/store/book.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { Record } from "tsshogi";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

describe("store/book", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await useAppSettings().updateAppSettings(defaultAppSettings());
  });

  describe("searchMoves", () => {
    const sfen = "lr5nl/3g1kg2/2n1p1sp1/p1ppspp1p/1p3P1P1/P1PPS1P1P/1PS1P1N2/2GK1G3/LN5RL w Bb 1";
    const sfen_r = "lr5nl/3g1kg2/2n1p1sp1/p1p1spp1p/1p1p3P1/P1PPSPP1P/1PS1P1N2/2GK1G3/LN5RL b Bb 1";

    it("match", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: true,
      });
      mockAPI.searchBookMoves.mockResolvedValue([
        { usi: "8a4a", comment: "foo" },
        { usi: "4d4e", comment: "bar" },
      ]);
      const record = new Record();
      const store = new BookStore(record);
      const moves = store.searchMoves(sfen);
      await expect(moves).resolves.toEqual([
        { usi: "8a4a", comment: "foo" },
        { usi: "4d4e", comment: "bar" },
      ]);
      expect(mockAPI.searchBookMoves).toHaveBeenCalledTimes(1);
      expect(mockAPI.searchBookMoves).toHaveBeenNthCalledWith(1, sfen);
    });

    it("match/flipped", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: true,
      });
      mockAPI.searchBookMoves.mockResolvedValueOnce([]);
      mockAPI.searchBookMoves.mockResolvedValueOnce([
        { usi: "8a4a", comment: "foo" },
        { usi: "4d4e", comment: "bar" },
      ]);
      const record = new Record();
      const store = new BookStore(record);
      const moves = store.searchMoves(sfen_r);
      await expect(moves).resolves.toEqual([
        { usi: "2i6i", comment: "foo" },
        { usi: "6f6e", comment: "bar" },
      ]);
      expect(mockAPI.searchBookMoves).toHaveBeenCalledTimes(2);
      expect(mockAPI.searchBookMoves).toHaveBeenNthCalledWith(1, sfen_r);
      expect(mockAPI.searchBookMoves).toHaveBeenNthCalledWith(2, sfen);
    });

    it("no match", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: false,
      });
      mockAPI.searchBookMoves.mockResolvedValue([]);
      const record = new Record();
      const store = new BookStore(record);
      const moves = store.searchMoves(sfen);
      await expect(moves).resolves.toEqual([]);
      expect(mockAPI.searchBookMoves).toHaveBeenCalledTimes(1);
      expect(mockAPI.searchBookMoves).toHaveBeenNthCalledWith(1, sfen);
    });
  });
});
