import { effect } from "vue";
import { createStore } from "@/renderer/store/index.js";
import api, { API } from "@/renderer/ipc/api.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { Mocked, MockedClass } from "vitest";
import { analysisSettings } from "@/tests/mock/analysis.js";
import { RecordFileFormat } from "@/common/file/record.js";

vi.mock("@/renderer/ipc/api.js");
vi.mock("@/renderer/players/usi.js");

const mockAPI = api as Mocked<API>;
const mockUSIPlayer = USIPlayer as MockedClass<typeof USIPlayer>;

// 1 ファイル目は初手 2六歩、2 ファイル目は初手 7六歩。SFEN で判別できる。
const kifFile1 = `手合割：平手
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
`;
const kifFile2 = `手合割：平手
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:00/00:00:00)
`;
// 各ファイルの初手を指した後の局面 SFEN の盤面パターン (7 段目 = 先手の歩の並び)。
// 初期局面 (平手) は両ファイル共通なので、指し手後の盤面で判別する。
const FILE1_MARK = "PPPPPPP1P"; // 2六歩: 2 筋 (右から 2 番目) が空く
const FILE2_MARK = "PP1PPPPPP"; // 7六歩: 7 筋 (左から 3 番目) が空く

describe("store/batch_analysis reactivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // 連続解析で 2 ファイル目以降に移った際、store.record が Vue のリアクティブ更新として
  // 購読側に伝わることを検証する (盤・棋譜表示の同期)。
  it("propagates record changes of the 2nd+ file to reactive subscribers", async () => {
    mockUSIPlayer.prototype.launch.mockResolvedValue();
    mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
    mockUSIPlayer.prototype.startResearch.mockResolvedValue();
    mockUSIPlayer.prototype.close.mockResolvedValue();
    mockAPI.saveAnalysisSettings.mockResolvedValue();
    mockAPI.saveBatchAnalysisSettings.mockResolvedValue();
    mockAPI.listRecordFiles.mockResolvedValue(["/records/file1.kif", "/records/file2.kif"]);
    mockAPI.openRecord.mockImplementation(async (path: string) =>
      new TextEncoder().encode(path.includes("file1") ? kifFile1 : kifFile2),
    );
    mockAPI.saveRecord.mockResolvedValue();

    const store = createStore();
    // Vue コンポーネントの描画に相当する effect で store.record を購読する。
    const seenSfens: string[] = [];
    effect(() => {
      seenSfens.push(store.record.position.sfen);
    });

    store.showAnalysisDialog("batch");
    store.startBatchAnalysis(
      {
        source: "/records",
        sourceFormats: [RecordFileFormat.KIF],
        subdirectories: false,
        skipAnalyzed: false,
      },
      analysisSettings,
    );
    await vi.runAllTimersAsync();

    // 1 ファイル目 (2六歩) の局面は購読側に届く。
    expect(seenSfens.some((sfen) => sfen.includes(FILE1_MARK))).toBe(true);
    // 2 ファイル目 (7六歩) の局面も届く = リアクティブに同期している。
    expect(seenSfens.some((sfen) => sfen.includes(FILE2_MARK))).toBe(true);
  });
});
