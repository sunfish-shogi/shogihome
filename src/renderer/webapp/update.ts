import { t } from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import api, { isNative } from "@/renderer/ipc/api.js";
import { useNotificationStore } from "@/renderer/store/notification.js";

// 更新確認を行う間隔
const updateCheckInterval = 60 * 60 * 1000; // 1 時間
// 更新確認の最小間隔（短時間に何度も画面を切り替えた場合の抑止）
const minUpdateCheckInterval = 5 * 60 * 1000; // 5 分
// SKIP_WAITING を送信してから controllerchange が発生しない場合に再読み込みするまでの時間
const activationTimeout = 5 * 1000; // 5 秒

// 通知済みの Service Worker（同じ更新について繰り返し通知しないために保持する。）
let notifiedWorker: ServiceWorker | undefined;

/**
 * 待機中の Service Worker を有効化してページを再読み込みします。
 */
function activate(worker: ServiceWorker): void {
  // 新しい Service Worker が制御を開始したら再読み込みする。
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      clearTimeout(timer);
      window.location.reload();
    },
    { once: true },
  );
  // controllerchange が発生しない場合に備えて再読み込みを予約する。
  const timer = setTimeout(() => window.location.reload(), activationTimeout);
  worker.postMessage({ type: "SKIP_WAITING" });
}

/**
 * 更新版のダウンロードが完了したことを通知します。
 *
 * Web アプリでは棋譜を localStorage へ自動保存しているため、
 * 再読み込みしても編集中の内容は失われない。よって確認は行わない。
 */
function onUpdateReady(worker: ServiceWorker): void {
  if (notifiedWorker === worker) {
    return;
  }
  notifiedWorker = worker;
  api.log(LogLevel.INFO, "service worker: new version is ready");
  useNotificationStore().addAction(t.newVersionIsAvailablePressToUpdate, () => activate(worker));
}

/**
 * Web アプリの更新を検知して通知する仕組みを準備します。
 *
 * ブラウザーによる Service Worker の更新確認はページ遷移時と 24 時間ごとに限られるため、
 * 定期的および画面復帰時に明示的な確認を行う。
 */
export async function setupUpdateNotification(): Promise<void> {
  if (isNative() || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  // 既に更新版のインストールが完了している場合
  if (registration.waiting) {
    onUpdateReady(registration.waiting);
  }

  // 更新版のインストールが完了した場合
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) {
      return;
    }
    worker.addEventListener("statechange", () => {
      // 制御中の Service Worker が既に存在する場合のみ更新とみなす。
      // 初回アクセス時のインストールでは通知しない。
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        onUpdateReady(worker);
      }
    });
  });

  // ページの読み込み時にはブラウザーが更新を確認しているため、直後の確認は省略する。
  let lastCheckedAt = Date.now();
  const check = () => {
    const now = Date.now();
    if (now - lastCheckedAt < minUpdateCheckInterval) {
      return;
    }
    lastCheckedAt = now;
    registration.update().catch((e) => {
      api.log(LogLevel.WARN, `service worker: failed to check for updates: ${e}`);
    });
  };
  setInterval(check, updateCheckInterval);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      check();
    }
  });
}
