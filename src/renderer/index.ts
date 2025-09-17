import "./css/font.css";
import "./css/color.css";
import "./css/basic.css";
import "./css/control.css";
import "./css/dialog.css";
import { createApp, watch } from "vue";
import App from "@/renderer/view/App.vue";
import api, { appInfo, isMobileWebApp } from "@/renderer/ipc/api.js";
import { setup as setupIPC } from "@/renderer/ipc/setup.js";
import { useStore } from "@/renderer/store/index.js";
import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  ScatterController,
} from "chart.js";
import { LogLevel } from "@/common/log.js";
import { useAppSettings } from "./store/settings.js";
import { setLanguage, t } from "@/common/i18n/index.js";
import { default as dayjs } from "dayjs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as _en from "dayjs/locale/en";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as _ja from "dayjs/locale/ja";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as _zh_tw from "dayjs/locale/zh-tw";
import relativeTime from "dayjs/plugin/relativeTime";
import { useErrorStore } from "@/renderer/store/error.js";


api.log(LogLevel.INFO, `start renderer process: APP_VERSION=${appInfo.appVersion}`);

// setup libraries
import("dayjs/locale/en");
import("dayjs/locale/ja");
import("dayjs/locale/zh-tw");
dayjs.extend(relativeTime);
Chart.register(ScatterController, LineElement, LinearScale, PointElement, CategoryScale, Legend);

setupIPC();

const store = useStore();

// ファイル名の変更を監視してタイトルを更新する。
function updateTitle(path: string | undefined, unsaved: boolean) {
  if (!document) {
    return;
  }
  const appName = t.shogiHome;
  const appVersion = appInfo.appVersion;
  if (isMobileWebApp()) {
    document.title = `${appName} Version ${appVersion} for Mobile Web Browser`;
    return;
  }
  if (path || unsaved) {
    const unsavedMaker = unsaved ? `${t.unsaved}: ` : "";
    const name = path ? path : t.newRecord;
    document.title = `${appName} Version ${appVersion} - ${unsavedMaker}${name}`;
  } else {
    document.title = `${appName} Version ${appVersion}`;
  }
}
watch([() => store.recordFilePath, () => store.isRecordFileUnsaved], ([path, unsaved]) => {
  updateTitle(path, unsaved);
});

// PWAの場合はモバイル用の画面に切り替える
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS Safari の場合は window.navigator.standalone で判定できる
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.navigator as any).standalone === true;
if (isStandalone && !isMobileWebApp()) {
  const url = new URL(window.location.href);
  url.searchParams.set("mobile", "");
  window.location.replace(url.href);
}

Promise.allSettled([
  // アプリ設定の読み込み
  useAppSettings()
    .loadAppSettings()
    .catch((e) => {
      useErrorStore().add(new Error("アプリ設定の読み込み中にエラーが発生しました: " + e));
    }),
  // 起動時パラメータの取得
  api
    .fetchProcessArgs()
    .then((args) => {
      api.log(LogLevel.DEBUG, `args: ${JSON.stringify(args)}`);
      // 棋譜の読み込み
      if (args?.path) {
        store.openRecord(args.path, { ply: args.ply });
      }
      // レイアウトの設定
      if (args?.layoutProfile) {
        store.updateLayoutProfile(args.layoutProfile);
      }
    })
    .catch((e) => {
      useErrorStore().add(new Error("起動パラメーターの取得に失敗しました: " + e));
    }),
]).finally(() => {
  // 言語設定の反映
  const language = useAppSettings().language;
  api.log(LogLevel.INFO, `set language: ${language}`);
  setLanguage(language);

  // タイトルの更新
  updateTitle(store.recordFilePath, store.isRecordFileUnsaved);

  api.log(LogLevel.INFO, "mount app");
  createApp(App).mount("#app");
});
