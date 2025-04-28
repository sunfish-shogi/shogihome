import { BrowserWindow } from "electron";
import { createAuxiliaryWindow } from "./auxiliary.js";

let win: BrowserWindow | null = null;

export function createLayoutManagerWindow(parent: BrowserWindow) {
  if (win) {
    win.focus();
    return;
  }
  win = createAuxiliaryWindow("layout-manager", {}, parent, () => {
    win = null;
  });
}
