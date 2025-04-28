import { exists } from "./file.js";
import { t } from "@/common/i18n/index.js";
import { app, Notification, shell } from "electron";

export function getAppVersion(): string {
  return requireElectron().app.getVersion();
}

export async function openPath(path: string) {
  // 存在しないパスを開こうとした場合の振る舞いがプラットフォームによって異なるため、事前に存在チェックを行う。
  if (!(await exists(path))) {
    throw new Error(t.failedToOpenDirectory(path));
  }
  requireElectron().shell.openPath(path);
}

export function showNotification(title: string, body: string) {
  new (requireElectron().Notification)({
    title,
    body,
    timeoutType: "never",
  }).show();
}

export function preventAppSuspension(): number | undefined {
  const electron = getElectron();
  if (electron) {
    return electron.powerSaveBlocker.start("prevent-app-suspension");
  }
}

export function allowAppSuspension(id: number) {
  const electron = getElectron();
  if (electron) {
    electron.powerSaveBlocker.stop(id);
  }
}
