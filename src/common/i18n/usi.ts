import { Language } from "./languages.js";

type USIOptionNameMap = { [key: string]: string };

const ja: USIOptionNameMap = {
  USI_Ponder: "相手番思考",
  Ponder: "相手番思考",
  USI_Hash: "ハッシュ",
  Hash: "ハッシュ",
  Clear_Hash: "ハッシュクリア",
  Threads: "スレッド",
  NumberOfThreads: "スレッド数",
  thread_num_per_gpu: "GPUあたりのスレッド数",
  ThreadIdOffset: "スレッドIDオフセット",
  MultiPV: "マルチPV(候補手の表示件数)",
  BookFile: "定跡ファイル",
  Book_File: "定跡ファイル",
  Book_Enable: "定跡あり",
  BookEvalDiff: "定跡の評価値差",
  book_file_name: "定跡ファイル名",
  use_book: "定跡を使用",
  BookPvMoves: "定跡PV手数",
  TinyBook: "小さい定跡",
  BookMoves: "定跡利用手数",
  BookMaxPly: "定跡最大手数",
  BookIgnoreRate: "定跡不使用率",
  RandomBookSelect: "ランダム定跡選択",
  IgnoreBookPly: "定跡の手数を無視",
  DepthLimit: "最大深さ",
  NarrowBook: "定跡手を限定",
  WriteDebugLog: "デバッグログ出力",
  Write_Debug_Log: "デバッグログ出力",
  ResignValue: "投了基準値",
  ResignScore: "投了基準値",
  PvInterval: "PV出力間隔",
  NodesLimit: "最大ノード数",
  USI_OwnBook: "定跡を使用",
  OwnBook: "定跡を使用",
  EvalDir: "評価関数のフォルダ",
  Eval_Dir: "評価関数のフォルダ",
  EvalFile: "評価関数ファイル",
  EvalHash: "評価値ハッシュ",
  Eval_Hash: "評価値ハッシュ",
  EvalSaveDir: "評価関数保存フォルダ",
  EvalShare: "評価値共有",
  BookDir: "定跡ファイルのフォルダ",
  Stochastic_Ponder: "確率的相手番思考",
  MinimumThinkingTime: "最小思考時間",
  Minimum_Thinking_Time: "最小思考時間",
  MinThinkingTime: "最小思考時間",
  MaxMovesToDraw: "強制引き分け手数",
  SlowMover: "長考",
  Slow_Mover: "長考",
  OutputFailLHPV: "Fail Low/Highを出力",
  NetworkDelay: "通信遅延",
  NetworkDelay2: "通信遅延2",
  FV_SCALE: "評価値スケール",
  UseBook: "定跡を使用",
  MaxDepth: "最大深さ",
  MarginMs: "マージン（ミリ秒）",
  Time_Margin: "時間マージン",
  ByoyomiMargin: "秒読みマージン",
  Byoyomi_Margin: "秒読みマージン",
  byoyomi_margin: "秒読みマージン",
  Move_Overhead: "着手オーバーヘッド",
  FischerMargin: "フィッシャーマージン",
  SuddenDeathMargin: "切れ負けマージン",
  Snappy: "素早く指す",
  EnteringKingRule: "入玉ルール",
  Do_YoTsume_Search: "余詰めを探索",
  gpu_num: "GPU数",
  ConsiderationMode: "検討モード",
  ConsiderBookMoveCount: "定跡出現率を使用",
  GenerateAllLegalMoves: "全合法手を生成",
  DrawScore: "引き分けのスコア",
  DrawValue: "引き分けの値",
  DrawValueBlack: "引き分けの値・先手",
  DrawValueWhite: "引き分けの値・後手",
  LargePageEnable: "LargePageを使用",
  SkillLevel: "スキルレベル",
  Skill_Level: "スキルレベル",
  BookOnTheFly: "定跡直接読み込み（大規模定跡）",
  BookDepthLimit: "定跡深さ制限",
  BookEvalBlackLimit: "定跡評価値制限・先手",
  BookEvalWhiteLimit: "定跡評価値制限・後手",
};

export const usiOptionNameMap: USIOptionNameMap = {};

function getUSIOptionNameMap(language: Language): USIOptionNameMap {
  switch (language) {
    case Language.JA:
      return ja;
    case Language.EN:
      return {}; // not supported
    default:
      return {};
  }
}

export function setLanguage(lang: Language) {
  Object.keys(usiOptionNameMap).forEach((key) => {
    delete usiOptionNameMap[key];
  });
  Object.entries(getUSIOptionNameMap(lang)).forEach(([key, value]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (usiOptionNameMap as any)[key] = value;
  });
}
