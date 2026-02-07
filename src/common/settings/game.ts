import { InitialPositionType } from "tsshogi";
import { PlayerSettings, defaultPlayerSettings, validatePlayerSettings } from "./player.js";
import { t } from "@/common/i18n/index.js";
import * as uri from "@/common/uri.js";
import { removeLastSlash } from "@/common/helpers/path.js";
import { SearchCommentFormat } from "./comment.js";

export type TimeLimitSettings = {
  timeSeconds: number;
  byoyomi: number;
  increment: number;
};

export function defaultTimeLimitSettings(): TimeLimitSettings {
  return {
    timeSeconds: 0,
    byoyomi: 30,
    increment: 0,
  };
}

export type SingleGameStartPositionType = InitialPositionType | "current" /* 現局面 */;
export type GameStartPositionType = SingleGameStartPositionType | "list" /* 局面集 */;

export enum JishogiRule {
  NONE = "none",
  GENERAL24 = "general24",
  GENERAL27 = "general27",
  TRY = "try",
}

export const DeclarableJishogiRules = [JishogiRule.GENERAL24, JishogiRule.GENERAL27];

export type SingleGameSettings = {
  black: PlayerSettings;
  white: PlayerSettings;
  timeLimit: TimeLimitSettings;
  whiteTimeLimit?: TimeLimitSettings;
  startPosition: SingleGameStartPositionType; // v1.21.0 から undefined を廃止
  enableEngineTimeout: boolean;
  humanIsFront: boolean;
  enableComment: boolean;
  enableAutoSave: boolean;
  autoSaveDirectory: string;
  maxMoves: number;
  jishogiRule: JishogiRule;
  searchCommentFormat: SearchCommentFormat;
};

export type SPRTSettings = {
  elo0: number;
  elo1: number;
  alpha: number;
  beta: number;
  maxGames: number;
};

export function defaultSPRTSettings(): SPRTSettings {
  return {
    elo0: 0.5,
    elo1: 2.5,
    alpha: 0.05,
    beta: 0.05,
    maxGames: 100000,
  };
}

export type LinearGameSettings = Omit<SingleGameSettings, "startPosition"> & {
  startPosition: GameStartPositionType; // v1.21.0 から undefined を廃止
  startPositionListFile: string;
  startPositionListOrder: "sequential" | "shuffle";
  repeat: number;
  swapPlayers: boolean;
  sprtEnabled: boolean;
  sprt: SPRTSettings;
};

export type GameSettings = LinearGameSettings & {
  parallelism: number;
};

export function defaultGameSettings(opts?: { autoSaveDirectory?: string }): GameSettings {
  return {
    black: defaultPlayerSettings(),
    white: defaultPlayerSettings(),
    timeLimit: defaultTimeLimitSettings(),
    startPosition: InitialPositionType.STANDARD, // v1.21.0 から平手初期配置をデフォルトに変更
    startPositionListFile: "",
    startPositionListOrder: "sequential",
    enableEngineTimeout: false,
    humanIsFront: true,
    enableComment: true,
    enableAutoSave: !!opts?.autoSaveDirectory,
    autoSaveDirectory: removeLastSlash(opts?.autoSaveDirectory || ""),
    repeat: 1,
    parallelism: 1,
    swapPlayers: false,
    maxMoves: 1000,
    jishogiRule: JishogiRule.GENERAL27,
    searchCommentFormat: SearchCommentFormat.SHOGIHOME,
    sprtEnabled: false,
    sprt: defaultSPRTSettings(),
  };
}

export function normalizeGameSettings(
  settings: GameSettings,
  opts?: { autoSaveDirectory?: string },
): GameSettings {
  const result = {
    ...defaultGameSettings(opts),
    ...{
      // v1.21.0 までは startPosition を省略可能で、それが現在の current に相当していた。
      startPosition: "current",
    },
    ...settings,
    black: {
      ...defaultPlayerSettings(),
      ...settings.black,
    },
    white: {
      ...defaultPlayerSettings(),
      ...settings.white,
    },
    timeLimit: {
      ...defaultTimeLimitSettings(),
      ...settings.timeLimit,
    },
    sprt: {
      ...defaultSPRTSettings(),
      ...settings.sprt,
    },
  };
  if (!result.autoSaveDirectory) {
    result.autoSaveDirectory = removeLastSlash(opts?.autoSaveDirectory || "");
  }
  return result;
}

export function validateGameSettings(gameSettings: GameSettings): Error | undefined {
  const playerError =
    validatePlayerSettings(gameSettings.black) || validatePlayerSettings(gameSettings.white);
  if (playerError) {
    return playerError;
  }

  if (gameSettings.timeLimit.timeSeconds === 0 && gameSettings.timeLimit.byoyomi === 0) {
    return new Error(t.bothTimeLimitAndByoyomiAreNotSet);
  }
  if (gameSettings.timeLimit.byoyomi !== 0 && gameSettings.timeLimit.increment !== 0) {
    return new Error(t.canNotUseByoyomiWithFischer);
  }
  if (
    gameSettings.whiteTimeLimit &&
    gameSettings.whiteTimeLimit.timeSeconds === 0 &&
    gameSettings.whiteTimeLimit.byoyomi === 0
  ) {
    return new Error(t.bothTimeLimitAndByoyomiAreNotSet);
  }
  if (
    gameSettings.whiteTimeLimit &&
    gameSettings.whiteTimeLimit.byoyomi !== 0 &&
    gameSettings.whiteTimeLimit.increment !== 0
  ) {
    return new Error(t.canNotUseByoyomiWithFischer);
  }
  if (gameSettings.repeat < 1) {
    return new Error("The number of repeats must be positive.");
  }
  if (!Number.isInteger(gameSettings.parallelism) || gameSettings.parallelism < 1) {
    return new Error("Parallelism must be a positive integer.");
  }
  const containsHuman =
    gameSettings.black.uri === uri.ES_HUMAN || gameSettings.white.uri === uri.ES_HUMAN;
  if (containsHuman && gameSettings.repeat > 1) {
    return new Error(t.repeatsMustBeOneIfHumanPlayerIncluded);
  }
  if (containsHuman && gameSettings.parallelism > 1) {
    return new Error(t.parallelismMustBeOneIfHumanPlayerIncluded);
  }
  if (gameSettings.startPosition === "current" && gameSettings.parallelism > 1) {
    return new Error(t.parallelismMustBeOneIfCurrentPositionIsUsed);
  }
  if (!gameSettings.sprtEnabled && gameSettings.parallelism > gameSettings.repeat) {
    return new Error(t.parallelismMustLessThanOrEqualToRepeats);
  }
  if (gameSettings.parallelism > 10) {
    return new Error("Parallelism must be 10 or less.");
  }
  if (gameSettings.sprtEnabled) {
    if (containsHuman) {
      return new Error("SPRT cannot be used with human players.");
    }
    if (!gameSettings.swapPlayers) {
      return new Error("SPRT: swapPlayers must be enabled.");
    }
    if (gameSettings.sprt.elo0 >= gameSettings.sprt.elo1) {
      return new Error("SPRT: elo0 must be less than elo1.");
    }
    if (gameSettings.sprt.alpha <= 0 || gameSettings.sprt.alpha >= 1) {
      return new Error("SPRT: alpha must be between 0 and 1.");
    }
    if (gameSettings.sprt.beta <= 0 || gameSettings.sprt.beta >= 1) {
      return new Error("SPRT: beta must be between 0 and 1.");
    }
    if (!Number.isInteger(gameSettings.sprt.maxGames) || gameSettings.sprt.maxGames <= 0) {
      return new Error("SPRT: maxGames must be a positive integer.");
    }
  }
}

export function validateGameSettingsForWeb(gameSettings: GameSettings): Error | undefined {
  const result = validateGameSettings(gameSettings);
  if (result) {
    return result;
  }
  if (gameSettings.enableAutoSave) {
    return new Error("自動保存はWeb版で利用できません。");
  }
  return;
}
