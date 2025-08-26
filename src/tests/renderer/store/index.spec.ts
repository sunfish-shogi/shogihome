/* eslint-disable @typescript-eslint/no-non-null-assertion */
import api, { API } from "@/renderer/ipc/api.js";
import { exportKI2, ImmutablePosition, InitialPositionSFEN, Move, Position } from "tsshogi";
import { createStore } from "@/renderer/store/index.js";
import { RecordCustomData } from "@/renderer/store/record.js";
import * as audio from "@/renderer/devices/audio.js";
import { gameSettings10m30s } from "@/tests/mock/game.js";
import { GameManager } from "@/renderer/store/game.js";
import { AppState, ResearchState } from "@/common/control/state.js";
import { AnalysisManager } from "@/renderer/store/analysis.js";
import { analysisSettings } from "@/tests/mock/analysis.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { researchSettings } from "@/tests/mock/research.js";
import {
  csaGameSettings,
  emptyCSAGameSettingsHistory,
  singleCSAGameSettingsHistory,
} from "@/tests/mock/csa.js";
import { CSAGameManager } from "@/renderer/store/csa.js";
import { convert } from "encoding-japanese";
import { Mocked, MockedClass } from "vitest";
import { useAppSettings } from "@/renderer/store/settings.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import { useMessageStore } from "@/renderer/store/message.js";
import { useBusyState } from "@/renderer/store/busy.js";
import { useErrorStore } from "@/renderer/store/error.js";
import { useConfirmationStore } from "@/renderer/store/confirm.js";
import { RecordFileFormat } from "@/common/file/record.js";
import { mateSearchSettings } from "@/tests/mock/mate.js";
import { MateSearchManager } from "@/renderer/store/mate.js";

vi.mock("@/renderer/devices/audio.js");
vi.mock("@/renderer/ipc/api.js");
vi.mock("@/renderer/store/game.js");
vi.mock("@/renderer/store/csa.js");
vi.mock("@/renderer/players/usi.js");
vi.mock("@/renderer/store/analysis.js");
vi.mock("@/renderer/store/mate.js");

const mockAudio = audio as Mocked<typeof audio>;
const mockAPI = api as Mocked<API>;
const mockGameManager = GameManager as MockedClass<typeof GameManager>;
const mockCSAGameManager = CSAGameManager as MockedClass<typeof CSAGameManager>;
const mockUSIPlayer = USIPlayer as MockedClass<typeof USIPlayer>;
const mockAnalysisManager = AnalysisManager as MockedClass<typeof AnalysisManager>;
const mockMateSearchManager = MateSearchManager as MockedClass<typeof MateSearchManager>;

const sampleKIF = `
手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
*通常コメント
   2 ８四歩(83)   ( 0:00/00:00:00)
*#評価値=108
   3 ７六歩(77)   ( 0:00/00:00:00)
   4 ８五歩(84)   ( 0:00/00:00:00)
   5 ７七角(88)   ( 0:00/00:00:00)
   6 ３二金(41)   ( 0:00/00:00:00)
   7 ６八銀(79)   ( 0:00/00:00:00)
   8 ３四歩(33)   ( 0:00/00:00:00)
   9 ７八金(69)   ( 0:00/00:00:00)
  10 ４二銀(31)   ( 0:00/00:00:00)
`;

const sampleKIF2 = `
手合割：平手
手数----指手---------消費時間--
   1 １六歩(17)   ( 0:00/00:00:00)
   2 １四歩(13)   ( 0:00/00:00:00)
   3 ３八銀(39)   ( 0:00/00:00:00)
`;

const sampleCSA = `V2.2
P1 *  *  *  *  *  *  * -KE * 
P2 *  *  *  *  *  * -KI-OU * 
P3 *  *  *  *  *  * -KI-FU+KE
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  * -KA * +FU
P7 *  *  *  *  *  *  *  *  * 
P8 *  *  *  *  *  *  *  *  * 
P9 *  *  *  *  *  *  *  *  * 
P+00HI00HI00KI00KI
P-00AL
+
+1321NK,T0
'読み飛ばすコメント
'*初手へのコメント
'** 30011 2b2a
-2221OU,T0
'** 30010
+0013KE,T0
'** 30009
-2122OU,T0
'** 30008
+0012KI,T0
'** 30007
-2212OU,T0
'** 30006
+0011HI,T0
'** 30005
-1211OU,T0
'** 30004
+0021KI,T0
'** 30003
-1112OU,T0
'** 30002
+0011HI,T0
'** 30001
%TSUMI,T0
`;

const sampleBranchKIF = `
手合割：平手
手数----指手---------消費時間--
1 ２六歩(27) ( 0:00/0:00:00)
2 ８四歩(83) ( 0:00/0:00:00)
3 ２五歩(26) ( 0:00/0:00:00)
4 ８五歩(84) ( 0:00/0:00:00)
5 ７八金(69) ( 0:00/0:00:00)
6 ３二金(41) ( 0:00/0:00:00)
7 ３八銀(39) ( 0:00/0:00:00)+
8 ７二銀(71) ( 0:00/0:00:00)
9 中断 ( 0:00/0:00:00)

変化：7手
7 ２四歩(25) ( 0:00/0:00:00)
`;

describe("store/index", () => {
  beforeEach(() => {
    mockGameManager.prototype.on.mockReturnThis();
    mockCSAGameManager.prototype.on.mockReturnThis();
    mockAnalysisManager.prototype.on.mockReturnThis();
    mockMateSearchManager.prototype.on.mockReturnThis();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    while (useMessageStore().hasMessage) {
      useMessageStore().dequeue();
    }
    useErrorStore().clear();
    await useAppSettings().updateAppSettings(defaultAppSettings());
  });

  it("updateUSIInfo", () => {
    vi.useFakeTimers();
    const usi = "position startpos moves 7g7f";
    const position = Position.newBySFEN(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
    ) as ImmutablePosition;
    const store = createStore();
    store.pasteRecord(usi);
    store.updateUSIInfo(101, position, "Engine A", {
      depth: 8,
      scoreCP: 138,
      pv: ["8c8d", "2g2f", "foo", "bar"],
    });
    vi.runOnlyPendingTimers();
    expect(store.usiMonitors).toHaveLength(1);
    expect(store.usiMonitors[0].sfen).toBe(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
    );
    expect(store.usiMonitors[0].infoList.length).toBe(1);
    expect(store.usiMonitors[0].infoList[0].depth).toBe(8);
    expect(store.usiMonitors[0].infoList[0].score).toBe(138);
    expect(store.usiMonitors[0].infoList[0].pv).toEqual(["8c8d", "2g2f", "foo", "bar"]);
    expect(store.usiMonitors[0].infoList[0].text).toBe("☖８四歩☗２六歩 foo bar");
    store.updateUSIInfo(101, position, "Engine A", {
      depth: 10,
      scoreCP: 213,
    });
    store.updateUSIInfo(
      102,
      position,
      "Engine B",
      { depth: 9, scoreCP: -89 },
      position.createMoveByUSI("8c8d") as Move,
    );
    vi.runOnlyPendingTimers();
    expect(store.usiMonitors).toHaveLength(2);
    expect(store.usiMonitors[0].infoList).toHaveLength(2);
    expect(store.usiMonitors[0].infoList[0].depth).toBe(10);
    expect(store.usiMonitors[0].infoList[0].score).toBe(213);
    expect(store.usiMonitors[0].latestInfo).toHaveLength(1);
    expect(store.usiMonitors[0].latestInfo[0].score).toBe(213);
    expect(store.usiMonitors[0].ponderMove).toBeUndefined();
    expect(store.usiMonitors[1].infoList).toHaveLength(1);
    expect(store.usiMonitors[1].infoList[0].depth).toBe(9);
    expect(store.usiMonitors[1].infoList[0].score).toBe(-89);
    expect(store.usiMonitors[1].latestInfo).toHaveLength(1);
    expect(store.usiMonitors[1].latestInfo[0].score).toBe(-89);
    expect(store.usiMonitors[1].ponderMove).toBe("☖８四歩");
  });

  it("updateUSIInfo with multipv", () => {
    vi.useFakeTimers();
    const usi = "position startpos moves 7g7f";
    const position = Position.newBySFEN(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
    ) as ImmutablePosition;
    const store = createStore();
    store.pasteRecord(usi);

    store.updateUSIInfo(101, position, "Engine A", {
      depth: 11,
      scoreCP: 198,
      multipv: 1,
      pv: ["8c8d", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      depth: 11,
      scoreCP: 170,
      multipv: 2,
      pv: ["3c3e", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      depth: 11,
      scoreCP: 169,
      multipv: 3,
      pv: ["5c5d", "2g2f"],
    });
    vi.runOnlyPendingTimers();
    expect(store.usiMonitors[0].latestInfo).toHaveLength(3);
    expect(store.usiMonitors[0].latestInfo[0].score).toBe(198);
    expect(store.usiMonitors[0].latestInfo[1].score).toBe(170);
    expect(store.usiMonitors[0].latestInfo[2].score).toBe(169);

    store.updateUSIInfo(101, position, "Engine A", {
      depth: 12,
      scoreCP: 187,
      multipv: 1,
      pv: ["8c8d", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      depth: 12,
      scoreCP: 181,
      multipv: 2,
      pv: ["3c3e", "2g2f"],
    });
    vi.runOnlyPendingTimers();
    expect(store.usiMonitors[0].latestInfo).toHaveLength(3);
    expect(store.usiMonitors[0].latestInfo[0].score).toBe(187);
    expect(store.usiMonitors[0].latestInfo[1].score).toBe(181);
    expect(store.usiMonitors[0].latestInfo[2].score).toBe(169); // 3rd move is not updated

    store.updateUSIInfo(101, position, "Engine A", {
      depth: 13,
      scoreCP: 210,
      multipv: 1,
      pv: ["8c8d", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      depth: 13,
      scoreCP: 152,
      multipv: 2,
      pv: ["3c3e", "2g2f"],
    });
    vi.runOnlyPendingTimers();
    // 3rd move is ignored because it is not updated in the two previous infoList
    expect(store.usiMonitors[0].latestInfo).toHaveLength(2);
    expect(store.usiMonitors[0].latestInfo[0].score).toBe(210);
    expect(store.usiMonitors[0].latestInfo[1].score).toBe(152);

    store.updateUSIInfo(101, position, "Engine A", {
      depth: 13,
      scoreCP: 231,
      multipv: 1,
      pv: ["3c3e", "2g2f"],
    });
    vi.runOnlyPendingTimers();
    // 3c3e is promoted to the best move
    expect(store.usiMonitors[0].latestInfo).toHaveLength(1);
    expect(store.usiMonitors[0].latestInfo[0].score).toBe(231);
  });

  it("endUSIInfoIteration", () => {
    vi.useFakeTimers();
    const usi = "position startpos moves 7g7f";
    const position = Position.newBySFEN(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
    ) as ImmutablePosition;
    const store = createStore();
    store.pasteRecord(usi);

    store.updateUSIInfo(101, position, "Engine A", { depth: 8, scoreCP: 65, pv: ["8c8d"] });
    store.updateUSIInfo(102, position, "Engine B", { depth: 6, scoreCP: -20, pv: ["3c3d"] });
    vi.runOnlyPendingTimers();

    store.updateUSIInfo(101, position, "Engine A", { depth: 11, scoreCP: 198, pv: ["8c8d"] });
    store.updateUSIInfo(102, position, "Engine B", { depth: 9, scoreCP: -89, pv: ["3c3d"] });
    store.endUSIIteration(101);
    vi.runOnlyPendingTimers();
    expect(store.usiMonitors).toHaveLength(2);
    expect(store.usiMonitors[0].infoList).toHaveLength(2);
    expect(store.usiMonitors[0].refreshOnNextUpdate).toBeTruthy();
    expect(store.usiMonitors[1].infoList).toHaveLength(2);
    expect(store.usiMonitors[1].refreshOnNextUpdate).toBeFalsy();

    store.updateUSIInfo(101, position, "Engine A", { depth: 12, scoreCP: 72, pv: ["5c5d"] });
    store.updateUSIInfo(102, position, "Engine B", { depth: 10, scoreCP: 32, pv: ["5c5d"] });
    vi.runOnlyPendingTimers();
    expect(store.usiMonitors).toHaveLength(2);
    expect(store.usiMonitors[0].infoList).toHaveLength(1);
    expect(store.usiMonitors[0].refreshOnNextUpdate).toBeFalsy();
    expect(store.usiMonitors[1].infoList).toHaveLength(3);
    expect(store.usiMonitors[1].refreshOnNextUpdate).toBeFalsy();
  });

  it("candidates", async () => {
    vi.useFakeTimers();
    const usi = "position startpos moves 7g7f";
    const position = Position.newBySFEN(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
    ) as ImmutablePosition;
    const store = createStore();
    store.pasteRecord(usi);
    expect(store.candidates).toHaveLength(0);

    store.updateUSIInfo(101, position, "Engine A", {
      multipv: 1,
      scoreCP: 83,
      pv: ["8c8d", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      multipv: 2,
      scoreCP: 0,
      pv: ["4a3b", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      multipv: 3,
      scoreCP: -5,
      pv: ["3c3d", "2g2f"],
    });
    store.updateUSIInfo(101, position, "Engine A", {
      multipv: 4,
      scoreCP: -21,
      pv: ["5c5d", "2g2f"],
    });
    store.updateUSIInfo(102, position, "Engine B", {
      scoreCP: -5,
      pv: ["9c9d", "9g9f"],
    });
    store.updateUSIInfo(103, position, "Engine C", {
      multipv: 1,
      scoreMate: 3,
      pv: ["3c3d", "5g5f"],
    });
    store.updateUSIInfo(103, position, "Engine C", {
      multipv: 2,
      scoreCP: 150,
      pv: ["1c1d", "5g5f"],
    });
    store.updateUSIInfo(103, position, "Engine C", {
      multipv: 3,
      scoreMate: -5,
      pv: ["7c7d", "5g5f"],
    });
    store.updateUSIInfo(
      104,
      position,
      "Engine D",
      { scoreCP: 7, pv: ["5c5d", "2g2f"] },
      position.createMoveByUSI("8c8d") as Move,
    );
    vi.runOnlyPendingTimers();

    await useAppSettings().updateAppSettings({ maxArrowsPerEngine: 3 });
    expect(store.candidates).toHaveLength(4);
    expect(store.candidates[0].usi).toBe("8c8d");
    expect(store.candidates[1].usi).toBe("4a3b");
    expect(store.candidates[2].usi).toBe("3c3d");
    expect(store.candidates[3].usi).toBe("9c9d");

    await useAppSettings().updateAppSettings({ maxArrowsPerEngine: 1 });
    expect(store.candidates).toHaveLength(3);
    expect(store.candidates[0].usi).toBe("8c8d");
    expect(store.candidates[1].usi).toBe("9c9d");
    expect(store.candidates[2].usi).toBe("3c3d");

    await useAppSettings().updateAppSettings({ maxArrowsPerEngine: 0 });
    expect(store.candidates).toHaveLength(0);
  });

  it("startGame/success", async () => {
    mockAPI.saveGameSettings.mockResolvedValue();
    mockGameManager.prototype.start.mockResolvedValue();
    const store = createStore();
    store.showGameDialog();
    store.startGame(gameSettings10m30s);
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.GAME);
    expect(mockAPI.saveGameSettings).toBeCalledTimes(1);
    expect(mockAPI.saveGameSettings.mock.calls[0][0]).toBe(gameSettings10m30s);
    expect(mockGameManager.prototype.start).toBeCalledTimes(1);
    expect(mockGameManager.prototype.start.mock.calls[0][0]).toBe(gameSettings10m30s);
  });

  it("startGame/invalidState", () => {
    const store = createStore();
    store.showAnalysisDialog();
    store.startGame(gameSettings10m30s);
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.ANALYSIS_DIALOG);
  });

  it("loginCSAGame/success", async () => {
    mockAPI.loadCSAGameSettingsHistory.mockResolvedValue(emptyCSAGameSettingsHistory);
    mockAPI.saveCSAGameSettingsHistory.mockResolvedValue();
    mockCSAGameManager.prototype.login.mockResolvedValue();
    const store = createStore();
    store.showCSAGameDialog();
    store.loginCSAGame(csaGameSettings, { saveHistory: true });
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.CSA_GAME);
    expect(mockAPI.loadCSAGameSettingsHistory).toBeCalledTimes(1);
    expect(mockAPI.saveCSAGameSettingsHistory).toBeCalledTimes(1);
    expect(mockAPI.saveCSAGameSettingsHistory.mock.calls[0][0]).toStrictEqual(
      singleCSAGameSettingsHistory,
    );
    expect(mockCSAGameManager.prototype.login).toBeCalledTimes(1);
    expect(mockCSAGameManager.prototype.login.mock.calls[0][0]).toBe(csaGameSettings);
  });

  it("loginCSAGame/doNotSaveHistory", async () => {
    mockAPI.loadCSAGameSettingsHistory.mockResolvedValue(emptyCSAGameSettingsHistory);
    mockAPI.saveCSAGameSettingsHistory.mockResolvedValue();
    mockCSAGameManager.prototype.login.mockResolvedValue();
    const store = createStore();
    store.showCSAGameDialog();
    store.loginCSAGame(csaGameSettings, { saveHistory: false });
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.CSA_GAME);
    expect(mockAPI.loadCSAGameSettingsHistory).toBeCalledTimes(0);
    expect(mockAPI.saveCSAGameSettingsHistory).toBeCalledTimes(0);
    expect(mockCSAGameManager.prototype.login).toBeCalledTimes(1);
    expect(mockCSAGameManager.prototype.login.mock.calls[0][0]).toBe(csaGameSettings);
  });

  it("loginCSAGame/invalidState", () => {
    const store = createStore();
    store.loginCSAGame(csaGameSettings, { saveHistory: true });
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.NORMAL);
  });

  it("startResearch/success", async () => {
    mockAPI.saveResearchSettings.mockResolvedValue();
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    const store = createStore();
    store.showResearchDialog();
    store.startResearch(researchSettings);
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.researchState).toBe(ResearchState.RUNNING);
    expect(mockAPI.saveResearchSettings).toBeCalledTimes(1);
    expect(mockUSIPlayer).toBeCalledTimes(1);
    expect(mockUSIPlayer.mock.calls[0][0]).toStrictEqual(researchSettings.usi);
    expect(mockUSIPlayer.prototype.launch).toBeCalledTimes(1);
    // FIXME: 遅延実行の導入によってすぐに呼ばれなくなった。
    //expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
    mockUSIPlayer.prototype.close.mockResolvedValue();
    store.stopResearch();
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.NORMAL);
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
  });

  it("startResearch/invalidState", () => {
    const store = createStore();
    store.startResearch(researchSettings);
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.NORMAL);
  });

  it("startAnalysis/success", async () => {
    mockAPI.saveAnalysisSettings.mockResolvedValue();
    mockAnalysisManager.prototype.start.mockResolvedValue();
    const store = createStore();
    store.showAnalysisDialog();
    store.startAnalysis(analysisSettings);
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.ANALYSIS);
    expect(mockAPI.saveAnalysisSettings).toBeCalledTimes(1);
    expect(mockAPI.saveAnalysisSettings.mock.calls[0][0]).toBe(analysisSettings);
    expect(mockAnalysisManager).toBeCalledTimes(1);
    expect(mockAnalysisManager.prototype.start).toBeCalledTimes(1);
    expect(mockAnalysisManager.prototype.start.mock.calls[0][0]).toBe(analysisSettings);
  });

  it("startAnalysis/invalidState", () => {
    const store = createStore();
    store.startAnalysis(analysisSettings);
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.NORMAL);
  });

  it("startMateSearch/success", async () => {
    mockAPI.saveMateSearchSettings.mockResolvedValue();
    mockMateSearchManager.prototype.start.mockResolvedValue();
    const store = createStore();
    store.showMateSearchDialog();
    expect(store.appState).toBe(AppState.MATE_SEARCH_DIALOG);
    store.startMateSearch(mateSearchSettings);
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.appState).toBe(AppState.MATE_SEARCH);
    expect(mockAPI.saveMateSearchSettings).toBeCalledWith(mateSearchSettings);
    expect(mockMateSearchManager.prototype.start).toBeCalledTimes(1);
    expect(mockMateSearchManager.prototype.start.mock.calls[0][0]).toBe(mateSearchSettings);
  });

  it("doMove", () => {
    mockAudio.playPieceBeat.mockReturnValue();
    const store = createStore();
    store.doMove(store.record.position.createMoveByUSI("7g7f") as Move);
    store.doMove(store.record.position.createMoveByUSI("3c3d") as Move);
    store.doMove(store.record.position.createMoveByUSI("2g2f") as Move);
    expect(store.record.current.ply).toBe(3);
    expect(store.record.position.sfen).toBe(
      "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1",
    );
  });

  it("resetRecord", async () => {
    mockAPI.showOpenRecordDialog.mockResolvedValueOnce("/test/sample.csa");
    mockAPI.openRecord.mockResolvedValueOnce(
      new Uint8Array(convert(sampleCSA, { type: "arraybuffer", to: "SJIS" })),
    );
    const store = createStore();
    store.openRecord();
    await new Promise((resolve) => setTimeout(resolve));

    store.resetRecord();
    expect(useConfirmationStore().message).toBe("現在の棋譜は削除されます。よろしいですか？");
    useConfirmationStore().cancel();
    expect(store.record.moves.length).not.toBe(1);
    expect(store.recordFilePath).not.toBeUndefined();

    store.resetRecord();
    expect(useConfirmationStore().message).toBe("現在の棋譜は削除されます。よろしいですか？");
    useConfirmationStore().ok();
    expect(store.record.moves.length).toBe(1);
    expect(store.recordFilePath).toBeUndefined();
    expect(store.record.position.sfen).toBe("7n1/6gk1/6gpN/9/9/6b1P/9/9/9 b 2R2Gb4s2n4l16p 1");

    store.resetRecord("hirateSetup");
    expect(useConfirmationStore().message).toBe("現在の棋譜は削除されます。よろしいですか？");
    useConfirmationStore().ok();
    expect(store.record.moves.length).toBe(1);
    expect(store.recordFilePath).toBeUndefined();
    expect(store.record.position.sfen).toBe(InitialPositionSFEN.STANDARD);
  });

  it("removeCurrentMove", () => {
    const store = createStore();
    store.pasteRecord(sampleBranchKIF);
    store.changePly(8);
    store.removeCurrentMove();
    expect(useConfirmationStore().message).toBeUndefined();
    expect(store.record.current.ply).toBe(7);
    expect(store.record.moves.length).toBe(8);
    store.removeCurrentMove();
    expect(useConfirmationStore().message).toBeUndefined();
    expect(store.record.current.ply).toBe(6);
    expect(store.record.moves.length).toBe(8);
    store.removeCurrentMove();
    expect(useConfirmationStore().message).toBe("6手目以降を削除します。よろしいですか？");
    useConfirmationStore().cancel();
    expect(store.record.current.ply).toBe(6);
    expect(store.record.moves.length).toBe(8);
    store.removeCurrentMove();
    expect(useConfirmationStore().message).toBe("6手目以降を削除します。よろしいですか？");
    useConfirmationStore().ok();
    expect(store.record.current.ply).toBe(5);
    expect(store.record.moves.length).toBe(6);
  });

  it("copyRecord", async () => {
    const writeText = vi.fn();
    vi.spyOn(global, "navigator", "get").mockReturnValueOnce(
      Object.assign(navigator, {
        clipboard: {
          writeText,
        },
      }),
    );
    const store = createStore();
    store.pasteRecord("position startpos moves 2g2f 3c3d 7g7f 4a3b");
    store.changePly(2);

    store.copyRecordKIF();
    expect(writeText).lastCalledWith(
      "手合割：平手\r\n" +
        "手数----指手---------消費時間--\r\n" +
        "   1 ２六歩(27)   ( 0:00/00:00:00)\r\n" +
        "   2 ３四歩(33)   ( 0:00/00:00:00)\r\n" +
        "   3 ７六歩(77)   ( 0:00/00:00:00)\r\n" +
        "   4 ３二金(41)   ( 0:00/00:00:00)\r\n",
    );

    store.copyRecordKIF({ fromCurrentPosition: true });
    expect(writeText).lastCalledWith(
      "後手の持駒：なし\r\n" +
        "  ９ ８ ７ ６ ５ ４ ３ ２ １\r\n" +
        "+---------------------------+\r\n" +
        "|v香v桂v銀v金v玉v金v銀v桂v香|一\r\n" +
        "| ・v飛 ・ ・ ・ ・ ・v角 ・|二\r\n" +
        "|v歩v歩v歩v歩v歩v歩 ・v歩v歩|三\r\n" +
        "| ・ ・ ・ ・ ・ ・v歩 ・ ・|四\r\n" +
        "| ・ ・ ・ ・ ・ ・ ・ ・ ・|五\r\n" +
        "| ・ ・ ・ ・ ・ ・ ・ 歩 ・|六\r\n" +
        "| 歩 歩 歩 歩 歩 歩 歩 ・ 歩|七\r\n" +
        "| ・ 角 ・ ・ ・ ・ ・ 飛 ・|八\r\n" +
        "| 香 桂 銀 金 玉 金 銀 桂 香|九\r\n" +
        "+---------------------------+\r\n" +
        "先手の持駒：なし\r\n" +
        "先手番\r\n" +
        "手数----指手---------消費時間--\r\n" +
        "   1 ７六歩(77)   ( 0:00/00:00:00)\r\n" +
        "   2 ３二金(41)   ( 0:00/00:00:00)\r\n",
    );

    store.copyRecordKI2();
    expect(writeText).lastCalledWith("手合割：平手\r\n▲２六歩    △３四歩    ▲７六歩    △３二金");

    store.copyRecordKI2({ fromCurrentPosition: true });
    expect(writeText).lastCalledWith(
      "後手の持駒：なし\r\n" +
        "  ９ ８ ７ ６ ５ ４ ３ ２ １\r\n" +
        "+---------------------------+\r\n" +
        "|v香v桂v銀v金v玉v金v銀v桂v香|一\r\n" +
        "| ・v飛 ・ ・ ・ ・ ・v角 ・|二\r\n" +
        "|v歩v歩v歩v歩v歩v歩 ・v歩v歩|三\r\n" +
        "| ・ ・ ・ ・ ・ ・v歩 ・ ・|四\r\n" +
        "| ・ ・ ・ ・ ・ ・ ・ ・ ・|五\r\n" +
        "| ・ ・ ・ ・ ・ ・ ・ 歩 ・|六\r\n" +
        "| 歩 歩 歩 歩 歩 歩 歩 ・ 歩|七\r\n" +
        "| ・ 角 ・ ・ ・ ・ ・ 飛 ・|八\r\n" +
        "| 香 桂 銀 金 玉 金 銀 桂 香|九\r\n" +
        "+---------------------------+\r\n" +
        "先手の持駒：なし\r\n" +
        "先手番\r\n" +
        "▲７六歩    △３二金",
    );

    store.copyRecordCSA();
    expect(writeText).lastCalledWith(
      "V2.2\r\nPI\r\n+\r\n+2726FU\r\nT0\r\n-3334FU\r\nT0\r\n+7776FU\r\nT0\r\n-4132KI\r\nT0\r\n",
    );

    store.copyRecordCSA({ fromCurrentPosition: true });
    expect(writeText).lastCalledWith(
      "V2.2\r\n" +
        "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY\r\n" +
        "P2 * -HI *  *  *  *  * -KA * \r\n" +
        "P3-FU-FU-FU-FU-FU-FU * -FU-FU\r\n" +
        "P4 *  *  *  *  *  * -FU *  * \r\n" +
        "P5 *  *  *  *  *  *  *  *  * \r\n" +
        "P6 *  *  *  *  *  *  * +FU * \r\n" +
        "P7+FU+FU+FU+FU+FU+FU+FU * +FU\r\n" +
        "P8 * +KA *  *  *  *  * +HI * \r\n" +
        "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY\r\n" +
        "P+\r\n" +
        "P-\r\n" +
        "+\r\n+7776FU\r\nT0\r\n-4132KI\r\nT0\r\n",
    );

    await useAppSettings().updateAppSettings({ useCSAV3: true });
    store.copyRecordCSA();
    expect(writeText).lastCalledWith(
      "'CSA encoding=UTF-8\r\nV3.0\r\nPI\r\n+\r\n+2726FU\r\nT0\r\n-3334FU\r\nT0\r\n+7776FU\r\nT0\r\n-4132KI\r\nT0\r\n",
    );

    store.copyRecordUSI("all");
    expect(writeText).lastCalledWith("position startpos moves 2g2f 3c3d 7g7f 4a3b");

    store.copyRecordUSI("before");
    expect(writeText).lastCalledWith("position startpos moves 2g2f 3c3d");

    store.copyRecordUSI("after");
    expect(writeText).lastCalledWith(
      "position sfen lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL b - 1 moves 7g7f 4a3b",
    );

    store.copyRecordJKF();
    expect(writeText).lastCalledWith(
      '{"header":{},"initial":{"preset":"HIRATE"},"moves":[{},{"time":{"now":{"m":0,"s":0},"total":{"h":0,"m":0,"s":0}},"move":{"color":0,"piece":"FU","to":{"x":2,"y":6},"from":{"x":2,"y":7}}},{"time":{"now":{"m":0,"s":0},"total":{"h":0,"m":0,"s":0}},"move":{"color":1,"piece":"FU","to":{"x":3,"y":4},"from":{"x":3,"y":3}}},{"time":{"now":{"m":0,"s":0},"total":{"h":0,"m":0,"s":0}},"move":{"color":0,"piece":"FU","to":{"x":7,"y":6},"from":{"x":7,"y":7}}},{"time":{"now":{"m":0,"s":0},"total":{"h":0,"m":0,"s":0}},"move":{"color":1,"piece":"KI","to":{"x":3,"y":2},"from":{"x":4,"y":1}}}]}',
    );

    store.copyRecordUSEN();
    expect(writeText).lastCalledWith("~0.6y22jm7ku0e4.");
  });

  it("copyBoard", () => {
    const writeText = vi.fn();
    vi.spyOn(global, "navigator", "get").mockReturnValueOnce(
      Object.assign(navigator, {
        clipboard: {
          writeText,
        },
      }),
    );
    const store = createStore();
    store.pasteRecord(sampleKIF);

    store.copyBoardSFEN();
    expect(writeText).lastCalledWith(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );

    store.copyBoardBOD();
    expect(writeText).lastCalledWith(`後手の持駒：なし
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
|v香v桂v銀v金v玉v金v銀v桂v香|一
| ・v飛 ・ ・ ・ ・ ・v角 ・|二
|v歩v歩v歩v歩v歩v歩v歩v歩v歩|三
| ・ ・ ・ ・ ・ ・ ・ ・ ・|四
| ・ ・ ・ ・ ・ ・ ・ ・ ・|五
| ・ ・ ・ ・ ・ ・ ・ ・ ・|六
| 歩 歩 歩 歩 歩 歩 歩 歩 歩|七
| ・ 角 ・ ・ ・ ・ ・ 飛 ・|八
| 香 桂 銀 金 玉 金 銀 桂 香|九
+---------------------------+
先手の持駒：なし
先手番
手数＝0    まで
`);
  });

  it("pasteRecord/kif/success", () => {
    const store = createStore();
    store.pasteRecord(sampleKIF);
    const moves = store.record.moves;
    expect(moves.length).toBe(11);
    expect(moves[1].comment).toBe("通常コメント\n");
    expect(moves[1].customData).toStrictEqual({});
    expect(moves[2].comment).toBe("#評価値=108\n");
    const customData = moves[2].customData as RecordCustomData;
    expect(customData.researchInfo?.score).toBe(108);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeTruthy();

    store.changePly(6);

    store.pasteRecord(sampleKIF2, "mergeIntoRoot");
    expect(exportKI2(store.record)).toBe(`手合割：平手
▲２六歩
*通常コメント
△８四歩
*#評価値=108
▲７六歩    △８五歩    ▲７七角    △３二金    ▲６八銀    △３四歩
▲７八金    △４二銀

変化：1手
▲１六歩    △１四歩    ▲３八銀`);

    store.pasteRecord(sampleKIF2, "mergeIntoCurrent");
    expect(exportKI2(store.record)).toBe(`手合割：平手
▲２六歩
*通常コメント
△８四歩
*#評価値=108
▲７六歩    △８五歩    ▲７七角    △３二金    ▲６八銀    △３四歩
▲７八金    △４二銀

変化：7手
▲１六歩    △１四歩    ▲３八銀

変化：1手
▲１六歩    △１四歩    ▲３八銀`);
  });

  it("pasteRecord/csa/success", () => {
    const store = createStore();
    store.pasteRecord(sampleCSA);
    const moves = store.record.moves;
    expect(moves.length).toBe(13);
    store.changePly(1);
    expect(store.record.current.comment).toBe("初手へのコメント\n* 30011 2b2a\n");
    const customData1 = store.record.current.customData as RecordCustomData;
    expect(customData1.playerSearchInfo?.score).toBe(30011);
    store.changePly(2);
    expect(store.record.current.comment).toBe("* 30010\n");
    const customData2 = store.record.current.customData as RecordCustomData;
    expect(customData2.playerSearchInfo?.score).toBe(30010);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeTruthy();
  });

  it("pasteRecord/usen/success", () => {
    const store = createStore();
    store.pasteRecord("~0.6y236e7ku4be.r");
    expect(store.record.getUSI({ allMoves: true })).toBe(
      "position startpos moves 2g2f 8c8d 7g7f 8d8e",
    );
  });

  it("pasteRecord/invalidState", () => {
    const store = createStore();
    store.showGameDialog();
    store.pasteRecord(sampleKIF);
    const moves = store.record.moves;
    expect(moves.length).toBe(1);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("openRecord/kif/success", async () => {
    mockAPI.showOpenRecordDialog.mockResolvedValue("/test/sample.kif");
    mockAPI.openRecord.mockResolvedValue(
      new Uint8Array(convert(sampleKIF, { type: "arraybuffer", to: "SJIS" })),
    );
    const store = createStore();
    store.openRecord();
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(useErrorStore().errors).toStrictEqual([]);
    expect(store.recordFilePath).toBe("/test/sample.kif");
    const moves = store.record.moves;
    expect(moves.length).toBe(11);
    expect(moves[1].comment).toBe("通常コメント\n");
    expect(moves[1].customData).toStrictEqual({});
    expect(moves[2].comment).toBe("#評価値=108\n");
    const customData = moves[2].customData as RecordCustomData;
    expect(customData.researchInfo?.score).toBe(108);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("openRecord/kif-utf8/success", async () => {
    mockAPI.showOpenRecordDialog.mockResolvedValue("/test/sample.kif");
    mockAPI.openRecord.mockResolvedValue(
      new Uint8Array(convert(sampleKIF, { type: "arraybuffer", to: "UTF8" })),
    );
    const store = createStore();
    store.openRecord();
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(useErrorStore().errors).toStrictEqual([]);
    expect(store.recordFilePath).toBe("/test/sample.kif");
    const moves = store.record.moves;
    expect(moves.length).toBe(11);
    expect(moves[1].comment).toBe("通常コメント\n");
    expect(moves[1].customData).toStrictEqual({});
    expect(moves[2].comment).toBe("#評価値=108\n");
    const customData = moves[2].customData as RecordCustomData;
    expect(customData.researchInfo?.score).toBe(108);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("openRecord/kifu/success", async () => {
    mockAPI.showOpenRecordDialog.mockResolvedValue("/test/sample.kifu");
    mockAPI.openRecord.mockResolvedValue(
      new Uint8Array(convert(sampleKIF, { type: "arraybuffer", to: "UTF8" })),
    );
    const store = createStore();
    store.openRecord();
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(useErrorStore().errors).toStrictEqual([]);
    expect(store.recordFilePath).toBe("/test/sample.kifu");
    const moves = store.record.moves;
    expect(moves.length).toBe(11);
    expect(moves[1].comment).toBe("通常コメント\n");
    expect(moves[1].customData).toStrictEqual({});
    expect(moves[2].comment).toBe("#評価値=108\n");
    const customData = moves[2].customData as RecordCustomData;
    expect(customData.researchInfo?.score).toBe(108);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("openRecord/csa/success", async () => {
    mockAPI.showOpenRecordDialog.mockResolvedValue("/test/sample.csa");
    mockAPI.openRecord.mockResolvedValue(new TextEncoder().encode(sampleCSA));
    const store = createStore();
    store.openRecord();
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(useErrorStore().errors).toStrictEqual([]);
    expect(store.recordFilePath).toBe("/test/sample.csa");
    const moves = store.record.moves;
    expect(moves.length).toBe(13);
    expect(useErrorStore().hasError).toBeFalsy();
    expect(mockAPI.showOpenRecordDialog).toBeCalledTimes(1);
    expect(mockAPI.openRecord).toBeCalledTimes(1);
    expect(mockAPI.openRecord.mock.calls[0][0]).toBe("/test/sample.csa");
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("openRecord/invalidState", () => {
    const store = createStore();
    store.showGameDialog();
    store.openRecord();
    const moves = store.record.moves;
    expect(moves.length).toBe(1);
    expect(useErrorStore().hasError).toBeTruthy();
    expect(store.recordFilePath).toBeUndefined();
  });

  it("openRecord/cancel", async () => {
    mockAPI.showOpenRecordDialog.mockResolvedValue("");
    const store = createStore();
    store.openRecord();
    expect(useBusyState().isBusy).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.recordFilePath).toBeUndefined();
    expect(useErrorStore().hasError).toBeFalsy();
  });

  it("saveRecord/success", async () => {
    mockAPI.showSaveRecordDialog.mockResolvedValue("/test/sample.csa");
    mockAPI.saveRecord.mockResolvedValue();
    const store = createStore();
    store.saveRecord();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.recordFilePath).toBe("/test/sample.csa");
    expect(useErrorStore().hasError).toBeFalsy();
    expect(mockAPI.showSaveRecordDialog).toBeCalledTimes(1);
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
    expect(mockAPI.saveRecord.mock.calls[0][0]).toBe("/test/sample.csa");
    const data = new TextDecoder().decode(mockAPI.saveRecord.mock.calls[0][1]);
    expect(data).toMatch(/^V2\.2/);
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("saveRecord/invalidState", () => {
    const store = createStore();
    store.showGameDialog();
    store.saveRecord();
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.recordFilePath).toBeUndefined();
  });

  it("saveRecord/cancel", async () => {
    mockAPI.showSaveRecordDialog.mockResolvedValue("");
    const store = createStore();
    store.saveRecord();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.recordFilePath).toBeUndefined();
    expect(useErrorStore().hasError).toBeFalsy();
    expect(mockAPI.showSaveRecordDialog).toBeCalledTimes(1);
    expect(mockAPI.saveRecord).toBeCalledTimes(0);
  });

  it("saveRecord/noOverwrite", async () => {
    mockAPI.openRecord.mockResolvedValue(
      new Uint8Array(convert(sampleKIF, { type: "arraybuffer", to: "SJIS" })),
    );
    mockAPI.showSaveRecordDialog.mockResolvedValue("/test/sample2.csa");
    mockAPI.saveRecord.mockResolvedValue();
    const store = createStore();
    store.openRecord("/test/sample1.csa");
    await new Promise((resolve) => setTimeout(resolve));
    store.saveRecord();
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.recordFilePath).toBe("/test/sample2.csa");
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeFalsy();
    expect(mockAPI.showSaveRecordDialog).toBeCalledTimes(1);
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
  });

  it("saveRecord/overwrite", async () => {
    mockAPI.openRecord.mockResolvedValue(
      new Uint8Array(convert(sampleKIF, { type: "arraybuffer", to: "SJIS" })),
    );
    mockAPI.showSaveRecordDialog.mockResolvedValue("/test/sample2.csa");
    mockAPI.saveRecord.mockResolvedValue();
    const store = createStore();
    store.openRecord("/test/sample1.csa");
    await new Promise((resolve) => setTimeout(resolve));
    store.saveRecord({ overwrite: true });
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.recordFilePath).toBe("/test/sample1.csa");
    expect(useErrorStore().hasError).toBeFalsy();
    expect(store.isRecordFileUnsaved).toBeFalsy();
    expect(mockAPI.showSaveRecordDialog).toBeCalledTimes(0);
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
  });

  it("saveRecord/specificFormat", async () => {
    mockAPI.showSaveRecordDialog.mockResolvedValue("/test/sample.jkf");
    mockAPI.saveRecord.mockResolvedValue();
    const store = createStore();
    store.saveRecord({ format: RecordFileFormat.JKF });
    await new Promise((resolve) => setTimeout(resolve));
    expect(useBusyState().isBusy).toBeFalsy();
    expect(store.recordFilePath).toBe("/test/sample.jkf");
    expect(useErrorStore().hasError).toBeFalsy();
    expect(mockAPI.showSaveRecordDialog).toBeCalledTimes(1);
    expect(mockAPI.showSaveRecordDialog.mock.calls[0][0]).toMatch(/\.jkf$/);
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
    expect(mockAPI.saveRecord.mock.calls[0][0]).toBe("/test/sample.jkf");
    const data = new TextDecoder().decode(mockAPI.saveRecord.mock.calls[0][1]);
    expect(data).toMatch(/^\{.*\}$/);
    expect(store.isRecordFileUnsaved).toBeFalsy();
  });

  it("showJishogiPoints", () => {
    const store = createStore();
    // https://denryu-sen.jp/denryusen/dr3_production/dist/#/dr3prd+t_test1_test2-600-2F+aobazero+aobazerotest+20221201210630
    store.pasteRecord(
      "2GK1+L3/2+P+S+R1G+N1/3+B1GG2/9/+r8/1+bs6/+p+p3+n3/2+n2k3/6+p2 b 2SN7P3l7p 375",
    );
    store.showJishogiPoints();
    expect(useMessageStore().message).toStrictEqual({
      text: "持将棋の点数",
      attachments: [
        {
          type: "list",
          items: [
            {
              text: "先手",
              children: [
                "Points (Total): 28",
                "Points (Declaration): 28",
                "Rule-24: DRAW",
                "Rule-27: WIN",
              ],
            },
            {
              text: "後手",
              children: [
                "Points (Total): 26",
                "Points (Declaration): 15",
                "Rule-24: LOSE",
                "Rule-27: LOSE",
              ],
            },
          ],
        },
      ],
      withCopyButton: true,
    });
  });
});
