import {
  normalizeAppSettings,
  getPieceImageURLTemplate,
  defaultAppSettings,
  AppSettings,
  PieceImageType,
  PositionImageHeaderType,
} from "@/common/settings/app.js";

describe("settings/app", () => {
  it("normalize", () => {
    const result = normalizeAppSettings(defaultAppSettings(), {
      returnCode: "\r\n",
      autoSaveDirectory: "/tmp",
    });
    expect(result).toStrictEqual(defaultAppSettings());
  });

  it("normalize/positionImageHeaderType", () => {
    // 旧バージョンの設定では見出しの形式を持たない。
    const legacy = (props: Partial<AppSettings>) => {
      const settings = { ...defaultAppSettings(), ...props };
      delete (settings as Partial<AppSettings>).positionImageHeaderType;
      return normalizeAppSettings(settings).positionImageHeaderType;
    };
    expect(legacy({})).toBe(PositionImageHeaderType.PLY_AND_LAST_MOVE);
    expect(legacy({ useBookmarkAsPositionImageHeader: true })).toBe(
      PositionImageHeaderType.BOOKMARK,
    );
    expect(legacy({ positionImageHeader: "第1図" })).toBe(PositionImageHeaderType.CUSTOM);
    // 新バージョンの設定はそのまま維持する。
    expect(
      normalizeAppSettings({
        ...defaultAppSettings(),
        useBookmarkAsPositionImageHeader: true,
        positionImageHeaderType: PositionImageHeaderType.BRACKETED_LAST_MOVE,
      }).positionImageHeaderType,
    ).toBe(PositionImageHeaderType.BRACKETED_LAST_MOVE);
  });

  it("pieceImageBaseURL", () => {
    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.HITOMOJI,
      }),
    ).toBe("./piece/hitomoji/${piece}.png");

    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.HITOMOJI_GOTHIC,
      }),
    ).toBe("./piece/hitomoji_gothic/${piece}.png");

    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.HITOMOJI_DARK,
      }),
    ).toBe("./piece/hitomoji_dark/${piece}.png");

    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.HITOMOJI_GOTHIC_DARK,
      }),
    ).toBe("./piece/hitomoji_gothic_dark/${piece}.png");

    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.FUTAMOJI,
      }),
    ).toBe("./piece/futamoji/${piece}.png");

    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.CUSTOM_IMAGE,
        pieceImageFileURL: "/home/user/pictures/piece.png",
        croppedPieceImageBaseURL: "file:///home/user/.cache/piece",
      }),
    ).toBe("user-file://localhost/home/user/.cache/piece/${piece}.png");

    expect(
      getPieceImageURLTemplate({
        ...defaultAppSettings(),
        pieceImage: PieceImageType.CUSTOM_IMAGE,
        pieceImageFileURL: "/home/user/pictures/piece.png",
        croppedPieceImageBaseURL: "file:///home/user/.cache/piece",
        croppedPieceImageQuery: "updated=12345",
      }),
    ).toBe("user-file://localhost/home/user/.cache/piece/${piece}.png?updated=12345");
  });
});
