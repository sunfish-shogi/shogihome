import fs from "node:fs";
import { listLatestGames, listPlayers } from "@/renderer/external/floodgate";
import api, { API } from "@/renderer/ipc/api";
import { Mocked } from "vitest";
import { Color } from "tsshogi";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

const floodgateResources = fs.readFileSync("docs/floodgate/resources.json", "utf-8");
const samplePlayingGameList = fs.readFileSync("src/tests/testdata/floodgate/playing.txt", "utf-8");
const sampleGameHistory = fs.readFileSync(
  "src/tests/testdata/floodgate/floodgate_history_300_10F.yaml",
  "utf-8",
);
const samplePlayerList = fs.readFileSync("src/tests/testdata/floodgate/players.txt", "utf-8");

describe("Floodgate", () => {
  beforeAll(() => {
    mockAPI.loadRemoteTextFile.mockResolvedValueOnce(floodgateResources);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should list latest games", async () => {
    mockAPI.loadRemoteTextFile.mockResolvedValueOnce(samplePlayingGameList);
    mockAPI.loadRemoteTextFile.mockResolvedValueOnce(sampleGameHistory);

    const games = await listLatestGames();

    expect(games).toHaveLength(104);
    expect(games[0].id).toBe("wdoor+floodgate-300-10F+m4x+K0_3950X+20250524163008");
    expect(games[0].rule).toBe("300-10F");
    expect(games[0].url).toBe(
      "http://wdoor.c.u-tokyo.ac.jp/shogi/LATEST/2025/05/24/wdoor+floodgate-300-10F+m4x+K0_3950X+20250524163008.csa",
    );
    expect(games[0].blackName).toBe("m4x");
    expect(games[0].whiteName).toBe("K0_3950X");
    expect(games[0].dateTime.toISOString()).toBe("2025-05-24T07:30:08.000Z");
    expect(games[0].winner).toBeUndefined();
    expect(games[4].id).toBe(
      "wdoor+floodgate-300-10F+tanuki_wcsc33_473stb_10m+suisho5-1M+20250524163009",
    );
    expect(games[4].rule).toBe("300-10F");
    expect(games[4].url).toBe(
      "http://wdoor.c.u-tokyo.ac.jp/shogi/LATEST/2025/05/24/wdoor+floodgate-300-10F+tanuki_wcsc33_473stb_10m+suisho5-1M+20250524163009.csa",
    );
    expect(games[4].blackName).toBe("tanuki_wcsc33_473stb_10m");
    expect(games[4].whiteName).toBe("suisho5-1M");
    expect(games[4].dateTime.toISOString()).toBe("2025-05-24T07:30:09.000Z");
    expect(games[4].winner).toBe(Color.BLACK);
  });

  it("should list players", async () => {
    mockAPI.loadRemoteTextFile.mockResolvedValue(samplePlayerList);

    const players = await listPlayers();

    expect(players).toHaveLength(866);
    expect(players[94].name).toBe("Frieren");
    expect(players[94].rate).toBe(4598);
  });
});
