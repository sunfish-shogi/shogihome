import { TimeoutChain } from "@/helpers/testing";
import api, { API } from "@/ipc/api";
import { Thema } from "@/settings/app";
import { Move } from "@/shogi";
import { Store } from "@/store";
import { RecordCustomData } from "@/store/record";
import { USIInfoSender } from "@/store/usi";
import iconv from "iconv-lite";
import * as audio from "@/audio";
import { gameSetting10m30s } from "../mock/game";
import { GameManager } from "@/store/game";
import { AppState } from "@/store/state";
import { AnalysisManager } from "@/store/analysis";
import { analysisSetting } from "../mock/analysis";
import { USIPlayer } from "@/players/usi";
import { researchSetting } from "../mock/research";

jest.mock("@/audio");
jest.mock("@/ipc/api");
jest.mock("@/store/game");
jest.mock("@/players/usi");
jest.mock("@/store/analysis");

const mockAudio = audio as jest.Mocked<typeof audio>;
const mockAPI = api as jest.Mocked<API>;
const mockGameManager = GameManager as jest.MockedClass<typeof GameManager>;
const mockUSIPlayer = USIPlayer as jest.MockedClass<typeof USIPlayer>;
const mockAnalysisManager = AnalysisManager as jest.MockedClass<
  typeof AnalysisManager
>;

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
'** 30000 2b2a
-2221OU,T0
'** -30000
+0013KE,T0
-2122OU,T0
+0012KI,T0
-2212OU,T0
+0011HI,T0
-1211OU,T0
+0021KI,T0
-1112OU,T0
+0011HI,T0
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
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("message", () => {
    const store = new Store();
    expect(store.hasMessage).toBeFalsy();
    store.enqueueMessage("first message");
    expect(store.hasMessage).toBeTruthy();
    expect(store.message).toBe("first message");
    store.enqueueMessage("second message");
    expect(store.hasMessage).toBeTruthy();
    expect(store.message).toBe("first message");
    store.dequeueMessage();
    expect(store.hasMessage).toBeTruthy();
    expect(store.message).toBe("second message");
    store.dequeueMessage();
    expect(store.hasMessage).toBeFalsy();
  });

  it("errors", () => {
    const store = new Store();
    expect(store.hasError).toBeFalsy();
    expect(store.errors).toHaveLength(0);
    store.pushError("first error");
    expect(store.hasError).toBeTruthy();
    expect(store.errors).toHaveLength(1);
    expect(store.errors[0].message).toBe("first error");
    store.pushError("second error");
    expect(store.hasError).toBeTruthy();
    expect(store.errors).toHaveLength(2);
    expect(store.errors[0].message).toBe("first error");
    expect(store.errors[1].message).toBe("second error");
    store.clearErrors();
    expect(store.hasError).toBeFalsy();
    expect(store.errors).toHaveLength(0);
  });

  it("updateAppSetting", async () => {
    mockAPI.saveAppSetting.mockResolvedValue();
    const store = new Store();
    expect(store.appSetting.thema).toBe(Thema.STANDARD);
    expect(store.appSetting.pieceVolume).toBe(30);
    expect(store.appSetting.clockVolume).toBe(30);
    await store.updateAppSetting({
      thema: Thema.DARK,
      pieceVolume: 0,
    });
    expect(store.appSetting.thema).toBe(Thema.DARK);
    expect(store.appSetting.pieceVolume).toBe(0);
    expect(store.appSetting.clockVolume).toBe(30);
    try {
      await store.updateAppSetting({
        pieceVolume: -1,
      });
      throw new Error("updateAppSetting must be rejected");
    } catch {
      expect(store.appSetting.pieceVolume).toBe(0);
    }
  });

  it("flipBoard", () => {
    const store = new Store();
    expect(store.appSetting.boardFlipping).toBeFalsy();
    store.flipBoard();
    expect(store.appSetting.boardFlipping).toBeTruthy();
    store.flipBoard();
    expect(store.appSetting.boardFlipping).toBeFalsy();
  });

  it("showConfirmation", () => {
    const store = new Store();
    const confirmation1 = {
      message: "Are you ready?",
      onOk: jest.fn(),
      onCancel: jest.fn(),
    };
    store.showConfirmation(confirmation1);
    expect(store.confirmation).toBe("Are you ready?");
    store.confirmationOk();
    expect(store.confirmation).toBeUndefined();
    expect(confirmation1.onOk.mock.calls.length).toBe(1);
    expect(confirmation1.onCancel.mock.calls.length).toBe(0);
    const confirmation2 = {
      message: "Do you really want to delete?",
      onOk: jest.fn(),
      onCancel: jest.fn(),
    };
    store.showConfirmation(confirmation2);
    expect(store.confirmation).toBe("Do you really want to delete?");
    store.confirmationCancel();
    expect(store.confirmation).toBeUndefined();
    expect(confirmation2.onOk.mock.calls.length).toBe(0);
    expect(confirmation2.onCancel.mock.calls.length).toBe(1);
  });

  it("updateUSIInfo", () => {
    const usi =
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f";
    const store = new Store();
    return new TimeoutChain()
      .next(() => {
        store.pasteRecord(usi);
        store.updateUSIInfo(1000, usi, USIInfoSender.BLACK_PLAYER, "Engine A", {
          depth: 8,
          scoreCP: 138,
        });
      })
      .next(() => {
        expect(store.usiBlackPlayerMonitor?.sfen).toBe(
          "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1"
        );
        expect(store.usiBlackPlayerMonitor?.iterates.length).toBe(1);
        expect(store.usiBlackPlayerMonitor?.iterates[0].depth).toBe(8);
        expect(store.usiBlackPlayerMonitor?.iterates[0].score).toBe(138);
        expect(store.usiWhitePlayerMonitor).toBeUndefined();
        expect(store.usiResearcherMonitor).toBeUndefined();
        const customData = new RecordCustomData(
          store.record.current.customData
        );
        expect(customData.evaluation?.blackPlayer).toBe(138);
        expect(customData.evaluation?.whitePlayer).toBeUndefined();
        expect(customData.evaluation?.researcher).toBeUndefined();
        store.updateUSIInfo(1000, usi, USIInfoSender.BLACK_PLAYER, "Engine A", {
          depth: 10,
          scoreCP: 213,
        });
        store.updateUSIInfo(1000, usi, USIInfoSender.WHITE_PLAYER, "Engine B", {
          depth: 9,
          scoreCP: -89,
        });
      }, 100)
      .next(() => {
        expect(store.usiBlackPlayerMonitor?.iterates.length).toBe(2);
        expect(store.usiBlackPlayerMonitor?.iterates[0].depth).toBe(10);
        expect(store.usiBlackPlayerMonitor?.iterates[0].score).toBe(213);
        expect(store.usiWhitePlayerMonitor?.iterates.length).toBe(1);
        expect(store.usiWhitePlayerMonitor?.iterates[0].depth).toBe(9);
        expect(store.usiWhitePlayerMonitor?.iterates[0].score).toBe(-89);
        expect(store.usiResearcherMonitor).toBeUndefined();
        const customData = new RecordCustomData(
          store.record.current.customData
        );
        expect(customData.evaluation?.blackPlayer).toBe(213);
        expect(customData.evaluation?.whitePlayer).toBe(89);
        expect(customData.evaluation?.researcher).toBeUndefined();
        store.updateUSIInfo(1000, usi, USIInfoSender.RESEARCHER, "Engine C", {
          depth: 12,
          scoreCP: 721,
        });
      }, 100)
      .next(() => {
        expect(store.usiBlackPlayerMonitor).toBeUndefined();
        expect(store.usiWhitePlayerMonitor).toBeUndefined();
        expect(store.usiResearcherMonitor?.iterates.length).toBe(1);
        expect(store.usiResearcherMonitor?.iterates[0].depth).toBe(12);
        expect(store.usiResearcherMonitor?.iterates[0].score).toBe(721);
        const customData = new RecordCustomData(
          store.record.current.customData
        );
        expect(customData.evaluation?.blackPlayer).toBe(213);
        expect(customData.evaluation?.whitePlayer).toBe(89);
        expect(customData.evaluation?.researcher).toBe(-721);
      }, 100)
      .invoke();
  });

  it("updateUSIPonderInfo", () => {
    const usi =
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f";
    const usi2 =
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d";
    const store = new Store();
    return new TimeoutChain()
      .next(() => {
        store.pasteRecord(usi);
        store.updateUSIPonderInfo(
          1000,
          usi2,
          USIInfoSender.BLACK_PLAYER,
          "Engine A",
          {
            depth: 8,
            scoreCP: 138,
          }
        );
      })
      .next(() => {
        expect(store.usiBlackPlayerMonitor?.sfen).toBe(
          "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 1"
        );
        expect(store.usiBlackPlayerMonitor?.ponderMove).toBe("△３四歩(33)");
        expect(store.usiBlackPlayerMonitor?.iterates.length).toBe(1);
        expect(store.usiBlackPlayerMonitor?.iterates[0].depth).toBe(8);
        expect(store.usiBlackPlayerMonitor?.iterates[0].score).toBe(138);
      }, 100)
      .invoke();
  });

  it("startGame/success", () => {
    mockAPI.saveGameSetting.mockResolvedValue(Promise.resolve());
    mockGameManager.prototype.startGame.mockResolvedValue(Promise.resolve());
    const store = new Store();
    store.showGameDialog();
    store.startGame(gameSetting10m30s);
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.appState).toBe(AppState.GAME);
        expect(mockAPI.saveGameSetting.mock.calls.length).toBe(1);
        expect(mockAPI.saveGameSetting.mock.calls[0][0]).toBe(
          gameSetting10m30s
        );
        expect(mockGameManager.prototype.startGame.mock.calls.length).toBe(1);
        expect(mockGameManager.prototype.startGame.mock.calls[0][0]).toBe(
          gameSetting10m30s
        );
      })
      .invoke();
  });

  it("startGame/invalidState", () => {
    const store = new Store();
    store.startGame(gameSetting10m30s);
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.appState).toBe(AppState.NORMAL);
      })
      .invoke();
  });

  it("startResearch/success", () => {
    mockAPI.saveResearchSetting.mockResolvedValue(Promise.resolve());
    mockUSIPlayer.prototype.launch.mockResolvedValue(Promise.resolve());
    mockUSIPlayer.prototype.startResearch.mockResolvedValue(Promise.resolve());
    const store = new Store();
    store.showResearchDialog();
    store.startResearch(researchSetting);
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.appState).toBe(AppState.RESEARCH);
        expect(mockAPI.saveResearchSetting.mock.calls.length).toBe(1);
        expect(mockUSIPlayer.mock.calls.length).toBe(1);
        expect(mockUSIPlayer.mock.calls[0][0]).toBe(researchSetting.usi);
        expect(mockUSIPlayer.prototype.launch.mock.calls.length).toBe(1);
        expect(mockUSIPlayer.prototype.startResearch.mock.calls.length).toBe(1);
      })
      .invoke();
  });

  it("startResearch/invalidState", () => {
    const store = new Store();
    store.startResearch(researchSetting);
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.appState).toBe(AppState.NORMAL);
      })
      .invoke();
  });

  it("startAnalysis/success", () => {
    mockAPI.saveAnalysisSetting.mockResolvedValue(Promise.resolve());
    mockAnalysisManager.prototype.start.mockResolvedValue(Promise.resolve());
    const store = new Store();
    store.showAnalysisDialog();
    store.startAnalysis(analysisSetting);
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.appState).toBe(AppState.ANALYSIS);
        expect(mockAPI.saveAnalysisSetting.mock.calls.length).toBe(1);
        expect(mockAPI.saveAnalysisSetting.mock.calls[0][0]).toBe(
          analysisSetting
        );
        expect(mockAnalysisManager.mock.calls.length).toBe(1);
        expect(mockAnalysisManager.mock.calls[0][1]).toBe(analysisSetting);
        expect(mockAnalysisManager.prototype.start.mock.calls.length).toBe(1);
      })
      .invoke();
  });

  it("startAnalysis/invalidState", () => {
    const store = new Store();
    store.startAnalysis(analysisSetting);
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.appState).toBe(AppState.NORMAL);
      })
      .invoke();
  });

  it("doMove", () => {
    mockAudio.playPieceBeat.mockReturnValue();
    const store = new Store();
    store.doMove(store.record.position.createMoveBySFEN("7g7f") as Move);
    store.doMove(store.record.position.createMoveBySFEN("3c3d") as Move);
    store.doMove(store.record.position.createMoveBySFEN("2g2f") as Move);
    expect(store.record.current.number).toBe(3);
    expect(store.record.position.sfen).toBe(
      "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 1"
    );
  });

  it("resetRecord", () => {
    mockAPI.showOpenRecordDialog.mockResolvedValueOnce("/test/sample.kif");
    mockAPI.openRecord.mockResolvedValueOnce(
      iconv.encode(sampleKIF, "Shift_JIS")
    );
    const store = new Store();
    store.openRecord();
    return new TimeoutChain()
      .next(() => {
        expect(store.record.moves.length).not.toBe(1);
        expect(store.recordFilePath).not.toBeUndefined();
        store.resetRecord();
        expect(store.confirmation).toBe(
          "現在の棋譜は削除されます。よろしいですか？"
        );
        store.confirmationOk();
        expect(store.record.moves.length).toBe(1);
        expect(store.recordFilePath).toBeUndefined();
      })
      .invoke();
  });

  it("removeRecordAfter", () => {
    const store = new Store();
    store.pasteRecord(sampleBranchKIF);
    store.changeMoveNumber(8);
    store.removeRecordAfter();
    expect(store.confirmation).toBeUndefined();
    expect(store.record.current.number).toBe(7);
    expect(store.record.moves.length).toBe(8);
    store.removeRecordAfter();
    expect(store.confirmation).toBeUndefined();
    expect(store.record.current.number).toBe(6);
    expect(store.record.moves.length).toBe(8);
    store.removeRecordAfter();
    expect(store.confirmation).toBe("6手目以降を削除します。よろしいですか？");
    store.confirmationCancel();
    expect(store.record.current.number).toBe(6);
    expect(store.record.moves.length).toBe(8);
    store.removeRecordAfter();
    expect(store.confirmation).toBe("6手目以降を削除します。よろしいですか？");
    store.confirmationOk();
    expect(store.record.current.number).toBe(5);
    expect(store.record.moves.length).toBe(6);
  });

  it("copyRecordKIF", () => {
    const writeText = jest.fn();
    jest.spyOn(global, "navigator", "get").mockReturnValueOnce({
      ...navigator,
      clipboard: {
        ...navigator.clipboard,
        writeText: writeText,
      },
    });
    const store = new Store();
    store.copyRecordKIF();
  });

  it("pasteRecord/kif/success", () => {
    const store = new Store();
    store.pasteRecord(sampleKIF);
    const moves = store.record.moves;
    expect(moves.length).toBe(11);
    expect(moves[1].comment).toBe("通常コメント");
    expect(moves[1].customData).toBeUndefined();
    expect(moves[2].comment).toBe("#評価値=108");
    const customData = new RecordCustomData(moves[2].customData);
    expect(customData.evaluation?.researcher).toBe(108);
    expect(store.hasError).toBeFalsy();
  });

  it("pasteRecord/csa/success", () => {
    const store = new Store();
    store.pasteRecord(sampleCSA);
    const moves = store.record.moves;
    expect(moves.length).toBe(13);
    store.changeMoveNumber(1);
    expect(store.record.current.comment).toBe("初手へのコメント\n* 30000 2b2a");
    const customData1 = new RecordCustomData(store.record.current.customData);
    expect(customData1.evaluation?.blackPlayer).toBe(30000);
    expect(customData1.evaluation?.whitePlayer).toBeUndefined();
    store.changeMoveNumber(2);
    expect(store.record.current.comment).toBe("* -30000");
    const customData2 = new RecordCustomData(store.record.current.customData);
    expect(customData2.evaluation?.blackPlayer).toBeUndefined();
    expect(customData2.evaluation?.whitePlayer).toBe(-30000);
    expect(store.hasError).toBeFalsy();
  });

  it("pasteRecord/invalidState", () => {
    const store = new Store();
    store.showGameDialog();
    store.pasteRecord(sampleKIF);
    const moves = store.record.moves;
    expect(moves.length).toBe(1);
    expect(store.hasError).toBeFalsy();
  });

  it("openRecord/kif/success", () => {
    mockAPI.showOpenRecordDialog.mockResolvedValueOnce("/test/sample.kif");
    mockAPI.openRecord.mockResolvedValueOnce(
      iconv.encode(sampleKIF, "Shift_JIS")
    );
    const store = new Store();
    store.openRecord();
    expect(store.isBussy).toBeTruthy();
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBe("/test/sample.kif");
        const moves = store.record.moves;
        expect(moves.length).toBe(11);
        expect(moves[1].comment).toBe("通常コメント");
        expect(moves[1].customData).toBeUndefined();
        expect(moves[2].comment).toBe("#評価値=108");
        const customData = new RecordCustomData(moves[2].customData);
        expect(customData.evaluation?.researcher).toBe(108);
        expect(store.hasError).toBeFalsy();
      })
      .invoke();
  });

  it("openRecord/csa/success", () => {
    mockAPI.showOpenRecordDialog.mockResolvedValueOnce("/test/sample.csa");
    mockAPI.openRecord.mockResolvedValueOnce(
      new TextEncoder().encode(sampleCSA)
    );
    const store = new Store();
    store.openRecord();
    expect(store.isBussy).toBeTruthy();
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBe("/test/sample.csa");
        const moves = store.record.moves;
        expect(moves.length).toBe(13);
        expect(store.hasError).toBeFalsy();
        expect(mockAPI.showOpenRecordDialog.mock.calls.length).toBe(1);
        expect(mockAPI.openRecord.mock.calls.length).toBe(1);
        expect(mockAPI.openRecord.mock.calls[0][0]).toBe("/test/sample.csa");
      })
      .invoke();
  });

  it("openRecord/invalidState", () => {
    const store = new Store();
    store.showGameDialog();
    store.openRecord();
    return new TimeoutChain()
      .next(() => {
        const moves = store.record.moves;
        expect(moves.length).toBe(1);
        expect(store.hasError).toBeFalsy();
        expect(store.recordFilePath).toBeUndefined();
      })
      .invoke();
  });

  it("openRecord/cancel", () => {
    mockAPI.showOpenRecordDialog.mockResolvedValueOnce("");
    const store = new Store();
    store.openRecord();
    expect(store.isBussy).toBeTruthy();
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBeUndefined();
        expect(store.hasError).toBeFalsy();
      })
      .invoke();
  });

  it("saveRecord/success", () => {
    mockAPI.showSaveRecordDialog.mockResolvedValueOnce(
      new Promise((resolve) => resolve("/test/sample.csa"))
    );
    mockAPI.saveRecord.mockResolvedValueOnce(Promise.resolve());
    const store = new Store();
    store.saveRecord();
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBe("/test/sample.csa");
        expect(store.hasError).toBeFalsy();
        expect(mockAPI.showSaveRecordDialog.mock.calls.length).toBe(1);
        expect(mockAPI.saveRecord.mock.calls.length).toBe(1);
        expect(mockAPI.saveRecord.mock.calls[0][0]).toBe("/test/sample.csa");
        const data = new TextDecoder().decode(
          mockAPI.saveRecord.mock.calls[0][1]
        );
        expect(data).toMatch(
          /^' CSA形式棋譜ファイル Generated by Electron Shogi\r\n/
        );
      })
      .invoke();
  });

  it("saveRecord/invalidState", () => {
    const store = new Store();
    store.showGameDialog();
    store.saveRecord();
    return new TimeoutChain()
      .next(() => {
        expect(store.hasError).toBeFalsy();
        expect(store.recordFilePath).toBeUndefined();
      })
      .invoke();
  });

  it("saveRecord/cancel", () => {
    mockAPI.showSaveRecordDialog.mockResolvedValueOnce(
      new Promise((resolve) => resolve(""))
    );
    const store = new Store();
    store.saveRecord();
    return new TimeoutChain()
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBeUndefined();
        expect(store.hasError).toBeFalsy();
        expect(mockAPI.showSaveRecordDialog.mock.calls.length).toBe(1);
        expect(mockAPI.saveRecord.mock.calls.length).toBe(0);
      })
      .invoke();
  });

  it("saveRecord/noOverwrite", () => {
    mockAPI.openRecord.mockResolvedValueOnce(
      iconv.encode(sampleKIF, "Shift_JIS")
    );
    mockAPI.showSaveRecordDialog.mockResolvedValueOnce(
      new Promise((resolve) => resolve("/test/sample2.csa"))
    );
    mockAPI.saveRecord.mockResolvedValueOnce(Promise.resolve());
    const store = new Store();
    store.openRecord("/test/sample1.csa");
    return new TimeoutChain()
      .next(() => {
        store.saveRecord();
      })
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBe("/test/sample2.csa");
        expect(store.hasError).toBeFalsy();
        expect(mockAPI.showSaveRecordDialog.mock.calls.length).toBe(1);
        expect(mockAPI.saveRecord.mock.calls.length).toBe(1);
      })
      .invoke();
  });

  it("saveRecord/overwrite", () => {
    mockAPI.openRecord.mockResolvedValueOnce(
      iconv.encode(sampleKIF, "Shift_JIS")
    );
    mockAPI.showSaveRecordDialog.mockResolvedValueOnce(
      new Promise((resolve) => resolve("/test/sample2.csa"))
    );
    mockAPI.saveRecord.mockResolvedValueOnce(Promise.resolve());
    const store = new Store();
    store.openRecord("/test/sample1.csa");
    return new TimeoutChain()
      .next(() => {
        store.saveRecord({
          overwrite: true,
        });
      })
      .next(() => {
        expect(store.isBussy).toBeFalsy();
        expect(store.recordFilePath).toBe("/test/sample1.csa");
        expect(store.hasError).toBeFalsy();
        expect(mockAPI.showSaveRecordDialog.mock.calls.length).toBe(0);
        expect(mockAPI.saveRecord.mock.calls.length).toBe(1);
      })
      .invoke();
  });
});
