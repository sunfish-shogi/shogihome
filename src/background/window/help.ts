import { shell } from "electron";
import { getKnownReleasePageURL } from "@/background/version.js";
import { validateWebURL } from "@/background/helpers/url.js";
import { howToUseWikiPageURL, websiteURL } from "@/common/links/github.js";

export function openWebsite(): void {
  shell.openExternal(websiteURL);
}

export function openHowToUse(): void {
  shell.openExternal(howToUseWikiPageURL);
}

export async function openLatestReleasePage() {
  const link = await getKnownReleasePageURL("latest");
  validateWebURL(link);
  shell.openExternal(link);
}

export async function openStableReleasePage() {
  const link = await getKnownReleasePageURL("stable");
  validateWebURL(link);
  shell.openExternal(link);
}
