import { install, uninstall } from "@github/hotkey";

export function installHotKey(elem: HTMLElement) {
  for (const target of elem.querySelectorAll("[data-hotkey]")) {
    install(target as HTMLElement);
  }
}

export function uninstallHotKey(elem: HTMLElement) {
  for (const target of elem.querySelectorAll("[data-hotkey]")) {
    uninstall(target as HTMLElement);
  }
}
