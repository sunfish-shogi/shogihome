import {
  getTranslationTable,
  isLanguage,
  Language,
  languageNativeNames,
  t,
} from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import api, { isNative } from "@/renderer/ipc/api.js";
import { hasSavedAppSettings } from "@/renderer/ipc/web.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { useConfirmationStore } from "@/renderer/store/confirm.js";

export type LanguageQueryParam = {
  // クエリで指定された言語
  language: Language;
  // アプリ設定が保存済みかどうか
  hasSavedAppSettings: boolean;
};

/**
 * URL の `lang` クエリを読み取り、URL から取り除きます。
 * クエリ付きの URL がブックマークされるのを防ぐため、値に関わらず必ず取り除きます。
 * 日本語や不正な値が指定された場合は undefined を返します。
 */
export function takeLanguageQueryParam(): LanguageQueryParam | undefined {
  if (isNative()) {
    return;
  }
  const url = new URL(window.location.toString());
  const lang = url.searchParams.get("lang");
  if (lang === null) {
    return;
  }
  url.searchParams.delete("lang");
  window.history.replaceState(window.history.state, "", url.toString());
  if (!isLanguage(lang) || lang === Language.JA) {
    return;
  }
  return { language: lang, hasSavedAppSettings: hasSavedAppSettings() };
}

/**
 * アプリ設定が未保存の場合に、クエリで指定された言語をアプリ設定に保存します。
 * 言語の反映 (setLanguage) より前に呼び出します。
 */
export async function applyLanguageQueryParam(param: LanguageQueryParam): Promise<void> {
  const appSettings = useAppSettings();
  if (param.hasSavedAppSettings || appSettings.language === param.language) {
    return;
  }
  api.log(LogLevel.INFO, `apply language from query: ${param.language}`);
  await appSettings.updateAppSettings({ language: param.language });
}

/**
 * アプリ設定が保存済みで言語が異なる場合に、言語を切り替えるかを確認します。
 * 画面のマウント後に呼び出します。
 */
export function confirmLanguageQueryParam(param: LanguageQueryParam): void {
  const appSettings = useAppSettings();
  if (!param.hasSavedAppSettings || appSettings.language === param.language) {
    return;
  }
  // 現在の言語と切り替え先の言語の両方で確認する。
  const languageName = languageNativeNames[param.language];
  const message = [
    t.confirmSwitchLanguage(languageName),
    getTranslationTable(param.language).confirmSwitchLanguage(languageName),
  ].join("\n");
  useConfirmationStore().show({
    message,
    buttonType: "yesNo",
    onOk: () => {
      appSettings
        .updateAppSettings({ language: param.language })
        .then(() => window.location.reload())
        .catch((e) => {
          api.log(LogLevel.ERROR, `failed to switch language: ${e}`);
        });
    },
  });
}
