import { t } from "@/common/i18n/index.js";
import { Notification } from "electron";
import { loadAppSettings } from "@/background/settings.js";
import { cropPieceImage } from "@/background/image/cropper.js";
import { AppSettingsUpdate, PieceImageType } from "@/common/settings/app.js";

export async function refreshCustomPieceImages(
  onUpdateAppSettings: (update: AppSettingsUpdate) => void,
) {
  const appSettings = await loadAppSettings();
  if (appSettings.pieceImage !== PieceImageType.CUSTOM_IMAGE || !appSettings.pieceImageFileURL) {
    throw new Error("No custom piece image is in use.");
  }
  await cropPieceImage(appSettings.pieceImageFileURL, {
    deleteMargin: appSettings.deletePieceImageMargin,
    overwrite: true,
  });
  onUpdateAppSettings({
    croppedPieceImageQuery: `updated=${Date.now()}`,
  });
}

export function sendTestNotification() {
  new Notification({
    title: t.shogiHome,
    body: t.thisIsTestNotification,
  }).show();
}
