import "@/renderer/css/font.css";
import "@/renderer/css/color.css";
import "@/renderer/css/basic.css";
import "@/renderer/css/control.css";
import "@/renderer/css/dialog.css";
import { setLanguage } from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import api from "@/renderer/ipc/api.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { createApp } from "vue";
import MonitorWindow from "@/renderer/view/monitor/MonitorWindow.vue";

api.log(LogLevel.INFO, "start renderer process (monitor)");

const appSettings = useAppSettings();

appSettings
  .loadAppSettings()
  .catch((e) => {
    api.log(LogLevel.ERROR, "アプリ設定の読み込み中にエラーが発生しました: " + e);
  })
  .finally(() => {
    const language = useAppSettings().language;
    setLanguage(language);
    api.log(LogLevel.INFO, "mount app (monitor)");
    createApp(MonitorWindow).mount("#app");
  });
