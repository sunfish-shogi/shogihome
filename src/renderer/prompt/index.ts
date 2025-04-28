import "@/renderer/css/font.css";
import "@/renderer/css/color.css";
import "@/renderer/css/basic.css";
import "@/renderer/css/control.css";
import { setupPrompt as setupIPC } from "@/renderer/ipc/setup.js";
import api from "@/renderer/ipc/api.js";
import { LogLevel } from "@/common/log.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { setLanguage } from "@/common/i18n/index.js";
import { createApp } from "vue";
import PromptMain from "@/renderer/view/prompt/PromptMain.vue";
import { useStore } from "./store.js";

api.log(LogLevel.INFO, "start renderer process (prompt)");

setupIPC();

const store = useStore();

document.title = `ShogiHome Prompt - ${store.target} [${store.sessionID}] ${store.name}`;

Promise.allSettled([
  store.setup(),
  useAppSettings()
    .loadAppSettings()
    .catch((e) => {
      store.onError(new Error("アプリ設定の読み込み中にエラーが発生しました: " + e));
    }),
]).finally(() => {
  const language = useAppSettings().language;
  setLanguage(language);
  api.log(LogLevel.INFO, "mount app (prompt)");
  createApp(PromptMain).mount("#app");
});
