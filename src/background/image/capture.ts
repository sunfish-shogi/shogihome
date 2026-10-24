import fs from "node:fs";
import path from "node:path";
import { Rect } from "@/common/assets/geometry.js";
import { getAppLogger } from "@/background/log.js";
import { loadAppSettings } from "@/background/settings.js";
import {
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  NativeImage,
  WebContents,
} from "electron";

const jpegQuality = 85;

export function exportCapturePNG(webContents: WebContents, rect: Rect): Promise<string | null> {
  return exportCaptureImage(webContents, rect, "png");
}

export function exportCaptureJPEG(webContents: WebContents, rect: Rect): Promise<string | null> {
  return exportCaptureImage(webContents, rect, "jpeg");
}

export async function copyCaptureToClipboard(webContents: WebContents, rect: Rect): Promise<void> {
  const image = await capture(webContents, rect);
  const png = new Blob([new Uint8Array(image.toPNG())], { type: "image/png" });
  await clipboard.write([new ClipboardItem({ "image/png": png })]);
}

function capture(webContents: WebContents, rect: Rect): Promise<NativeImage> {
  const zoomLevel = webContents.getZoomFactor();
  getAppLogger().info(`capture rect=${rect} zoom=${zoomLevel}`);
  return webContents.capturePage({
    x: Math.floor(rect.x * zoomLevel),
    y: Math.floor(rect.y * zoomLevel),
    width: Math.floor(rect.width * zoomLevel),
    height: Math.floor(rect.height * zoomLevel),
  });
}

async function exportCaptureImage(
  webContents: WebContents,
  rect: Rect,
  ext: string,
): Promise<string | null> {
  const image = await capture(webContents, rect);
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
      await fs.promises.writeFile(filePath, image.toPNG());
      break;
    case "jpeg":
      await fs.promises.writeFile(filePath, image.toJPEG(jpegQuality));
      break;
  }
  return filePath;
}
