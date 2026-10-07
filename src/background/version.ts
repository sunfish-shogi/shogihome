import fs from "node:fs";
import path from "node:path";
import { Release, Releases, VersionStatus } from "@/common/version.js";
import { isDevelopment, isTest } from "@/background/proc/env.js";
import { exists } from "@/background/helpers/file.js";
import { fetch } from "@/background/helpers/http.js";
import * as semver from "semver";
import { t } from "@/common/i18n/index.js";
import { getAppLogger } from "@/background/log.js";
import { getAppVersion } from "@/background/helpers/electron.js";
import { ghAccount, ghRepository, ghioDomain, releasePageURL } from "@/common/links/github.js";
import { writeFileAtomic } from "./file/atomic.js";
import { getAppPath } from "./proc/path-electron.js";

const minimumCheckIntervalMs = isDevelopment()
  ? 60 * 1000 // Dev: 1 minute
  : 24 * 60 * 60 * 1000; // Prd: 1 day

const userDir = getAppPath("userData");
const statusFilePath = path.join(userDir, "version.json");

// GitHub リリースの公開からアプリ内で通知するまでの待機期間。
// リポジトリが乗っ取られて不正なリリースが作られた場合に、利用者へ通知される前に
// 発見・削除できる猶予を設けるためのもの。
const releaseCooldownMs = 4 * 24 * 60 * 60 * 1000; // 4 days

const baseURL =
  isDevelopment() || isTest() ? "http://localhost:6173" : `https://${ghioDomain}/${ghRepository}/`;

const apiBaseURL =
  isDevelopment() || isTest() ? "http://localhost:6173/api/" : "https://api.github.com/";

function getReleaseURL() {
  switch (process.platform) {
    case "win32":
      return new URL("release-win.json", baseURL).href;
    case "darwin":
      return new URL("release-mac.json", baseURL).href;
    case "linux":
      return new URL("release-linux.json", baseURL).href;
    default:
      return new URL("release.json", baseURL).href;
  }
}

export async function readStatus(): Promise<VersionStatus> {
  if (await exists(statusFilePath)) {
    getAppLogger().debug("version.json exists");
    const data = await fs.promises.readFile(statusFilePath, "utf8");
    try {
      const status = JSON.parse(data) as VersionStatus;
      if (!status || typeof status !== "object") {
        throw new Error("unexpected data format");
      }
      getAppLogger().debug(`last version check status: ${JSON.stringify(status)}}`);
      return status;
    } catch (e) {
      // 破損した version.json は無視して、次回の書き込みで上書きする。
      // 読み込み自体のエラーは一時的な障害の可能性があるためここでは握りつぶさない。
      getAppLogger().warn(`failed to parse version.json: ${e}`);
    }
  } else {
    getAppLogger().debug("version.json not exists");
  }
  return {
    updatedMs: 0,
  };
}

async function writeStatus(last: VersionStatus) {
  await writeFileAtomic(statusFilePath, JSON.stringify(last, null, " "));
}

function versionToTag(version: string): string {
  return "v" + version;
}

/**
 * 正規化したバージョン番号からリリース情報を組み立てる。
 * タグとリンクはリリース情報ファイルの値を使わず、バージョン番号から生成する。
 */
function buildRelease(version: string): Release {
  const tag = versionToTag(version);
  return { version, tag, link: releasePageURL(tag) };
}

function cleanVersion(version: unknown, name: string): string {
  const cleaned = typeof version === "string" ? semver.clean(version) : null;
  if (!cleaned) {
    throw new Error(`failed to get ${name} app version`);
  }
  return cleaned;
}

type GitHubRelease = {
  tag_name?: unknown;
  draft?: unknown;
  published_at?: unknown;
};

/**
 * GitHub API で指定したバージョンのリリースが公開から一定期間を経過しているかを調べる。
 * 未公開またはクールダウン中の場合は false を返す。
 * リリースが存在しない場合や API の呼び出しに失敗した場合は例外を投げる。
 */
async function isReleaseMatured(version: string): Promise<boolean> {
  const tag = versionToTag(version);
  const apiURL = new URL(
    `repos/${ghAccount}/${ghRepository}/releases/tags/${encodeURIComponent(tag)}`,
    apiBaseURL,
  ).href;
  const release = JSON.parse(await fetch(apiURL)) as GitHubRelease;
  if (!release || typeof release !== "object") {
    throw new Error(`failed to verify release ${tag}: unexpected data format`);
  }
  if (release.tag_name !== tag) {
    throw new Error(`failed to verify release ${tag}: tag mismatch: ${release.tag_name}`);
  }
  if (release.draft !== false || release.published_at === null) {
    getAppLogger().info(`release ${tag} is not published yet`);
    return false;
  }
  const publishedMs =
    typeof release.published_at === "string" ? Date.parse(release.published_at) : NaN;
  if (isNaN(publishedMs)) {
    throw new Error(
      `failed to verify release ${tag}: invalid published_at: ${release.published_at}`,
    );
  }
  if (Date.now() - publishedMs < releaseCooldownMs) {
    getAppLogger().info(
      `release ${tag} is in cooldown period: published_at=${release.published_at}`,
    );
    return false;
  }
  return true;
}

/**
 * 取得したリリース情報を受け入れ可能か判定し、受け入れ可能であれば正規化したリリース情報を返す。
 * 既知のバージョンに含まれないものは、GitHub API で公開から一定期間が経過していることを確認する。
 * 安定版と最新版のどちらか一方でも未公開またはクールダウン中の場合は undefined を返す。
 * 確認自体に失敗した場合は例外を投げる。
 * 一方だけを受け入れると、安定版/最新版の系列の判定が狂って通知が漏れる可能性があるため、
 * 両方が確認できるまで既知の情報を維持する。
 */
async function acceptReleases(
  fetched: Releases,
  known: Releases | undefined,
): Promise<Releases | undefined> {
  const stable = cleanVersion(fetched.stable?.version, "stable");
  const latest = cleanVersion(fetched.latest?.version, "latest");
  const knownVersions = new Set<string>();
  for (const release of [known?.stable, known?.latest]) {
    const version = typeof release?.version === "string" ? semver.clean(release.version) : null;
    if (version) {
      knownVersions.add(version);
    }
  }
  for (const version of new Set([stable, latest])) {
    if (!knownVersions.has(version) && !(await isReleaseMatured(version))) {
      return;
    }
  }
  return { stable: buildRelease(stable), latest: buildRelease(latest) };
}

async function fetchReleases(last: VersionStatus): Promise<Releases | undefined> {
  const fetched = JSON.parse(await fetch(getReleaseURL())) as Releases;
  getAppLogger().debug(`release info fetched: ${JSON.stringify(fetched)}}`);
  if (!fetched || typeof fetched !== "object") {
    throw new Error("unexpected data format");
  }
  const accepted = await acceptReleases(fetched, last.knownReleases);
  getAppLogger().debug(`accepted release info: ${JSON.stringify(accepted)}}`);
  return accepted;
}

function suggestUpdate(
  releases: Releases,
  last: VersionStatus,
  notify: (message: string, url?: string) => void,
  // 通知済みのバージョンでも再度通知するかどうか (手動チェック用)
  renotify = false,
): boolean {
  const current = semver.clean(getAppVersion());
  if (!current) {
    throw new Error("failed to get current app version");
  }

  const stable = cleanVersion(releases.stable.version, "stable");
  const knownStable = last.knownReleases && semver.clean(last.knownReleases.stable.version);

  const latest = cleanVersion(releases.latest.version, "latest");
  const knownLatest = last.knownReleases && semver.clean(last.knownReleases.latest.version);

  const stablePreferred =
    (knownStable &&
      semver.major(current) === semver.major(knownStable) &&
      semver.minor(current) <= semver.minor(knownStable)) ||
    (!knownStable && semver.lte(current, stable));
  const stableUpdated = renotify || !knownStable || semver.gt(stable, knownStable);
  const stableNotInstalled = semver.gt(stable, current);
  if (stablePreferred && stableUpdated && stableNotInstalled) {
    getAppLogger().info(`new stable version released: ${stable}`);
    notify(t.stableVersionReleased("v" + stable), releases.stable.link);
    return true;
  }

  const latestPreferred = !stablePreferred;
  const latestUpdated = renotify || !knownLatest || semver.gt(latest, knownLatest);
  const latestNotInstalled = semver.gt(latest, current);
  if (latestPreferred && latestUpdated && latestNotInstalled) {
    getAppLogger().info(`new latest version released: ${latest}`);
    notify(t.latestVersionReleased("v" + latest), releases.latest.link);
    return true;
  }

  return false;
}

export async function checkUpdates(notify: (message: string, url?: string) => void) {
  const last = await readStatus();

  // 前回のチェックから一定時間が経過していなければ何もしない。
  // リリース情報を受け入れられなかった場合や失敗した場合も含めて、チェックの間隔を空ける。
  if (Date.now() - last.updatedMs < minimumCheckIntervalMs) {
    getAppLogger().debug(`skip checking new release`);
    return;
  }

  // check new release
  getAppLogger().debug(`check new release`);
  last.updatedMs = Date.now();
  try {
    const releases = await fetchReleases(last);
    if (releases) {
      suggestUpdate(releases, last, notify);
      last.knownReleases = releases;
    }
  } finally {
    await writeStatus(last);
  }
}

export async function checkUpdatesManually(notify: (message: string, url?: string) => void) {
  const last = await readStatus();

  getAppLogger().info("check new release manually");
  const releases = await fetchReleases(last);

  // 手動チェックでは通知済みのバージョンであっても再度通知する。
  // ただし、系列 (安定版/最新版) の判定には既知のリリース情報をそのまま使う。
  const suggested = releases && suggestUpdate(releases, last, notify, true);
  if (!suggested) {
    notify(t.youAreUsingTheLatestVersion);
  }

  if (releases) {
    last.knownReleases = releases;
  }
  last.updatedMs = Date.now();
  await writeStatus(last);
}

/**
 * 既知のリリースのページの URL を返す。
 * 保存されているリンクは使わず、バージョン番号から生成する。
 */
export async function getKnownReleasePageURL(name: "stable" | "latest"): Promise<string> {
  const status = await readStatus();
  if (!status.knownReleases) {
    throw new Error("No known releases");
  }
  return buildRelease(cleanVersion(status.knownReleases[name]?.version, name)).link;
}
