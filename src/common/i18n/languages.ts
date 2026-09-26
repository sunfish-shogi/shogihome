export enum Language {
  // ISO 639-1
  JA = "ja",
  EN = "en",
  ZH_TW = "zh_tw",
  VI = "vi",
}

/**
 * 各言語をその言語自身で表記した名前です。
 */
export const languageNativeNames: Record<Language, string> = {
  [Language.JA]: "日本語",
  [Language.EN]: "English",
  [Language.ZH_TW]: "繁體中文",
  [Language.VI]: "Tiếng Việt",
};

export function isLanguage(value: string): value is Language {
  return Object.values(Language).includes(value as Language);
}
