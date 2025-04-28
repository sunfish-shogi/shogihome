import { InitialPositionType } from "tsshogi";
import { PlayerSettings, defaultPlayerSettings, validatePlayerSettings } from "./player.js";
import { t } from "@/common/i18n/index.js";
import * as uri from "@/common/uri.js";

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

export type GameStartPositionType =
  | InitialPositionType
  | "current" // 現局面
  | "list"; // 局面集

export enum JishogiRule {
  NONE = "none",
  GENERAL24 = "general24",
  GENERAL27 = "general27",
  TRY = "try",
}

export const DeclarableJishogiRules = [JishogiRule.GENERAL24, JishogiRule.GENERAL27];

export type GameSettings = {
  black: PlayerSettings;
  white: PlayerSettings;
  timeLimit: TimeLimitSettings;
  whiteTimeLimit?: TimeLimitSettings;
  startPosition: GameStartPositionType; // v1.21.0 から undefined を廃止
  startPositionListFile: string;
  startPositionListOrder: "sequential" | "shuffle";
  enableEngineTimeout: boolean;
  humanIsFront: boolean;
  enableComment: boolean;
  enableAutoSave: boolean;
  repeat: number;
  swapPlayers: boolean;
  maxMoves: number;
  jishogiRule: JishogiRule;
};

export function defaultGameSettings(): GameSettings {
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
    enableAutoSave: true,
    repeat: 1,
    swapPlayers: false,
    maxMoves: 1000,
    jishogiRule: JishogiRule.GENERAL27,
  };
}

export function normalizeGameSettings(settings: GameSettings): GameSettings {
  return {
    ...defaultGameSettings(),
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
  };
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
  const containsHuman =
    gameSettings.black.uri === uri.ES_HUMAN || gameSettings.white.uri === uri.ES_HUMAN;
  if (containsHuman && gameSettings.repeat > 1) {
    return new Error(t.repeatsMustBeOneIfHumanPlayerIncluded);
  }
  return;
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
