import { shell } from "electron";
import { readStatus } from "@/background/version.js";
import { howToUseWikiPageURL, websiteURL } from "@/common/links/github.js";

export function openWebsite(): void {
  shell.openExternal(websiteURL);
}

export function openHowToUse(): void {
  shell.openExternal(howToUseWikiPageURL);
}

export async function openLatestReleasePage() {
  const status = await readStatus();
  if (!status.knownReleases) {
    throw new Error("No known releases");
  }
  shell.openExternal(status.knownReleases.latest.link);
}

export async function openStableReleasePage() {
  const status = await readStatus();
  if (!status.knownReleases) {
    throw new Error("No known releases");
  }
  shell.openExternal(status.knownReleases.stable.link);
}
