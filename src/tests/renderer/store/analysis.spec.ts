import { AnalysisManager } from "@/renderer/store/analysis.js";
import { RecordManager } from "@/renderer/store/record.js";
import { analysisSettings as baseAnalysisSettings } from "@/tests/mock/analysis.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { MockedClass } from "vitest";
import { CommentBehavior } from "@/common/settings/comment.js";

vi.mock("@/renderer/players/usi.js");

const mockUSIPlayer = USIPlayer as MockedClass<typeof USIPlayer>;

describe("store/analysis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("open-end", async () => {
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.stop.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d resign",
    );
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new AnalysisManager(recordManager).on("finish", onFinish).on("error", onError);
    await manager.start({
      ...baseAnalysisSettings,
      startCriteria: {
        enableNumber: false,
        number: 0,
      },
      endCriteria: {
        enableNumber: false,
        number: 0,
      },
    });
    expect(mockUSIPlayer).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.launch).toBeCalled();
    expect(mockUSIPlayer.prototype.startResearch).not.toBeCalled();
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f",
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f",
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    expect(mockUSIPlayer.prototype.close).not.toBeCalled();
    expect(onFinish).not.toBeCalled();
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d",
      score: 50,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    recordManager.changePly(0);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(1);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=20\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(2);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=30\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(3);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=40\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(4);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=50\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(5);
    expect(recordManager.record.current.comment).toBe("");
  });

  it("with-limits", async () => {
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.stop.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d 2f2d 8d8e",
    );
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new AnalysisManager(recordManager).on("finish", onFinish).on("error", onError);
    await manager.start({
      ...baseAnalysisSettings,
      startCriteria: {
        enableNumber: true,
        number: 2,
      },
      endCriteria: {
        enableNumber: true,
        number: 4,
      },
    });
    expect(mockUSIPlayer).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.launch).toBeCalled();
    expect(mockUSIPlayer.prototype.startResearch).not.toBeCalled();
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f",
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f",
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d",
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    recordManager.changePly(1);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(2);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=20\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(3);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=30\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(4);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=40\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(5);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(6);
    expect(recordManager.record.current.comment).toBe("");
  });

  it("descending-open-end", async () => {
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.stop.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d resign",
    );
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new AnalysisManager(recordManager).on("finish", onFinish).on("error", onError);
    await manager.start({
      ...baseAnalysisSettings,
      startCriteria: {
        enableNumber: false,
        number: 0,
      },
      endCriteria: {
        enableNumber: false,
        number: 0,
      },
      descending: true,
    });
    expect(mockUSIPlayer).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.launch).toBeCalled();
    expect(mockUSIPlayer.prototype.startResearch).not.toBeCalled();
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d",
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f",
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f",
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      score: 50,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    recordManager.changePly(0);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(1);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=40\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(2);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=30\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(3);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=20\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(4);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=10\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(5);
    expect(recordManager.record.current.comment).toBe("");
  });

  it("descending-with-limits", async () => {
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.stop.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d 2f2e 8d8e",
    );
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new AnalysisManager(recordManager).on("finish", onFinish).on("error", onError);
    await manager.start({
      ...baseAnalysisSettings,
      startCriteria: {
        enableNumber: true,
        number: 3,
      },
      endCriteria: {
        enableNumber: true,
        number: 5,
      },
      descending: true,
    });
    expect(mockUSIPlayer).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.launch).toBeCalled();
    expect(mockUSIPlayer.prototype.startResearch).not.toBeCalled();
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d 2f2e",
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d",
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f",
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    recordManager.changePly(0);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(1);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(2);
    expect(recordManager.record.current.comment).toBe("");
    recordManager.changePly(3);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=30\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(4);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=20\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(5);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=10\n#エンジン=my usi engine\n",
    );
    recordManager.changePly(6);
    expect(recordManager.record.current.comment).toBe("");
  });

  describe("comment-behavior", () => {
    const testCases = [
      {
        commentBehavior: CommentBehavior.APPEND,
        expectedComments: [
          "初手\n互角\n#評価値=-10\n#エンジン=my usi engine\n",
          "2手目\n【緩手】\n先手有望\n#評価値=200\n#エンジン=my usi engine\n",
          "【疑問手】\n後手有望\n#評価値=-200\n#エンジン=my usi engine\n",
          "【悪手】\n先手有利\n#評価値=400\n#エンジン=my usi engine\n",
          "【大悪手】\n後手優勢\n#評価値=-1000\n#エンジン=my usi engine\n",
        ],
      },
      {
        commentBehavior: CommentBehavior.INSERT,
        expectedComments: [
          "互角\n#評価値=-10\n#エンジン=my usi engine\n\n初手",
          "【緩手】\n先手有望\n#評価値=200\n#エンジン=my usi engine\n\n2手目",
          "【疑問手】\n後手有望\n#評価値=-200\n#エンジン=my usi engine\n",
          "【悪手】\n先手有利\n#評価値=400\n#エンジン=my usi engine\n",
          "【大悪手】\n後手優勢\n#評価値=-1000\n#エンジン=my usi engine\n",
        ],
      },
      {
        commentBehavior: CommentBehavior.OVERWRITE,
        expectedComments: [
          "互角\n#評価値=-10\n#エンジン=my usi engine\n",
          "【緩手】\n先手有望\n#評価値=200\n#エンジン=my usi engine\n",
          "【疑問手】\n後手有望\n#評価値=-200\n#エンジン=my usi engine\n",
          "【悪手】\n先手有利\n#評価値=400\n#エンジン=my usi engine\n",
          "【大悪手】\n後手優勢\n#評価値=-1000\n#エンジン=my usi engine\n",
        ],
      },
      {
        commentBehavior: CommentBehavior.NONE,
        expectedComments: ["初手", "2手目", "", "", ""],
      },
    ];
    for (const testCase of testCases) {
      it(`${testCase.commentBehavior}`, async () => {
        mockUSIPlayer.prototype.launch.mockResolvedValue();
        mockUSIPlayer.prototype.startResearch.mockResolvedValue();
        mockUSIPlayer.prototype.stop.mockResolvedValue();
        mockUSIPlayer.prototype.close.mockResolvedValue();
        const recordManager = new RecordManager();
        recordManager.importRecord(
          "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d 2f2e",
        );
        recordManager.changePly(1);
        recordManager.updateComment("初手");
        recordManager.changePly(2);
        recordManager.updateComment("2手目");
        const onFinish = vi.fn();
        const onError = vi.fn();
        const manager = new AnalysisManager(recordManager)
          .on("finish", onFinish)
          .on("error", onError);
        await manager.start({
          ...baseAnalysisSettings,
          commentBehavior: testCase.commentBehavior,
        });
        expect(mockUSIPlayer).toBeCalledTimes(1);
        expect(mockUSIPlayer.prototype.launch).toBeCalled();
        expect(mockUSIPlayer.prototype.startResearch).not.toBeCalled();
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
        manager.updateSearchInfo({
          usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
          score: 10,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
        manager.updateSearchInfo({
          usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f",
          score: -10,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
        manager.updateSearchInfo({
          usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
          score: 200,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
        manager.updateSearchInfo({
          usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f",
          score: -200,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
        manager.updateSearchInfo({
          usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d",
          score: 400,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(6);
        manager.updateSearchInfo({
          usi: "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f 8c8d 2f2e",
          score: -1000,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(6);
        expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
        expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
        expect(onFinish).toBeCalledTimes(1);
        expect(onError).not.toBeCalled();
        recordManager.changePly(0);
        expect(recordManager.record.current.comment).toBe("");
        for (let i = 0; i < testCase.expectedComments.length; i++) {
          recordManager.changePly(i + 1);
          expect(recordManager.record.current.comment).toBe(testCase.expectedComments[i]);
        }
      });
    }
  });
});
