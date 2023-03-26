import "./css/tailwind.css";
import "./css/font.css";
import "./css/color.css";
import "./css/basic.css";
import "./css/control.css";
import "./css/dialog.css";
import { createApp } from "vue";
import App from "@/renderer/App.vue";
import api, { appInfo } from "@/renderer/ipc/api";
import { setup as setupIPC } from "@/renderer/ipc/setup";
import { useStore } from "@/renderer/store";
import { Chart, registerables } from "chart.js";
import { LogLevel } from "@/common/log";
import { useAppSetting } from "./store/setting";
import { setLanguage, t } from "@/common/i18n";

api.log(
  LogLevel.INFO,
  `start renderer process: APP_VERSION=${appInfo.appVersion}`
);

Chart.register(...registerables);

setupIPC();

function updateTitle(path?: string) {
  if (!document) {
    return;
  }
  const appName = t.electronShogi;
  const appVersion = appInfo.appVersion;
  if (path) {
    document.title = `${appName} Version ${appVersion} - ${path}`;
  } else {
    document.title = `${appName} Version ${appVersion}`;
  }
}

const store = useStore().addListener("changeFilePath", updateTitle);

Promise.allSettled([
  useAppSetting()
    .loadAppSetting()
    .catch((e) => {
      store.pushError(
        new Error("アプリ設定の読み込み中にエラーが発生しました: " + e)
      );
    }),
  api
    .getRecordPathFromProcArg()
    .then((path) => {
      if (path) {
        store.openRecord(path);
      }
    })
    .catch((e) => {
      store.pushError(new Error("起動パラメーターの取得に失敗しました: " + e));
    }),
]).finally(() => {
  const language = useAppSetting().language;
  api.log(LogLevel.INFO, `set language: ${language}`);
  setLanguage(language);
  updateTitle(store.recordFilePath);
  api.log(LogLevel.INFO, "mount app");
  createApp(App).mount("#app");
});
