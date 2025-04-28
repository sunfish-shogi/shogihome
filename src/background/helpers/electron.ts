import { exists } from "./file.js";
import { t } from "@/common/i18n/index.js";
import { app, Notification, shell } from "electron";

export function getAppVersion(): string {
  return app.getVersion();
}

export async function openPath(path: string) {
  // 存在しないパスを開こうとした場合の振る舞いがプラットフォームによって異なるため、事前に存在チェックを行う。
  if (!(await exists(path))) {
    throw new Error(t.failedToOpenDirectory(path));
  }
  shell.openPath(path);
}

export function showNotification(title: string, body: string) {
  new Notification({
    title,
    body,
    timeoutType: "never",
  }).show();
}
