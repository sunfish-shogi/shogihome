import fs from "node:fs";
import path from "node:path";
import { Rect } from "@/common/assets/geometry.js";
import { getAppLogger } from "@/background/log.js";
import { loadAppSettings } from "@/background/settings.js";
import { BrowserWindow, dialog, WebContents } from "electron";

const jpegQuality = 85;

export function exportCapturePNG(webContents: WebContents, rect: Rect): Promise<string | null> {
  return exportCaptureImage(webContents, rect, "png");
}

export function exportCaptureJPEG(webContents: WebContents, rect: Rect): Promise<string | null> {
  return exportCaptureImage(webContents, rect, "jpeg");
}

async function exportCaptureImage(
  webContents: WebContents,
  rect: Rect,
  ext: string,
): Promise<string | null> {
  const zoomLevel = webContents.getZoomFactor();
  getAppLogger().info(`exportCaptureImage rect=${rect} zoom=${zoomLevel}`);
  const image = await webContents.capturePage({
    x: Math.floor(rect.x * zoomLevel),
    y: Math.floor(rect.y * zoomLevel),
    width: Math.floor(rect.width * zoomLevel),
    height: Math.floor(rect.height * zoomLevel),
  });
  const win = BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error("Failed to open dialog by unexpected error.");
  }
  const appSettings = await loadAppSettings();
  const ret = await dialog.showSaveDialog(win, {
    defaultPath: path.dirname(appSettings.lastImageExportFilePath),
    properties: ["createDirectory", "showOverwriteConfirmation"],
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (ret.canceled || !ret.filePath) {
    return null;
  }
  const filePath = ret.filePath;
  switch (ext) {
    case "png":
      fs.promises.writeFile(filePath, image.toPNG());
      break;
    case "jpeg":
      fs.promises.writeFile(filePath, image.toJPEG(jpegQuality));
      break;
  }
  return filePath;
}
