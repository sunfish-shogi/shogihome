import {
  PieceImageType,
  BoardImageType,
  BoardLabelType,
} from "@/components/primitive/BoardLayout";

export enum Thema {
  STANDARD = "standard",
  CHERRY_BLOSSOM = "cherry-blossom",
  DARK = "dark",
}

export enum Tab {
  RECORD_INFO = "recordInfo",
  COMMENT = "comment",
  SEARCH = "search",
  PV = "pv",
  CHART = "chart",
  PERCENTAGE_CHART = "percentageChart",
  BOOK_GRAPH = "bookGraph",
  INVISIBLE = "invisible",
}

export enum ClockSoundTarget {
  ALL = "all",
  ONLY_USER = "onlyUser",
}

export type AppSetting = {
  thema: Thema;
  pieceImage: PieceImageType;
  boardImage: BoardImageType;
  boardLabelType: BoardLabelType;
  pieceVolume: number;
  clockVolume: number;
  clockPitch: number;
  clockSoundTarget: ClockSoundTarget;
  boardFlipping: boolean;
  tab: Tab;
  returnCode: string;
  autoSaveDirectory: string;
  coefficientInSigmoid: number;
  badMoveLevelThreshold1: number;
  badMoveLevelThreshold2: number;
  badMoveLevelThreshold3: number;
  badMoveLevelThreshold4: number;
  showElapsedTimeInRecordView: boolean;
  showCommentInRecordView: boolean;
  enableAppLog: boolean;
  enableUSILog: boolean;
  enableCSALog: boolean;
};

export type AppSettingUpdate = {
  thema?: Thema;
  pieceImage?: PieceImageType;
  boardImage?: BoardImageType;
  boardLabelType?: BoardLabelType;
  pieceVolume?: number;
  clockVolume?: number;
  clockPitch?: number;
  clockSoundTarget?: ClockSoundTarget;
  boardFlipping?: boolean;
  tab?: Tab;
  returnCode?: string;
  autoSaveDirectory?: string;
  coefficientInSigmoid?: number;
  badMoveLevelThreshold1?: number;
  badMoveLevelThreshold2?: number;
  badMoveLevelThreshold3?: number;
  badMoveLevelThreshold4?: number;
  showElapsedTimeInRecordView?: boolean;
  showCommentInRecordView?: boolean;
  enableAppLog?: boolean;
  enableUSILog?: boolean;
  enableCSALog?: boolean;
};

export function defaultAppSetting(opt?: {
  returnCode?: string;
  autoSaveDirectory?: string;
}): AppSetting {
  return {
    thema: Thema.STANDARD,
    pieceImage: PieceImageType.HITOMOJI,
    boardImage: BoardImageType.LIGHT,
    boardLabelType: BoardLabelType.STANDARD,
    pieceVolume: 30,
    clockVolume: 30,
    clockPitch: 500,
    clockSoundTarget: ClockSoundTarget.ONLY_USER,
    boardFlipping: false,
    tab: Tab.RECORD_INFO,
    returnCode: opt?.returnCode || "\r\n",
    autoSaveDirectory: opt?.autoSaveDirectory || "",
    coefficientInSigmoid: 600,
    badMoveLevelThreshold1: 5,
    badMoveLevelThreshold2: 10,
    badMoveLevelThreshold3: 20,
    badMoveLevelThreshold4: 50,
    showElapsedTimeInRecordView: true,
    showCommentInRecordView: true,
    enableAppLog: false,
    enableUSILog: false,
    enableCSALog: false,
  };
}

export function validateAppSetting(setting: AppSetting): Error | undefined {
  if (setting.pieceVolume < 0 || setting.pieceVolume > 100) {
    return new Error("駒音の大きさには0%～100%の値を指定してください。");
  }
  if (setting.clockVolume < 0 || setting.clockVolume > 100) {
    return new Error("時計音の大きさには0%～100%の値を指定してください。");
  }
  if (setting.clockPitch < 220 || setting.clockPitch > 880) {
    return new Error("時計音の高さには220Hz～880Hzの値を指定してください。");
  }
  if (setting.coefficientInSigmoid <= 0) {
    return new Error("勝率換算係数には0より大きい値を指定してください。");
  }
  if (
    setting.badMoveLevelThreshold1 < 1 ||
    setting.badMoveLevelThreshold1 > 100
  ) {
    return new Error("緩手には1%～100%の値を指定してください。");
  }
  if (
    setting.badMoveLevelThreshold2 < 1 ||
    setting.badMoveLevelThreshold2 > 100
  ) {
    return new Error("疑問手には1%～100%の値を指定してください。");
  }
  if (
    setting.badMoveLevelThreshold3 < 1 ||
    setting.badMoveLevelThreshold3 > 100
  ) {
    return new Error("悪手には1%～100%の閾値を指定してください。");
  }
  if (
    setting.badMoveLevelThreshold4 < 1 ||
    setting.badMoveLevelThreshold4 > 100
  ) {
    return new Error("大悪手には1%～100%の値を指定してください。");
  }
  if (setting.badMoveLevelThreshold1 >= setting.badMoveLevelThreshold2) {
    return new Error("緩手には疑問手より小さい値を指定してください。");
  }
  if (setting.badMoveLevelThreshold2 >= setting.badMoveLevelThreshold3) {
    return new Error("疑問手には悪手より小さい値を指定してください。");
  }
  if (setting.badMoveLevelThreshold3 >= setting.badMoveLevelThreshold4) {
    return new Error("悪手には大悪手より小さい値を指定してください。");
  }
}
