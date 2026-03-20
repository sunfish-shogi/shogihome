export const SbkMoveEvaluation = {
  None: 0,
  Forced: 1,
  Good: 2,
  Bad: 3,
  Blunder: 4,
} as const;
export type SbkMoveEvaluation = number;

export type BookFormatYane2016 = "yane2016";
export type BookFormatApery = "apery";
export type BookFormatSbk = "sbk";
export type BookFormat = BookFormatYane2016 | BookFormatApery | BookFormatSbk;

export type BookMove = {
  usi: string; // 定跡手
  usi2?: string; // 相手の応手
  score?: number; // 評価値
  depth?: number; // 探索深さ
  count?: number; // 出現回数
  comment: string; // コメント
  evaluation?: SbkMoveEvaluation; // 指し手の評価 (SBK)
};

export type BookLoadingOptions = {
  onTheFlyThresholdMB?: number; // On-the-fly に切り替える閾値(MebiBytes)
  forceOnTheFly?: boolean; // 強制的に On-the-fly モードにする
};

export type BookImportSummary = {
  successFileCount: number; // 正常に読み込んだファイルの数
  errorFileCount: number; // 読み込みエラーが発生したファイルの数
  skippedFileCount: number; // 読み込みをスキップしたファイルの数
  entryCount?: number; // 新規に登録された定跡手の数
  duplicateCount?: number; // 重複した定跡手の数
};

export type BookMoveEx = BookMove & {
  repetition?: number; // 千日手
};

export const defaultBookSession = 1;
