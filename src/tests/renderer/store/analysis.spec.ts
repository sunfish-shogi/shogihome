import { AnalysisManager } from "@/renderer/store/analysis.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { analysisSettings as baseAnalysisSettings } from "@/tests/mock/analysis.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { MockedClass } from "vitest";
import { CommentBehavior } from "@/common/settings/comment.js";
import { RecordCustomData } from "@/common/record/types.js";

vi.mock("@/renderer/players/usi.js");

const mockUSIPlayer = USIPlayer as MockedClass<typeof USIPlayer>;

// startResearch に渡された USI 文字列の一覧を返す。
function startResearchUSIs(): string[] {
  return mockUSIPlayer.prototype.startResearch.mock.calls.map((call) => call[1]);
}

// 実際のエンジンは startResearch に渡された USI 文字列をそのまま info.usi として
// 返すため、テストでも探索開始時にキャプチャした値をコールバックに使用する。
function lastStartResearchUSI(): string {
  const calls = mockUSIPlayer.prototype.startResearch.mock.calls;
  return calls[calls.length - 1][1];
}

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
      usi: lastStartResearchUSI(),
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    expect(mockUSIPlayer.prototype.close).not.toBeCalled();
    expect(onFinish).not.toBeCalled();
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 50,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    // 各局面で意図した USI 文字列により探索が開始されている。
    expect(startResearchUSIs()).toEqual([
      "position startpos",
      "position startpos moves 7g7f",
      "position startpos moves 7g7f 3c3d",
      "position startpos moves 7g7f 3c3d 2g2f",
      "position startpos moves 7g7f 3c3d 2g2f 8c8d",
    ]);
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

  it("ignores-search-info-of-other-position", async () => {
    // エンジン再利用時に前の局面 (前のファイル) の探索結果が遅れて届いても、
    // 現在の解析対象局面と一致しない情報は無視され、別の局面に書き込まれない。
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.stop.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
    );
    const manager = new AnalysisManager(recordManager);
    await manager.start({
      ...baseAnalysisSettings,
      startCriteria: { enableNumber: false, number: 0 },
      endCriteria: { enableNumber: false, number: 0 },
    });
    vi.runOnlyPendingTimers();
    // 初期局面 (ply 0) に対して意図した USI 文字列により探索が開始されている。
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
    expect(lastStartResearchUSI()).toBe("position startpos");
    // 初期局面 (ply 0) を解析中に、別局面 (別ファイルの最終局面など) の結果が遅れて届く。
    manager.updateSearchInfo({
      usi: "position startpos moves 2g2f 8c8d 2f2e",
      score: 9999,
      depth: 20,
    });
    // 別局面の結果は現局面 (ply 0) に書き込まれない。
    recordManager.changePly(0);
    const staleData = recordManager.record.current.customData as RecordCustomData | undefined;
    expect(staleData?.researchInfo).toBeUndefined();
    // 現局面 (ply 0) 本来の結果は探索開始時の USI 文字列とともに届き、記録される。
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 10,
      depth: 20,
    });
    recordManager.changePly(0);
    const data = recordManager.record.current.customData as RecordCustomData;
    expect(data.researchInfo?.score).toBe(10);
    manager.close();
  });

  it("ignores-search-info-after-record-replaced", async () => {
    // 降順の連続解析では前のファイルの最後の探索が初期局面になるため、次のファイルの
    // 初期局面と USI 文字列が一致し得る。棋譜が差し替わっている場合は文字列が一致しても
    // 前のファイルの結果として破棄する。
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
    );
    const manager = new AnalysisManager(recordManager, { keepEngine: true });
    await manager.start({ ...baseAnalysisSettings });
    vi.runOnlyPendingTimers();
    expect(lastStartResearchUSI()).toBe("position startpos");
    // 次のファイルを読み込み、初期局面へ移動する。USI 文字列は前のファイルと同一になる。
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d",
    );
    recordManager.changePly(0);
    expect(recordManager.record.usi).toBe("position startpos");
    // 前のファイルの結果が遅れて届いても取り込まない。
    manager.updateSearchInfo({ usi: "position startpos", score: -3000, depth: 30 });
    recordManager.changePly(0);
    const data = recordManager.record.current.customData as RecordCustomData | undefined;
    expect(data?.researchInfo).toBeUndefined();
    manager.close();
  });

  it("does-not-write-comment-from-other-position", async () => {
    // 別の局面の探索結果は評価値グラフ (customData) だけでなくコメントにも影響する。
    // コメントは棋譜ファイルに保存されるため、取り込んでしまうと上書き保存によって
    // 本来コメントを持たない初期局面に誤った評価値や着手評価が残ってしまう。
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d 2g2f",
    );
    const manager = new AnalysisManager(recordManager, { keepEngine: true });
    await manager.start({ ...baseAnalysisSettings });
    // 最初の探索開始前に、前のファイル (別局面) の結果が遅れて届く。
    const otherPositionUSI = "position startpos moves 2g2f 8c8d 2f2e 8d8e";
    manager.updateSearchInfo({ usi: otherPositionUSI, score: -3000, depth: 30 });
    vi.runOnlyPendingTimers();
    // 初期局面 (ply 0) 本来の結果が届いた後にも、前のファイルの結果が遅れて届く。
    expect(lastStartResearchUSI()).toBe("position startpos");
    manager.updateSearchInfo({ usi: lastStartResearchUSI(), score: 0, depth: 20 });
    manager.updateSearchInfo({ usi: otherPositionUSI, score: -3000, depth: 30 });
    vi.runOnlyPendingTimers();
    // 1 手目の結果が届く。
    expect(lastStartResearchUSI()).toBe("position startpos moves 7g7f");
    manager.updateSearchInfo({ usi: lastStartResearchUSI(), score: 20, depth: 20 });
    vi.runOnlyPendingTimers();
    // 初期局面にはコメントを書き込まない。
    recordManager.changePly(0);
    expect(recordManager.record.current.comment).toBe("");
    // 1 手目には自分の局面の評価値のみを書き込む (別局面の評価値による着手評価も付かない)。
    recordManager.changePly(1);
    expect(recordManager.record.current.comment).toBe(
      "互角\n#評価値=20\n#深さ=20\n#エンジン=my usi engine\n",
    );
    manager.close();
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
      usi: lastStartResearchUSI(),
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    // 開始手数から終了手数までの各局面で意図した USI 文字列により探索が開始されている。
    expect(startResearchUSIs()).toEqual([
      "position startpos moves 7g7f",
      "position startpos moves 7g7f 3c3d",
      "position startpos moves 7g7f 3c3d 2g2f",
      "position startpos moves 7g7f 3c3d 2g2f 8c8d",
    ]);
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
      usi: lastStartResearchUSI(),
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 50,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    // 降順に各局面で意図した USI 文字列により探索が開始されている。
    expect(startResearchUSIs()).toEqual([
      "position startpos moves 7g7f 3c3d 2g2f 8c8d",
      "position startpos moves 7g7f 3c3d 2g2f",
      "position startpos moves 7g7f 3c3d",
      "position startpos moves 7g7f",
      "position startpos",
    ]);
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
      usi: lastStartResearchUSI(),
      score: 10,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 20,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 30,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    manager.updateSearchInfo({
      usi: lastStartResearchUSI(),
      score: 40,
    });
    vi.runOnlyPendingTimers();
    expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
    expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onError).not.toBeCalled();
    // 降順に終了手数から開始手数までの各局面で意図した USI 文字列により探索が開始されている。
    expect(startResearchUSIs()).toEqual([
      "position startpos moves 7g7f 3c3d 2g2f 8c8d 2f2e",
      "position startpos moves 7g7f 3c3d 2g2f 8c8d",
      "position startpos moves 7g7f 3c3d 2g2f",
      "position startpos moves 7g7f 3c3d",
    ]);
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

  it("close-during-launch", async () => {
    // エンジンの起動 (launch) 完了前に close() が呼ばれても、起動したエンジンを放置しない。
    let resolveLaunch: () => void = () => {
      /* noop */
    };
    mockUSIPlayer.prototype.launch.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLaunch = resolve;
      }),
    );
    mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    const recordManager = new RecordManager();
    recordManager.importRecord(
      "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 3c3d",
    );
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new AnalysisManager(recordManager).on("finish", onFinish).on("error", onError);
    const startPromise = manager.start({ ...baseAnalysisSettings });
    // launch がまだ解決していないので this.researcher は未設定。
    expect(mockUSIPlayer).toBeCalledTimes(1);
    // 起動処理中に停止する。
    manager.close();
    // 起動を完了させる。
    resolveLaunch();
    await startPromise;
    // 起動したエンジンは確実に終了される。
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    // 解析は開始されない。
    expect(mockUSIPlayer.prototype.startResearch).not.toBeCalled();
    expect(onError).not.toBeCalled();
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
          usi: lastStartResearchUSI(),
          score: 10,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(2);
        manager.updateSearchInfo({
          usi: lastStartResearchUSI(),
          score: -10,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(3);
        manager.updateSearchInfo({
          usi: lastStartResearchUSI(),
          score: 200,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(4);
        manager.updateSearchInfo({
          usi: lastStartResearchUSI(),
          score: -200,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(5);
        manager.updateSearchInfo({
          usi: lastStartResearchUSI(),
          score: 400,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(6);
        manager.updateSearchInfo({
          usi: lastStartResearchUSI(),
          score: -1000,
        });
        vi.runOnlyPendingTimers();
        expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(6);
        expect(mockUSIPlayer.prototype.stop).not.toBeCalled();
        expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
        expect(onFinish).toBeCalledTimes(1);
        expect(onError).not.toBeCalled();
        // 各局面で意図した USI 文字列により探索が開始されている。
        expect(startResearchUSIs()).toEqual([
          "position startpos",
          "position startpos moves 7g7f",
          "position startpos moves 7g7f 3c3d",
          "position startpos moves 7g7f 3c3d 2g2f",
          "position startpos moves 7g7f 3c3d 2g2f 8c8d",
          "position startpos moves 7g7f 3c3d 2g2f 8c8d 2f2e",
        ]);
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
