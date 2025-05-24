import fs from "node:fs";
import api, { API } from "@/renderer/ipc/api";
import { Mocked } from "vitest";
import { listGames } from "@/renderer/external/wcsc";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

const sampleGameList = fs.readFileSync("src/tests/testdata/wcsc/list.txt", "utf-8");

describe("wcsc", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should list games", async () => {
    mockAPI.loadRemoteTextFile.mockResolvedValue(sampleGameList);

    const games = await listGames("http://example.com/list.txt");

    expect(games).toHaveLength(289);
    expect(games[0].title).toBe(
      "第35回世界コンピュータ将棋選手権,決勝7回戦 AobaZero - Kanade 20250505161048",
    );
    expect(games[0].url).toBe(
      "http://live4.computer-shogi.org/wcsc35/kifu/WCSC35+F7_7-900-5F+AobaZero+Kanade+20250505161048.csa",
    );
  });
});
