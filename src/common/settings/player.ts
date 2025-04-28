import { t } from "@/common/i18n/index.js";
import { USIEngine, validateUSIEngine } from "./usi.js";
import * as uri from "@/common/uri.js";

export type PlayerSettings = {
  name: string;
  uri: string;
  usi?: USIEngine;
};

export function defaultPlayerSettings(): PlayerSettings {
  return {
    name: t.human,
    uri: uri.ES_HUMAN,
  };
}

export function validatePlayerSettings(settings: PlayerSettings): Error | undefined {
  if (!settings.name) {
    return new Error("player name is required");
  }
  if (!settings.uri) {
    return new Error("player URI is required");
  }
  if (uri.isUSIEngine(settings.uri)) {
    if (!settings.usi) {
      return new Error("USI is required");
    }
    const usiError = validateUSIEngine(settings.usi);
    if (usiError) {
      return usiError;
    }
  } else if (uri.isBasicEngine(settings.uri)) {
    if (!uri.ES_BASIC_ENGINE_LIST.some((uri) => uri === settings.uri)) {
      return new Error("invalid player URI");
    }
  } else if (settings.uri !== uri.ES_HUMAN) {
    return new Error("invalid player URI");
  }
}
