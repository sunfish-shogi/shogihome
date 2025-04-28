import { Language } from "./languages.js";
import { en } from "./locales/en.js";
import { ja } from "./locales/ja.js";
import { zh_tw } from "./locales/zh_tw.js";
import { vi } from "./locales/vi.js";
import { Texts } from "./text_template.js";

export const t = ja;

function getTranslationTable(language: Language): Texts {
  switch (language) {
    case Language.JA:
      return ja;
    case Language.EN:
      return en;
    case Language.ZH_TW:
      return zh_tw;
    case Language.VI:
      return vi;
    default:
      return ja;
  }
}

export function setLanguage(lang: Language) {
  Object.entries(getTranslationTable(lang)).forEach(([key, value]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any)[key] = value;
  });
}
