import { createApp } from "vue";
import App from "@/App.vue";
import api from "@/ipc/api";
import { setup as setupIPC } from "@/ipc/setup";
import { useStore } from "@/store";
import { Chart, registerables } from "chart.js";
import { LogLevel } from "@/ipc/log";

api.log(LogLevel.INFO, "start renderer process");

Chart.register(...registerables);

setupIPC();

const store = useStore();
Promise.allSettled([
  api
    .loadAppSetting()
    .then((setting) => {
      store.updateAppSetting(setting);
    })
    .catch((e) => {
      store.pushError(
        new Error("アプリ設定の読み込み中にエラーが発生しました :" + e)
      );
    }),
  api.getRecordPathFromProcArg().then((path) => {
    if (path) {
      store.openRecord(path);
    }
  }),
]).finally(() => {
  api.log(LogLevel.INFO, "mount app");
  createApp(App).mount("#app");
});
