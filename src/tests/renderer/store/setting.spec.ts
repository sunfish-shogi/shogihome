import api, { API } from "@/renderer/ipc/api.js";
import { PieceImageType, Tab, TabPaneType, Thema } from "@/common/settings/app.js";
import { createAppSettings } from "@/renderer/store/settings.js";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

describe("store/index", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("updateAppSettings/success", async () => {
    mockAPI.saveAppSettings.mockResolvedValue();
    const store = createAppSettings();
    expect(store.thema).toBe(Thema.STANDARD);
    expect(store.pieceVolume).toBe(30);
    expect(store.clockVolume).toBe(30);
    expect(store.tab).toBe(Tab.RECORD_INFO);
    await store.updateAppSettings({
      thema: Thema.DARK,
      pieceVolume: 0,
      tabPaneType: TabPaneType.SINGLE,
      tab: Tab.COMMENT,
    });
    expect(store.thema).toBe(Thema.DARK);
    expect(store.pieceVolume).toBe(0);
    expect(store.clockVolume).toBe(30);
    expect(store.tab).toBe(Tab.COMMENT);
    expect(store.tabPaneType).toBe(TabPaneType.SINGLE);
    await store.updateAppSettings({
      tabPaneType: TabPaneType.DOUBLE,
    });
    expect(store.tab).toBe(Tab.RECORD_INFO); // コメントタブの選択が自動で解除される。
    expect(store.tabPaneType).toBe(TabPaneType.DOUBLE);
    expect(mockAPI.saveAppSettings).toBeCalledTimes(2);
  });

  it("updateAppSettings/error", async () => {
    const store = createAppSettings();
    await expect(() =>
      store.updateAppSettings({
        pieceVolume: -1,
      }),
    ).rejects.toThrow();
    expect(store.pieceVolume).toBe(30);
  });

  it("setTemporaryUpdate", async () => {
    mockAPI.cropPieceImage.mockResolvedValue("file:///cropped");

    const store = createAppSettings();
    expect(store.thema).toBe(Thema.STANDARD);
    expect(store.pieceImage).toBe(PieceImageType.HITOMOJI_WOOD);

    const ret = store.setTemporaryUpdate({
      thema: Thema.DARK,
    });
    expect(ret).toBeUndefined();
    expect(store.thema).toBe(Thema.DARK);
    expect(mockAPI.cropPieceImage).not.toBeCalled();

    const ret2 = store.setTemporaryUpdate({
      pieceImage: PieceImageType.CUSTOM_IMAGE,
      pieceImageFileURL: "file:///test",
    });
    expect(ret2).toBeInstanceOf(Promise);
    await ret2;
    expect(store.pieceImage).toBe(PieceImageType.CUSTOM_IMAGE);
    expect(store.pieceImageFileURL).toBe("file:///test");
    expect(store.croppedPieceImageBaseURL).toBe("file:///cropped");
    expect(mockAPI.cropPieceImage).toBeCalledWith("file:///test", false);

    store.clearTemporaryUpdate();
    expect(store.pieceImage).toBe(PieceImageType.HITOMOJI_WOOD);
    expect(store.pieceImageFileURL).toBeUndefined();
    expect(store.croppedPieceImageBaseURL).toBeUndefined();
  });

  it("flipBoard", () => {
    const store = createAppSettings();
    expect(store.boardFlipping).toBeFalsy();
    store.flipBoard();
    expect(store.boardFlipping).toBeTruthy();
    store.flipBoard();
    expect(store.boardFlipping).toBeFalsy();
  });
});
