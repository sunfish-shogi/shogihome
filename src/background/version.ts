import fs from "node:fs";
import url from "node:url";
import path from "node:path";
import { Releases, VersionStatus } from "@/common/version.js";
import { isDevelopment, isTest } from "@/background/proc/env.js";
import { exists } from "@/background/helpers/file.js";
import { fetch } from "@/background/helpers/http.js";
import * as semver from "semver";
import { t } from "@/common/i18n/index.js";
import { getAppLogger } from "@/background/log.js";
import { getAppVersion, showNotification } from "@/background/helpers/electron.js";
import { ghRepository, ghioDomain } from "@/common/links/github.js";
import { writeFileAtomic } from "./file/atomic.js";
import { getAppPath } from "./proc/path-electron.js";

const minimumCheckIntervalMs = isDevelopment()
  ? 60 * 1000 // Dev: 1 minute
  : 24 * 60 * 60 * 1000; // Prd: 1 day

const userDir = getAppPath("userData");
const statusFilePath = path.join(userDir, "version.json");

const baseURL =
  isDevelopment() || isTest() ? "http://localhost:6173" : `https://${ghioDomain}/${ghRepository}/`;

function getReleaseURL() {
  switch (process.platform) {
    case "win32":
      return url.resolve(baseURL, "release-win.json");
    case "darwin":
      return url.resolve(baseURL, "release-mac.json");
    case "linux":
      return url.resolve(baseURL, "release-linux.json");
    default:
      return url.resolve(baseURL, "release.json");
  }
}

export async function readStatus(): Promise<VersionStatus> {
  if (await exists(statusFilePath)) {
    getAppLogger().debug("version.json exists");
    const data = await fs.promises.readFile(statusFilePath, "utf8");
    const status = JSON.parse(data) as VersionStatus;
    getAppLogger().debug(`last version check status: ${JSON.stringify(status)}}`);
    return status;
  }
  getAppLogger().debug("version.json not exists");
  return {
    updatedMs: 0,
  };
}

async function writeStatus(last: VersionStatus) {
  await writeFileAtomic(statusFilePath, JSON.stringify(last, null, " "));
}

function suggestUpdate(releases: Releases, last: VersionStatus) {
  const current = semver.clean(getAppVersion());
  if (!current) {
    throw new Error("failed to get current app version");
  }

  const stable = semver.clean(releases.stable.version);
  if (!stable) {
    throw new Error("failed to get stable app version");
  }
  const knownStable = last.knownReleases && semver.clean(last.knownReleases.stable.version);

  const latest = semver.clean(releases.latest.version);
  if (!latest) {
    throw new Error("failed to get latest app version");
  }
  const knownLatest = last.knownReleases && semver.clean(last.knownReleases.latest.version);

  const stablePreferred =
    (knownStable &&
      semver.major(current) === semver.major(knownStable) &&
      semver.minor(current) <= semver.minor(knownStable)) ||
    (!knownStable && semver.lte(current, stable));
  const stableUpdated = !knownStable || semver.gt(stable, knownStable);
  const stableNotInstalled = semver.gt(stable, current);
  if (stablePreferred && stableUpdated && stableNotInstalled) {
    getAppLogger().info(`new stable version released: ${stable}`);
    showNotification(t.shogiHome, t.stableVersionReleased("v" + stable));
    return;
  }

  const latestPreferred = !stablePreferred;
  const latestUpdated = !knownLatest || semver.gt(latest, knownLatest);
  const latestNotInstalled = semver.gt(latest, current);
  if (latestPreferred && latestUpdated && latestNotInstalled) {
    getAppLogger().info(`new latest version released: ${latest}`);
    showNotification(t.shogiHome, t.latestVersionReleased("v" + latest));
    return;
  }
}

export async function checkUpdates() {
  const last = await readStatus();

  // check new release
  if (
    !last.knownReleases?.downloadedMs ||
    Date.now() - last.knownReleases.downloadedMs >= minimumCheckIntervalMs
  ) {
    getAppLogger().debug(`check new release`);
    const releases = JSON.parse(await fetch(getReleaseURL())) as Releases;
    getAppLogger().debug(`release info fetched: ${JSON.stringify(releases)}}`);
    suggestUpdate(releases, last);
    last.knownReleases = {
      ...releases,
      downloadedMs: Date.now(),
    };
  }

  last.updatedMs = Date.now();
  await writeStatus(last);
}
