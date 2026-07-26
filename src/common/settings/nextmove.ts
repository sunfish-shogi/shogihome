import { t } from "@/common/i18n/index.js";
import { PlayerCriteria } from "./book.js";
import { USIEngine } from "./usi.js";

export type NextMoveGenerationSettings = {
  usi?: USIEngine; // 再探索に使用するエンジン
  sourceDirectory: string; // 棋譜ファイルのディレクトリ
  playerCriteria: PlayerCriteria; // 対象とする対局者
  playerName?: string; // 対局者名 (FILTER_BY_NAME の場合のみ)
  minPly: number; // 対象とする手数の下限
  maxPly: number; // 対象とする手数の上限
  winRateDropThreshold: number; // 悪手と判定する勝率下降幅 (%)
  minWinRate: number; // 対象とする手番側勝率の下限 (%)。これ未満の劣勢局面は除外する。
  multiPV: number; // 再探索時の MultiPV 値
  maxSecondsPerPosition: number; // 1 局面あたりの探索時間 (秒)
  adoptionWinRateDiff: number; // 問題として採用する最善手と実戦の手の勝率差 (%)
  acceptableWinRateDiff: number; // 正解として扱う最善手との勝率差 (%)
  maxProblems: number; // 問題数の上限
  destinationFile: string; // 保存先の JSON ファイル
};

export function defaultNextMoveGenerationSettings(): NextMoveGenerationSettings {
  return {
    sourceDirectory: "",
    playerCriteria: PlayerCriteria.ALL,
    minPly: 20,
    maxPly: 120,
    winRateDropThreshold: 20,
    minWinRate: 40,
    multiPV: 3,
    maxSecondsPerPosition: 10,
    adoptionWinRateDiff: 15,
    acceptableWinRateDiff: 5,
    maxProblems: 100,
    destinationFile: "",
  };
}

export function normalizeNextMoveGenerationSettings(
  settings: NextMoveGenerationSettings,
): NextMoveGenerationSettings {
  return {
    ...defaultNextMoveGenerationSettings(),
    ...settings,
  };
}

export function validateNextMoveGenerationSettings(
  settings: NextMoveGenerationSettings,
): Error | undefined {
  if (!settings.usi) {
    return new Error(t.engineNotSelected);
  }
  if (!settings.sourceDirectory) {
    return new Error(t.sourceDirectoryNotSet);
  }
  if (!settings.destinationFile) {
    return new Error(t.destinationFileNotSpecified);
  }
  if (!settings.destinationFile.endsWith(".json")) {
    return new Error(t.destinationFileMustBeJSON);
  }
  if (settings.playerCriteria === PlayerCriteria.FILTER_BY_NAME && !settings.playerName) {
    return new Error(t.playerNameNotSet);
  }
  if (settings.minPly < 0 || settings.minPly % 1 !== 0) {
    return new Error("開始手数は0以上の整数を指定してください。"); // TODO: i18n
  }
  if (settings.maxPly < settings.minPly) {
    return new Error(t.minPlyMustBeLessThanMaxPly);
  }
  if (settings.winRateDropThreshold <= 0 || settings.winRateDropThreshold > 100) {
    return new Error("悪手と判定する勝率下降幅は1〜100%で指定してください。"); // TODO: i18n
  }
  if (settings.minWinRate < 0 || settings.minWinRate >= 100) {
    return new Error("手番側勝率の下限は0以上100%未満で指定してください。"); // TODO: i18n
  }
  if (settings.multiPV < 2 || settings.multiPV % 1 !== 0) {
    return new Error("MultiPVは2以上の整数を指定してください。"); // TODO: i18n
  }
  if (settings.maxSecondsPerPosition < 1) {
    return new Error("1局面あたりの探索時間は1秒以上を指定してください。"); // TODO: i18n
  }
  if (settings.adoptionWinRateDiff <= 0 || settings.adoptionWinRateDiff > 100) {
    return new Error("採用する勝率差は1〜100%で指定してください。"); // TODO: i18n
  }
  if (
    settings.acceptableWinRateDiff < 0 ||
    settings.acceptableWinRateDiff >= settings.adoptionWinRateDiff
  ) {
    return new Error("正解として扱う勝率差は採用する勝率差より小さくしてください。"); // TODO: i18n
  }
  if (settings.maxProblems <= 0 || settings.maxProblems % 1 !== 0) {
    return new Error("問題数の上限は1以上の整数を指定してください。"); // TODO: i18n
  }
}
