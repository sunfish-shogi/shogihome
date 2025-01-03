import { BrowserWindow } from "electron";
import { createChildWindow } from "./child";

let win: BrowserWindow | null = null;

export function createLayoutManagerWindow(parent: BrowserWindow) {
  if (win) {
    win.focus();
    return;
  }
  win = createChildWindow("layout-manager", {}, parent, () => {
    win = null;
  });
}
