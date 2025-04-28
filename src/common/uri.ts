import { t } from "./i18n/index.js";

export const ES_HUMAN = "es://human";
export const ES_BASIC_ENGINE_PREFIX = "es://basic-engine/";
export const ES_BASIC_ENGINE_STATIC_ROOK_V1 = `${ES_BASIC_ENGINE_PREFIX}static_rook/v1`;
export const ES_BASIC_ENGINE_RANGING_ROOK_V1 = `${ES_BASIC_ENGINE_PREFIX}ranging_rook/v1`;
export const ES_BASIC_ENGINE_RANDOM = `${ES_BASIC_ENGINE_PREFIX}random`;
export const ES_BASIC_ENGINE_LIST = [
  ES_BASIC_ENGINE_STATIC_ROOK_V1,
  ES_BASIC_ENGINE_RANGING_ROOK_V1,
  ES_BASIC_ENGINE_RANDOM,
] as const;
export const ES_USI_ENGINE_PREFIX = "es://usi-engine/";
export const ES_STANDARD_LAYOUT_PROFILE = "es://layout-profile/standard";
export const ES_CUSTOM_LAYOUT_PROFILE_PREFIX = "es://layout-profile/custom/";
export const ES_TEMP_FILE_PREFIX = "es://temp-file/";

export function isBasicEngine(uri: string): boolean {
  return uri.startsWith(ES_BASIC_ENGINE_PREFIX);
}

export function basicEngineName(uri: string): string {
  switch (uri) {
    case ES_BASIC_ENGINE_STATIC_ROOK_V1:
      return `ShogiHome ${t.beginner} (${t.staticRook})`;
    case ES_BASIC_ENGINE_RANGING_ROOK_V1:
      return `ShogiHome ${t.beginner} (${t.rangingRook})`;
    case ES_BASIC_ENGINE_RANDOM:
      return `ShogiHome ${t.randomPlayer}`;
  }
  return uri.slice(ES_BASIC_ENGINE_PREFIX.length);
}

export function isUSIEngine(uri: string): boolean {
  return uri.startsWith(ES_USI_ENGINE_PREFIX);
}

export function issueEngineURI(): string {
  const now = Date.now();
  const rand = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
  return ES_USI_ENGINE_PREFIX + `${now}/${rand}`;
}

export function issueCustomLayoutProfileURI(): string {
  const now = Date.now();
  const rand = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
  return ES_CUSTOM_LAYOUT_PROFILE_PREFIX + `${now}/${rand}`;
}

export function issueTempFileURI(name: string): string {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 16 ** 6)
    .toString(16)
    .padStart(6, "0");
  return ES_TEMP_FILE_PREFIX + `${now}/${rand}/${name}`;
}
