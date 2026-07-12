import api, { API } from "@/renderer/ipc/api.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import { BookStore } from "@/renderer/store/book.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { Record } from "tsshogi";
import { Mocked } from "vitest";
import { defaultBookSession } from "@/common/book";

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
      mockAPI.searchBookEntry.mockResolvedValue({
        moves: [
          { usi: "8a4a", comment: "foo" },
          { usi: "4d4e", comment: "bar" },
        ],
      });
      const record = new Record();
      const store = new BookStore(record);
      const moves = store.searchMoves(sfen);
      await expect(moves).resolves.toEqual([
        { usi: "8a4a", comment: "foo" },
        { usi: "4d4e", comment: "bar" },
      ]);
      expect(mockAPI.searchBookEntry).toHaveBeenCalledTimes(1);
      expect(mockAPI.searchBookEntry).toHaveBeenNthCalledWith(1, defaultBookSession, sfen);
    });

    it("match/flipped", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: true,
      });
      mockAPI.searchBookEntry.mockResolvedValueOnce(null);
      mockAPI.searchBookEntry.mockResolvedValueOnce({
        moves: [
          { usi: "8a4a", comment: "foo" },
          { usi: "4d4e", comment: "bar" },
        ],
      });
      const record = new Record();
      const store = new BookStore(record);
      const moves = store.searchMoves(sfen_r);
      await expect(moves).resolves.toEqual([
        { usi: "2i6i", comment: "foo" },
        { usi: "6f6e", comment: "bar" },
      ]);
      expect(mockAPI.searchBookEntry).toHaveBeenCalledTimes(2);
      expect(mockAPI.searchBookEntry).toHaveBeenNthCalledWith(1, defaultBookSession, sfen_r);
      expect(mockAPI.searchBookEntry).toHaveBeenNthCalledWith(2, defaultBookSession, sfen);
    });

    it("no match", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: false,
      });
      mockAPI.searchBookEntry.mockResolvedValue(null);
      const record = new Record();
      const store = new BookStore(record);
      const moves = store.searchMoves(sfen);
      await expect(moves).resolves.toEqual([]);
      expect(mockAPI.searchBookEntry).toHaveBeenCalledTimes(1);
      expect(mockAPI.searchBookEntry).toHaveBeenNthCalledWith(1, defaultBookSession, sfen);
    });
  });

  describe("reloadBookMoves", () => {
    it("positionProperties", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: false,
      });
      mockAPI.searchBookEntry.mockResolvedValue({
        moves: [{ usi: "7g7f", usi2: "3c3d", score: 42, sbkId: 123 }],
        comment: "positional comment",
        minPly: 10,
        games: 8,
        wonBlack: 5,
        wonWhite: 3,
      });
      const record = new Record();
      const store = new BookStore(record);
      await store.reloadBookMoves();
      expect(store.moves).toEqual([
        { usi: "7g7f", usi2: "3c3d", score: 42, sbkId: 123, repetition: 0 },
      ]);
      expect(store.positionProperties).toEqual({
        comment: "positional comment",
        minPly: 10,
        games: 8,
        wonBlack: 5,
        wonWhite: 3,
        sbkEvals: undefined,
      });
    });

    it("positionProperties/flipped", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: true,
      });
      mockAPI.searchBookEntry.mockResolvedValueOnce(null);
      mockAPI.searchBookEntry.mockResolvedValueOnce({
        moves: [{ usi: "7g7f" }],
        games: 8,
        wonBlack: 5,
        wonWhite: 3,
      });
      const record = new Record();
      const store = new BookStore(record);
      await store.reloadBookMoves();
      // 反転局面の定跡を利用する場合は先手勝ちと後手勝ちを入れ替える。
      expect(store.positionProperties.wonBlack).toBe(3);
      expect(store.positionProperties.wonWhite).toBe(5);
      expect(store.moves[0].usi).toBe("3c3d");
    });

    it("updatePositionComment/flipped", async () => {
      await useAppSettings().updateAppSettings({
        flippedBook: true,
      });
      mockAPI.searchBookEntry.mockResolvedValueOnce(null);
      mockAPI.searchBookEntry.mockResolvedValueOnce({
        moves: [{ usi: "7g7f" }],
      });
      mockAPI.updateBookPositionComment.mockResolvedValue();
      const record = new Record();
      const store = new BookStore(record);
      await store.reloadBookMoves();
      mockAPI.searchBookEntry.mockResolvedValue({ moves: [{ usi: "7g7f" }], comment: "new" });
      await store.updatePositionComment("new");
      // 反転局面の定跡を表示している場合はコメントも反転局面に対して書き込む。
      expect(mockAPI.updateBookPositionComment).toHaveBeenCalledWith(
        defaultBookSession,
        expect.stringContaining(" w "),
        "new",
      );
    });
  });
});
