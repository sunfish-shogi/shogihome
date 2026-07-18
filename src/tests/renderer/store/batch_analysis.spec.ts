import api, { API } from "@/renderer/ipc/api.js";
import { BatchAnalysisManager, hasAnalysisResult } from "@/renderer/store/batch_analysis.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { Mocked, MockedClass } from "vitest";
import { analysisSettings } from "@/tests/mock/analysis.js";
import { BatchAnalysisSettings } from "@/common/settings/batch_analysis.js";
import { RecordFileFormat } from "@/common/file/record.js";

vi.mock("@/renderer/ipc/api.js");
vi.mock("@/renderer/players/usi.js");

const mockAPI = api as Mocked<API>;
const mockUSIPlayer = USIPlayer as MockedClass<typeof USIPlayer>;

const sampleKIFU = `手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
   2 ８四歩(83)   ( 0:00/00:00:00)
   3 ７六歩(77)   ( 0:00/00:00:00)
`;

const analyzedKIFU = `手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
*#評価値=108
   2 ８四歩(83)   ( 0:00/00:00:00)
   3 ７六歩(77)   ( 0:00/00:00:00)
`;

const batchAnalysisSettings: BatchAnalysisSettings = {
  source: "/path/to/records",
  sourceFormats: [RecordFileFormat.KIF, RecordFileFormat.KIFU],
  subdirectories: true,
  skipAnalyzed: false,
};

function setupUSIPlayerMock() {
  mockUSIPlayer.prototype.launch.mockResolvedValue();
  mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
  mockUSIPlayer.prototype.startResearch.mockResolvedValue();
  mockUSIPlayer.prototype.close.mockResolvedValue();
}

describe("store/batch_analysis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("hasAnalysisResult", () => {
    const recordManager = new RecordManager();
    recordManager.importRecord(sampleKIFU);
    expect(hasAnalysisResult(recordManager.record)).toBeFalsy();
    recordManager.importRecord(analyzedKIFU);
    expect(hasAnalysisResult(recordManager.record)).toBeTruthy();
  });

  it("analyze-multiple-files", async () => {
    setupUSIPlayerMock();
    mockAPI.listRecordFiles.mockResolvedValue([
      "/path/to/records/a.kifu",
      "/path/to/records/b.kifu",
    ]);
    mockAPI.openRecord.mockImplementation(async () => new TextEncoder().encode(sampleKIFU));
    mockAPI.saveRecord.mockResolvedValue();
    const recordManager = new RecordManager();
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new BatchAnalysisManager(recordManager)
      .on("finish", onFinish)
      .on("error", onError);
    await manager.start(batchAnalysisSettings, analysisSettings);
    await vi.runAllTimersAsync();
    expect(onError).not.toBeCalled();
    expect(onFinish).toBeCalledTimes(1);
    expect(onFinish).toBeCalledWith({ successTotal: 2, failedTotal: 0, skippedTotal: 0 });
    // エンジンは 1 回だけ起動し、ファイルごとに usinewgame を送って再利用する。
    expect(mockUSIPlayer).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.launch).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.readyNewGame).toBeCalledTimes(2);
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    expect(mockAPI.saveRecord).toBeCalledTimes(2);
    expect(mockAPI.saveRecord.mock.calls[0][0]).toBe("/path/to/records/a.kifu");
    expect(mockAPI.saveRecord.mock.calls[1][0]).toBe("/path/to/records/b.kifu");
  });

  it("skip-analyzed-records", async () => {
    setupUSIPlayerMock();
    mockAPI.listRecordFiles.mockResolvedValue([
      "/path/to/records/analyzed.kifu",
      "/path/to/records/raw.kifu",
    ]);
    mockAPI.openRecord.mockImplementation(async (path: string) =>
      new TextEncoder().encode(path.includes("analyzed") ? analyzedKIFU : sampleKIFU),
    );
    mockAPI.saveRecord.mockResolvedValue();
    const recordManager = new RecordManager();
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new BatchAnalysisManager(recordManager)
      .on("finish", onFinish)
      .on("error", onError);
    await manager.start({ ...batchAnalysisSettings, skipAnalyzed: true }, analysisSettings);
    await vi.runAllTimersAsync();
    expect(onError).not.toBeCalled();
    expect(onFinish).toBeCalledTimes(1);
    expect(onFinish).toBeCalledWith({ successTotal: 1, failedTotal: 0, skippedTotal: 1 });
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
    expect(mockAPI.saveRecord.mock.calls[0][0]).toBe("/path/to/records/raw.kifu");
  });

  it("continue-on-broken-file", async () => {
    setupUSIPlayerMock();
    mockAPI.listRecordFiles.mockResolvedValue([
      "/path/to/records/broken.kifu",
      "/path/to/records/b.kifu",
    ]);
    mockAPI.openRecord.mockImplementation(async (path: string) => {
      if (path.includes("broken")) {
        throw new Error("file not found");
      }
      return new TextEncoder().encode(sampleKIFU);
    });
    mockAPI.saveRecord.mockResolvedValue();
    const recordManager = new RecordManager();
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new BatchAnalysisManager(recordManager)
      .on("finish", onFinish)
      .on("error", onError);
    await manager.start(batchAnalysisSettings, analysisSettings);
    await vi.runAllTimersAsync();
    expect(onError).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    expect(onFinish).toBeCalledWith({ successTotal: 1, failedTotal: 1, skippedTotal: 0 });
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
    expect(mockAPI.saveRecord.mock.calls[0][0]).toBe("/path/to/records/b.kifu");
  });

  it("no-files", async () => {
    setupUSIPlayerMock();
    mockAPI.listRecordFiles.mockResolvedValue([]);
    const recordManager = new RecordManager();
    const manager = new BatchAnalysisManager(recordManager);
    await expect(manager.start(batchAnalysisSettings, analysisSettings)).rejects.toThrow();
  });

  it("abort-on-engine-error", async () => {
    // startResearch() が非同期で失敗した場合、復旧が見込めないためバッチ全体を中断する。
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockRejectedValue(new Error("engine crashed"));
    mockUSIPlayer.prototype.close.mockResolvedValue();
    mockAPI.listRecordFiles.mockResolvedValue([
      "/path/to/records/a.kifu",
      "/path/to/records/b.kifu",
    ]);
    mockAPI.openRecord.mockImplementation(async () => new TextEncoder().encode(sampleKIFU));
    mockAPI.saveRecord.mockResolvedValue();
    const recordManager = new RecordManager();
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new BatchAnalysisManager(recordManager)
      .on("finish", onFinish)
      .on("error", onError);
    await manager.start(batchAnalysisSettings, analysisSettings);
    await vi.runAllTimersAsync();
    // エンジンエラーが通知され、バッチは中断される。
    expect(onError).toBeCalledTimes(1);
    expect(onFinish).toBeCalledTimes(1);
    // 2 ファイル目には進まず、保存も行われない。
    expect(mockAPI.saveRecord).not.toBeCalled();
    expect(mockAPI.openRecord).toBeCalledTimes(1);
    expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
  });

  it("stop-during-save", async () => {
    // 直前ファイルの保存中に stop() が呼ばれても、保存完了を待ってから結果を報告する。
    setupUSIPlayerMock();
    mockAPI.listRecordFiles.mockResolvedValue(["/path/to/records/a.kifu"]);
    mockAPI.openRecord.mockImplementation(async () => new TextEncoder().encode(sampleKIFU));
    let resolveSave: () => void = () => {
      /* noop */
    };
    mockAPI.saveRecord.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const recordManager = new RecordManager();
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new BatchAnalysisManager(recordManager)
      .on("finish", onFinish)
      .on("error", onError);
    await manager.start(batchAnalysisSettings, analysisSettings);
    // 解析が終わり保存が開始される (saveRecord は保留中) 状態まで進める。
    await vi.runAllTimersAsync();
    expect(mockAPI.saveRecord).toBeCalledTimes(1);
    expect(onFinish).not.toBeCalled();
    // 保存中に停止する。保存完了までは終了報告しない。
    manager.stop();
    expect(onFinish).not.toBeCalled();
    // 保存を完了させる。
    resolveSave();
    await vi.runAllTimersAsync();
    // 保存完了後に、保存された分を反映した結果が報告される。
    expect(onError).not.toBeCalled();
    expect(onFinish).toBeCalledTimes(1);
    expect(onFinish).toBeCalledWith({ successTotal: 1, failedTotal: 0, skippedTotal: 0 });
  });

  it("stop", async () => {
    setupUSIPlayerMock();
    mockAPI.listRecordFiles.mockResolvedValue([
      "/path/to/records/a.kifu",
      "/path/to/records/b.kifu",
    ]);
    mockAPI.openRecord.mockImplementation(async () => new TextEncoder().encode(sampleKIFU));
    mockAPI.saveRecord.mockResolvedValue();
    const recordManager = new RecordManager();
    const onFinish = vi.fn();
    const onError = vi.fn();
    const manager = new BatchAnalysisManager(recordManager)
      .on("finish", onFinish)
      .on("error", onError);
    await manager.start(batchAnalysisSettings, analysisSettings);
    // 最初のファイルの解析が終わる前に中断する。
    manager.stop();
    await vi.runAllTimersAsync();
    expect(onFinish).toBeCalledTimes(1);
    expect(onFinish).toBeCalledWith({ successTotal: 0, failedTotal: 0, skippedTotal: 0 });
    expect(mockAPI.saveRecord).not.toBeCalled();
  });
});
