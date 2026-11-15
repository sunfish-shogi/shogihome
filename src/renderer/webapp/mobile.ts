import { t } from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import api, { isMobileWebApp, isNative } from "@/renderer/ipc/api.js";
import { isIOS } from "@/renderer/helpers/env.js";
import { useConfirmationStore } from "@/renderer/store/confirm.js";

// モバイル向け画面への切り替えを拒否したかどうかを保存する localStorage のキー
export const mobileModeRecommendationStorageKey = "webapp.mobileModeRecommendation";
const mobileModeRecommendationDeclined = "declined";

/**
 * スマートフォンやタブレットである可能性が高いかどうかを判定します。
 */
export function isLikelyMobileDevice(): boolean {
  // User-Agent Client Hints (Chromium 系)
  const userAgentData = (navigator as unknown as { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (userAgentData?.mobile) {
    return true;
  }
  // User-Agent 文字列
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    return true;
  }
  // iPadOS の Safari は Mac と同じ User-Agent を返す。
  if (isIOS()) {
    return true;
  }
  // タッチ操作のみでマウスなどの精密なポインターを持たない端末
  if (typeof window.matchMedia === "function") {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const anyFine = window.matchMedia("(any-pointer: fine)").matches;
    const anyHover = window.matchMedia("(any-hover: hover)").matches;
    if (coarse && !anyFine && !anyHover) {
      return true;
    }
  }
  return false;
}

function isDeclined(): boolean {
  try {
    return localStorage.getItem(mobileModeRecommendationStorageKey) !== null;
  } catch {
    return false;
  }
}

function markDeclined(): void {
  try {
    localStorage.setItem(mobileModeRecommendationStorageKey, mobileModeRecommendationDeclined);
  } catch (e) {
    api.log(LogLevel.WARN, `failed to save mobile mode recommendation state: ${e}`);
  }
}

/**
 * モバイル向け画面への切り替えを勧めるべきかどうかを判定します。
 */
export function shouldRecommendMobileMode(): boolean {
  return !isNative() && !isMobileWebApp() && !isDeclined() && isLikelyMobileDevice();
}

/**
 * PC 向けの画面をスマートフォンやタブレットで開いている可能性が高い場合に、
 * モバイル向けの画面へ切り替えるかを確認します。
 * 切り替えを拒否した場合は、そのことを記録して再度確認しません。
 * 画面のマウント後に呼び出します。
 */
export function recommendMobileMode(): void {
  if (!shouldRecommendMobileMode()) {
    return;
  }
  const confirmation = useConfirmationStore();
  // 他の確認ダイアログ (言語の切り替えなど) を表示中の場合は今回は見送る。
  if (confirmation.message) {
    return;
  }
  api.log(LogLevel.INFO, "recommend mobile mode");
  confirmation.show({
    message: t.confirmSwitchToMobileMode,
    buttonType: "yesNo",
    onOk: () => {
      const url = new URL(window.location.href);
      url.searchParams.set("mobile", "");
      window.location.assign(url.href);
    },
    onCancel: () => {
      markDeclined();
    },
  });
}
