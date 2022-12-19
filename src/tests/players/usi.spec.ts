import api, { API } from "@/ipc/api";
import { onUSIBestMove, onUSIInfo, USIPlayer } from "@/players/usi";
import { Record } from "@/shogi";
import { timeLimitSetting } from "../mock/game";
import { usiEngineSettingWithPonder } from "../mock/usi";

jest.mock("@/ipc/api");

const mockAPI = api as jest.Mocked<API>;

describe("usi", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("ponderHit", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiGoPonder.mockResolvedValueOnce();
    mockAPI.usiPonderHit.mockResolvedValueOnce();
    const usi1 =
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d";
    const usi2 =
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f";
    const usi3 =
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d";
    const record1 = Record.newByUSI(usi1) as Record;
    const record2 = Record.newByUSI(usi2) as Record;
    const record3 = Record.newByUSI(usi3) as Record;
    const player = new USIPlayer(usiEngineSettingWithPonder, 10);
    try {
      await player.launch();
      const searchHandler = {
        onMove: jest.fn(),
        onResign: jest.fn(),
        onWin: jest.fn(),
        onError: jest.fn(),
      };
      await player.startSearch(record1, timeLimitSetting, 0, 0, searchHandler);
      expect(mockAPI.usiGo).toBeCalledWith(100, usi1, timeLimitSetting, 0, 0);
      onUSIBestMove(100, usi1, "2g2f", "8c8d");
      expect(searchHandler.onMove.mock.calls[0][0].usi).toBe("2g2f");
      await player.startPonder(record2, timeLimitSetting, 0, 0);
      expect(mockAPI.usiGoPonder).toBeCalled();
      onUSIInfo(100, usi3, {
        pv: ["2f2e", "8d8e"],
      });
      await player.startSearch(record3, timeLimitSetting, 0, 0, searchHandler);
      expect(mockAPI.usiPonderHit).toBeCalledWith(100);
      onUSIBestMove(100, usi3, "2f2e");
      expect(searchHandler.onMove.mock.calls[1][0].usi).toBe("2f2e");
      expect(searchHandler.onMove.mock.calls[1][1].pv[0].usi).toBe("8d8e");
    } finally {
      await player.close();
    }
  });
});
