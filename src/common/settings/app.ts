import { Language, t } from "@/common/i18n/index.js";
import { LogLevel, LogType } from "@/common/log.js";
import { RecordFileFormat } from "@/common/file/record.js";
import { defaultRecordFileNameTemplate } from "@/common/file/path.js";
import { BoardLayoutType, PositionImageFontWeight } from "./layout.js";
import { SearchCommentFormat } from "./comment.js";
import { fileURLToCustomSchemeURL } from "@/common/url.js";

export enum Thema {
  STANDARD = "standard",
  CHERRY_BLOSSOM = "cherry-blossom",
  AUTUMN = "autumn",
  SNOW = "snow",
  DARK_GREEN = "dark-green",
  DARK = "dark",
}

export enum BackgroundImageType {
  NONE = "none",
  COVER = "cover",
  CONTAIN = "contain",
  TILE = "tile",
}

export enum PieceImageType {
  HITOMOJI = "hitomoji",
  HITOMOJI_WOOD = "hitomojiWood",
  HITOMOJI_DARK = "hitomojiDark",
  HITOMOJI_GOTHIC = "hitomojiGothic",
  HITOMOJI_GOTHIC_DARK = "hitomojiGothicDark",
  CUSTOM_IMAGE = "custom-image",
}

export enum KingPieceType {
  GYOKU_AND_OSHO = "gyokuAndOsho",
  GYOKU_AND_GYOKU = "gyokuAndGyoku",
}

export enum BoardImageType {
  LIGHT = "light",
  LIGHT2 = "light2",
  LIGHT3 = "light3",
  WARM = "warm",
  WARM2 = "warm2",
  RESIN = "resin",
  RESIN2 = "resin2",
  RESIN3 = "resin3",
  GREEN = "green",
  CHERRY_BLOSSOM = "cherry-blossom",
  AUTUMN = "autumn",
  SNOW = "snow",
  DARK_GREEN = "dark-green",
  DARK = "dark",
  CUSTOM_IMAGE = "custom-image",
}

export enum PieceStandImageType {
  STANDARD = "standard",
  DARK_WOOD = "dark-wood",
  GREEN = "green",
  CHERRY_BLOSSOM = "cherry-blossom",
  AUTUMN = "autumn",
  SNOW = "snow",
  DARK_GREEN = "dark-green",
  DARK = "dark",
  CUSTOM_IMAGE = "custom-image",
}

export enum PromotionSelectorStyle {
  HORIZONTAL = "horizontal",
  VERTICAL_PREFER_BOTTOM = "verticalPreferBottom",
  HORIZONTAL_PREFER_RIGHT = "horizontalPreferRight",
}

export enum BoardLabelType {
  NONE = "none",
  STANDARD = "standard",
}

export enum LeftSideControlType {
  NONE = "none",
  STANDARD = "standard",
}

export enum RightSideControlType {
  NONE = "none",
  STANDARD = "standard",
}

export enum TabPaneType {
  SINGLE = "single",
  DOUBLE = "double",
  DOUBLE_V2 = "doubleV2",
}

export enum Tab {
  RECORD_INFO = "recordInfo",
  COMMENT = "comment",
  SEARCH = "search",
  PV = "pv",
  CHART = "chart",
  PERCENTAGE_CHART = "percentageChart",
  MONITOR = "monitor",
  INVISIBLE = "invisible", // Deprecated
}

export enum TextDecodingRule {
  STRICT = "strict",
  AUTO_DETECT = "autoDetect",
}

export enum NodeCountFormat {
  PLAIN = "plain",
  COMMA_SEPARATED = "commaSeparated",
  COMPACT = "compact",
  JAPANESE = "japanese",
}

export enum EvaluationViewFrom {
  BLACK = "black",
  EACH = "each",
}

export enum ClockSoundTarget {
  ALL = "all",
  ONLY_USER = "onlyUser",
}

export enum RecordShortcutKeys {
  VERTICAL = "vertical",
  HORIZONTAL = "horizontal",
}

export enum PositionImageStyle {
  BOOK = "book",
  GAME = "game",
}

export enum PositionImageTypeface {
  GOTHIC = "gothic",
  MINCHO = "mincho",
}

export enum PositionImageHandLabelType {
  PLAYER_NAME = "playerName",
  SENTE_GOTE = "senteGote",
  MOCHIGOMA = "mochigoma",
  TSUME_SHOGI = "tsumeShogi",
  NONE = "none",
}

export type AppSettings = {
  // Language
  language: Language;

  // Appearance
  thema: Thema;
  backgroundImageType: BackgroundImageType;
  backgroundImageFileURL?: string;
  boardLayoutType: BoardLayoutType;
  pieceImage: PieceImageType;
  kingPieceType: KingPieceType;
  pieceImageFileURL?: string;
  croppedPieceImageBaseURL?: string;
  croppedPieceImageQuery?: string; // キャッシュ回避用のクエリ
  deletePieceImageMargin: boolean;
  boardImage: BoardImageType;
  boardImageFileURL?: string;
  boardGridColor: string | null;
  pieceStandImage: PieceStandImageType;
  promotionSelectorStyle: PromotionSelectorStyle;
  pieceStandImageFileURL?: string;
  enableTransparent: boolean;
  boardOpacity: number;
  pieceStandOpacity: number;
  recordOpacity: number;
  boardLabelType: BoardLabelType;
  leftSideControlType: LeftSideControlType;
  rightSideControlType: RightSideControlType;

  // Sound
  pieceVolume: number;
  clockVolume: number;
  clockPitch: number;
  clockSoundTarget: ClockSoundTarget;

  // Shortcut
  recordShortcutKeys: RecordShortcutKeys;

  // Board View
  boardFlipping: boolean;

  // Tab View
  tabPaneType: TabPaneType;
  tab: Tab;
  tab2: Tab;
  topPaneHeightPercentage: number;
  topPanePreviousHeightPercentage: number;
  bottomLeftPaneWidthPercentage: number;

  // Record File
  defaultRecordFileFormat: RecordFileFormat;
  textDecodingRule: TextDecodingRule;
  returnCode: string;
  autoSaveDirectory: string;
  recordFileNameTemplate: string;
  useCSAV3: boolean;
  enableUSIFileStartpos: boolean;
  enableUSIFileResign: boolean;
  showPasteDialog: boolean;
  liveDuplicatePositionDetection: boolean;

  // Opening Book
  bookOnTheFlyThresholdMB: number;
  flippedBook: boolean;

  // Engine
  translateEngineOptionName: boolean;
  engineTimeoutSeconds: number;
  nodeCountFormat: NodeCountFormat;

  // Evaluation
  evaluationViewFrom: EvaluationViewFrom;
  maxArrowsPerEngine: number;
  coefficientInSigmoid: number;
  badMoveLevelThreshold1: number;
  badMoveLevelThreshold2: number;
  badMoveLevelThreshold3: number;
  badMoveLevelThreshold4: number;
  maxPVTextLength: number;
  searchCommentFormat: SearchCommentFormat;

  // Record View
  showElapsedTimeInRecordView: boolean;
  showCommentInRecordView: boolean;

  // Logging
  enableAppLog: boolean;
  enableUSILog: boolean;
  enableCSALog: boolean;
  logLevel: LogLevel;

  // Position Image
  positionImageStyle: PositionImageStyle;
  positionImageSize: number;
  positionImageTypeface: PositionImageTypeface;
  positionImageHandLabelType: PositionImageHandLabelType;
  useBookmarkAsPositionImageHeader: boolean;
  positionImageHeader: string;
  positionImageCharacterY: number;
  positionImageFontScale: number;
  positionImageFontWeight: PositionImageFontWeight;

  // File Path
  lastRecordFilePath: string;
  lastBookFilePath: string;
  lastUSIEngineFilePath: string;
  lastImageExportFilePath: string;
  lastOtherFilePath: string;

  // Record Info View
  emptyRecordInfoVisibility: boolean;

  // Low Level
  enableHardwareAcceleration: boolean;
};

export function isLogEnabled(type: LogType, appSettings: AppSettings): boolean {
  switch (type) {
    case LogType.APP:
      return appSettings.enableAppLog;
    case LogType.USI:
      return appSettings.enableUSILog;
    case LogType.CSA:
      return appSettings.enableCSALog;
  }
}

export type AppSettingsUpdate = Partial<AppSettings>;

export function buildUpdatedAppSettings(org: AppSettings, update: AppSettingsUpdate): AppSettings {
  const updated = {
    ...org,
    ...update,
  };

  // カラム構成に合わせて選択可能なタブを制限する。
  switch (updated.tabPaneType) {
    case TabPaneType.DOUBLE:
    case TabPaneType.DOUBLE_V2:
      switch (updated.tab) {
        case Tab.COMMENT:
          updated.tab = Tab.RECORD_INFO;
          break;
        case Tab.CHART:
        case Tab.PERCENTAGE_CHART:
          updated.tab = Tab.PV;
          break;
      }
      break;
  }
  switch (updated.tabPaneType) {
    case TabPaneType.DOUBLE_V2:
      switch (updated.tab2) {
        case Tab.COMMENT:
          updated.tab2 = Tab.CHART;
          break;
      }
      break;
  }

  // 以前のサイズ比率を記憶する。
  if (org.topPaneHeightPercentage !== 0 && org.topPaneHeightPercentage !== 100) {
    updated.topPanePreviousHeightPercentage = org.topPaneHeightPercentage;
  }

  return updated;
}

export function defaultAppSettings(opt?: {
  returnCode?: string;
  autoSaveDirectory?: string;
}): AppSettings {
  return {
    language: Language.JA,
    thema: Thema.STANDARD,
    backgroundImageType: BackgroundImageType.NONE,
    boardLayoutType: BoardLayoutType.STANDARD,
    pieceImage: PieceImageType.HITOMOJI_WOOD,
    kingPieceType: KingPieceType.GYOKU_AND_OSHO,
    deletePieceImageMargin: false,
    boardImage: BoardImageType.LIGHT2,
    boardGridColor: null,
    pieceStandImage: PieceStandImageType.DARK_WOOD,
    promotionSelectorStyle: PromotionSelectorStyle.HORIZONTAL,
    enableTransparent: false,
    boardOpacity: 1.0,
    pieceStandOpacity: 1.0,
    recordOpacity: 1.0,
    boardLabelType: BoardLabelType.STANDARD,
    leftSideControlType: LeftSideControlType.STANDARD,
    rightSideControlType: RightSideControlType.STANDARD,
    pieceVolume: 30,
    clockVolume: 30,
    clockPitch: 500,
    clockSoundTarget: ClockSoundTarget.ONLY_USER,
    recordShortcutKeys: RecordShortcutKeys.VERTICAL,
    boardFlipping: false,
    tabPaneType: TabPaneType.DOUBLE_V2,
    tab: Tab.RECORD_INFO,
    tab2: Tab.CHART,
    topPaneHeightPercentage: 60,
    topPanePreviousHeightPercentage: 60,
    bottomLeftPaneWidthPercentage: 60,
    defaultRecordFileFormat: RecordFileFormat.KIF,
    textDecodingRule: TextDecodingRule.AUTO_DETECT,
    returnCode: opt?.returnCode || "\r\n",
    autoSaveDirectory: opt?.autoSaveDirectory || "",
    recordFileNameTemplate: defaultRecordFileNameTemplate,
    useCSAV3: false,
    enableUSIFileStartpos: true,
    enableUSIFileResign: false,
    showPasteDialog: true,
    liveDuplicatePositionDetection: true,
    bookOnTheFlyThresholdMB: 64,
    flippedBook: true,
    translateEngineOptionName: true,
    engineTimeoutSeconds: 10,
    nodeCountFormat: NodeCountFormat.COMMA_SEPARATED,
    evaluationViewFrom: EvaluationViewFrom.EACH,
    maxArrowsPerEngine: 3,
    coefficientInSigmoid: 600,
    badMoveLevelThreshold1: 5,
    badMoveLevelThreshold2: 10,
    badMoveLevelThreshold3: 20,
    badMoveLevelThreshold4: 50,
    maxPVTextLength: 15,
    searchCommentFormat: SearchCommentFormat.SHOGIHOME,
    showElapsedTimeInRecordView: true,
    showCommentInRecordView: true,
    enableAppLog: false,
    enableUSILog: false,
    enableCSALog: false,
    logLevel: LogLevel.INFO,
    positionImageStyle: PositionImageStyle.BOOK,
    positionImageSize: 500,
    positionImageTypeface: PositionImageTypeface.GOTHIC,
    positionImageHandLabelType: PositionImageHandLabelType.PLAYER_NAME,
    useBookmarkAsPositionImageHeader: false,
    positionImageHeader: "",
    positionImageCharacterY: 0,
    positionImageFontScale: 1,
    positionImageFontWeight: PositionImageFontWeight.W400X,
    lastRecordFilePath: "",
    lastBookFilePath: "",
    lastUSIEngineFilePath: "",
    lastImageExportFilePath: "",
    lastOtherFilePath: "",
    emptyRecordInfoVisibility: true,
    enableHardwareAcceleration: true,
  };
}

export function normalizeAppSettings(
  settings: AppSettings,
  opt?: {
    returnCode?: string;
    autoSaveDirectory?: string;
  },
): AppSettings {
  const result = {
    ...defaultAppSettings(opt),
    ...settings,
  };
  if (result.autoSaveDirectory.endsWith("\\") || result.autoSaveDirectory.endsWith("/")) {
    result.autoSaveDirectory = result.autoSaveDirectory.slice(0, -1);
  }
  // 旧バージョンでは盤画像に合わせて自動で駒台の色が選ばれていた。
  if (!settings.pieceStandImage) {
    switch (settings.boardImage) {
      default:
        result.pieceStandImage = PieceStandImageType.STANDARD;
        break;
      case BoardImageType.DARK:
        result.pieceStandImage = PieceStandImageType.DARK;
        break;
      case BoardImageType.GREEN:
        result.pieceStandImage = PieceStandImageType.GREEN;
        break;
      case BoardImageType.CHERRY_BLOSSOM:
        result.pieceStandImage = PieceStandImageType.CHERRY_BLOSSOM;
        break;
    }
  }
  // 旧バージョンではタブの最小化を Tab.INDISIBLE で表していたが廃止した。
  if (result.tab === Tab.INVISIBLE) {
    result.tab = Tab.RECORD_INFO;
  }
  // 旧バージョンと行き来すると DOUBLE_V2 のまま Tab.COMMENT が選択された状態が発生しうる。
  if (result.tabPaneType === TabPaneType.DOUBLE_V2 && result.tab2 === Tab.COMMENT) {
    result.tab2 = Tab.CHART;
  }
  // 旧バージョンではフォントの太さは設定項目になく、明朝体とゴシック体で違っていた。
  if (!settings.positionImageFontWeight) {
    switch (settings.positionImageTypeface) {
      default:
        result.positionImageFontWeight = PositionImageFontWeight.W400X;
        break;
      case PositionImageTypeface.MINCHO:
        result.positionImageFontWeight = PositionImageFontWeight.W700X;
        break;
    }
  }
  // 旧バージョンでは On-the-fly の最大値が 4096 だったが 512 に変更した。
  result.bookOnTheFlyThresholdMB = Math.min(Math.max(result.bookOnTheFlyThresholdMB, 0), 512);
  return result;
}

export function validateAppSettings(settings: AppSettings): Error | undefined {
  if (
    settings.backgroundImageType !== BackgroundImageType.NONE &&
    !settings.backgroundImageFileURL
  ) {
    return new Error(t.backgroundImageFileNotSelected);
  }
  if (settings.pieceImage === PieceImageType.CUSTOM_IMAGE && !settings.pieceImageFileURL) {
    return new Error(t.pieceImageFileNotSelected);
  }
  if (settings.boardImage === BoardImageType.CUSTOM_IMAGE && !settings.boardImageFileURL) {
    return new Error(t.boardImageFileNotSelected);
  }
  if (
    settings.pieceStandImage === PieceStandImageType.CUSTOM_IMAGE &&
    !settings.pieceStandImageFileURL
  ) {
    return new Error(t.pieceStandImageFileNotSelected);
  }
  if (settings.pieceVolume < 0 || settings.pieceVolume > 100) {
    return new Error(t.pieceSoundVolumeMustBe0To100Percent);
  }
  if (settings.clockVolume < 0 || settings.clockVolume > 100) {
    return new Error(t.clockSoundVolumeMustBe0To100Percent);
  }
  if (settings.clockPitch < 220 || settings.clockPitch > 880) {
    return new Error(t.clockSoundPitchMustBe220To880Hz);
  }
  if (settings.engineTimeoutSeconds < 1 || settings.engineTimeoutSeconds > 300) {
    return new Error(t.engineTimeoutMustBe1To300Seconds);
  }
  if (settings.coefficientInSigmoid <= 0) {
    return new Error(t.coefficientInSigmoidMustBeGreaterThan0);
  }
  if (settings.badMoveLevelThreshold1 < 1 || settings.badMoveLevelThreshold1 > 100) {
    return new Error(t.inaccuracyThresholdMustBe1To100Percent);
  }
  if (settings.badMoveLevelThreshold2 < 1 || settings.badMoveLevelThreshold2 > 100) {
    return new Error(t.dubiousThresholdMustBe1To100Percent);
  }
  if (settings.badMoveLevelThreshold3 < 1 || settings.badMoveLevelThreshold3 > 100) {
    return new Error(t.mistakeThresholdMustBe1To100Percent);
  }
  if (settings.badMoveLevelThreshold4 < 1 || settings.badMoveLevelThreshold4 > 100) {
    return new Error(t.blunderThresholdMustBe1To100Percent);
  }
  if (settings.badMoveLevelThreshold1 >= settings.badMoveLevelThreshold2) {
    return new Error(t.inaccuracyThresholdMustBeLessThanDubiousThreshold);
  }
  if (settings.badMoveLevelThreshold2 >= settings.badMoveLevelThreshold3) {
    return new Error(t.dubiousThresholdMustBeLessThanMistakeThreshold);
  }
  if (settings.badMoveLevelThreshold3 >= settings.badMoveLevelThreshold4) {
    return new Error(t.mistakeThresholdMustBeLessThanBlunderThreshold);
  }
}

export function getPieceImageURLTemplate(settings: AppSettings): string {
  switch (settings.pieceImage) {
    case PieceImageType.HITOMOJI_WOOD:
      return "./piece/hitomoji_wood/${piece}.png";
    case PieceImageType.HITOMOJI_DARK:
      return "./piece/hitomoji_dark/${piece}.png";
    case PieceImageType.HITOMOJI_GOTHIC:
      return "./piece/hitomoji_gothic/${piece}.png";
    case PieceImageType.HITOMOJI_GOTHIC_DARK:
      return "./piece/hitomoji_gothic_dark/${piece}.png";
    case PieceImageType.CUSTOM_IMAGE:
      if (settings.croppedPieceImageBaseURL) {
        const query = settings.croppedPieceImageQuery ? `?${settings.croppedPieceImageQuery}` : "";
        return (
          fileURLToCustomSchemeURL(settings.croppedPieceImageBaseURL) + "/${piece}.png" + query
        );
      }
  }
  return "./piece/hitomoji/${piece}.png";
}
