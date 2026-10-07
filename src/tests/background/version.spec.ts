import {
  checkUpdates,
  checkUpdatesManually,
  getKnownReleasePageURL,
} from "@/background/version.js";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { Releases, VersionStatus } from "@/common/version.js";
import { getAppPath } from "@/background/proc/path-electron.js";
import * as log from "@/background/log.js";
import * as electron from "@/background/helpers/electron.js";
import { Mocked } from "vitest";
import { getNopLogger } from "@/tests/mock/log.js";

vi.mock("@/background/log.js");

const mockLog = log as Mocked<typeof log>;

const statusFilePath = path.join(getAppPath("userData"), "version.json");

const lastUpdatedMs = 1000000000;
const time23HoursAfter = lastUpdatedMs + 23 * 60 * 60 * 1000;
const time25HoursAfter = lastUpdatedMs + 25 * 60 * 60 * 1000;
const oneDayMs = 24 * 60 * 60 * 1000;

function releaseLink(version: string): string {
  return `https://github.com/sunfish-shogi/shogihome/releases/tag/v${version}`;
}

type MockParam = {
  knownStable?: string;
  knownLatest?: string;
  stable: string;
  latest: string;
  remoteFileName: string;
  // バージョンごとの GitHub リリースの公開日時 (指定しない場合は十分に古い日時)
  publishedAt?: Record<string, string | null>;
  // バージョンごとの GitHub API のレスポンスの上書き
  apiOverride?: Record<string, Record<string, unknown>>;
};

const server = {
  param: { stable: "", latest: "" } as MockParam,
  accessCount: 0,
  apiAccessCount: 0,
  invalidCount: 0,
  close: () => {},
};

function reset(param: MockParam) {
  if (param.knownStable && param.knownLatest) {
    const status: VersionStatus = {
      knownReleases: {
        stable: {
          version: param.knownStable,
          tag: `v${param.knownStable}`,
          link: "https://link/to/stable",
        },
        latest: {
          version: param.knownLatest,
          tag: `v${param.knownLatest}`,
          link: "https://link/to/latest",
        },
        downloadedMs: lastUpdatedMs,
      },
      updatedMs: lastUpdatedMs,
    };
    fs.writeFileSync(statusFilePath, JSON.stringify(status));
  }
  server.param = param;
  server.accessCount = 0;
  server.apiAccessCount = 0;
  server.invalidCount = 0;
}

function setupServer() {
  const s = http.createServer((req, res) => {
    const releases: Releases = {
      stable: {
        version: server.param.stable,
        tag: `v${server.param.stable}`,
        link: "https://link/to/stable",
      },
      latest: {
        version: server.param.latest,
        tag: `v${server.param.latest}`,
        link: "https://link/to/latest",
      },
    };
    if (req.url === "/" + server.param.remoteFileName) {
      server.accessCount++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(releases));
      return;
    }
    const match = req.url?.match(/^\/api\/repos\/sunfish-shogi\/shogihome\/releases\/tags\/v(.+)$/);
    if (match) {
      server.apiAccessCount++;
      const version = decodeURIComponent(match[1]);
      const publishedAt = server.param.publishedAt?.[version];
      if (publishedAt === null) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          tag_name: `v${version}`,
          draft: false,
          published_at: publishedAt ?? "1970-01-01T00:00:00Z",
          ...server.param.apiOverride?.[version],
        }),
      );
      return;
    }
    server.invalidCount++;
    res.writeHead(404);
    res.end("not found");
  });
  s.listen(6173);
  server.close = () => {
    s.close();
  };
}

describe("version", () => {
  beforeAll(() => {
    setupServer();
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    mockLog.getAppLogger.mockReturnValue(getNopLogger());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
    fs.rmSync(statusFilePath, { recursive: true, force: true });
  });

  it("no_status_file/patch_update/stable", async () => {
    reset({
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("安定版 v1.0.4 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.0.4"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/patch_update/latest", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.1.1 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.1.1"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/known_updates", async () => {
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(1);
    expect(server.apiAccessCount).toBe(0); // 既知のバージョンは API で確認しない
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/patch_update/alpha_installed", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.2.0-alpha.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/skip_download", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time23HoursAfter);
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(0);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.3"); // not updated
    expect(status.knownReleases?.latest.version).toBe("1.1.0"); // not updated
    expect(status.knownReleases?.downloadedMs).toBe(lastUpdatedMs); // not updated
    expect(status.updatedMs).toBe(lastUpdatedMs); // not updated
  });

  it("status_file_exists/patch_update/only_stable", async () => {
    // 安定版が更新されたが最新版をインストールしているので通知しない。
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.1",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/patch_update/only_latest", async () => {
    // 最新版が更新されたが安定版をインストールしているので通知しない。
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.1",
      stable: "1.0.3",
      latest: "1.1.2",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.2");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.3");
    expect(status.knownReleases?.latest.version).toBe("1.1.2");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/minor_update/stable", async () => {
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.1.1",
      latest: "1.2.0",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.4");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("安定版 v1.1.1 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.1.1"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/minor_update/latest", async () => {
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.1.1",
      latest: "1.2.0",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.2.0 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.2.0"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("status_file_exists/minor_update/alpha_installed", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.1",
      stable: "1.1.1",
      latest: "1.2.0",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.2.0-alpha.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.2.0 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.2.0"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("mac", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-mac.json",
    });
    vi.stubGlobal("process", { platform: "darwin" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.1.1 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.1.1"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
  });

  it("linux", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-linux.json",
    });
    vi.stubGlobal("process", { platform: "linux" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.1.1 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.1.1"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
  });

  it("corrupted_status_file", async () => {
    reset({
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    // 破損した version.json は無視され、チェック後に上書きされる。
    fs.writeFileSync(statusFilePath, "{ broken json");
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("安定版 v1.0.4 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.0.4"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("unreadable_status_file", async () => {
    // 読み込み自体のエラーは一時的な障害の可能性があるため、ステータスを
    // リセットせずにエラーとする。
    reset({
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    fs.mkdirSync(statusFilePath); // ディレクトリにして読み込みエラーを起こす。
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await expect(checkUpdates(notify)).rejects.toThrow();
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(0);
    expect(server.invalidCount).toBe(0);
  });

  it("manual/known_update", async () => {
    // 自動チェックでは通知済みのバージョンでも、手動チェックでは再度通知する。
    // また、前回のダウンロードからの経過時間に関係なくダウンロードする。
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time23HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdatesManually(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("安定版 v1.0.4 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.0.4"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time23HoursAfter);
  });

  it("manual/minor_update/latest", async () => {
    // 安定版が現在のバージョンに追いついていても、最新版系列を使用している
    // 場合は新しい最新版を通知する。
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.1.1",
      latest: "1.2.0",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.1");
    const notify = vi.fn();
    await checkUpdatesManually(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.2.0 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.2.0"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("manual/no_updates", async () => {
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.1");
    const notify = vi.fn();
    await checkUpdatesManually(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新のバージョンを使用しています。");
    expect(notify.mock.calls[0][1]).toBeUndefined();
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
  });

  it("manual/corrupted_status_file", async () => {
    reset({
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
    });
    fs.writeFileSync(statusFilePath, "{ broken json");
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.1");
    const notify = vi.fn();
    await checkUpdatesManually(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新のバージョンを使用しています。");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("fallback", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release.json", // fallback to old release.json
    });
    vi.stubGlobal("process", { platform: "xxx" }); // unknown platform
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.1.1 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.1.1"));
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
  });

  it("cooldown/latest", async () => {
    // 公開から 4 日経過していないリリースは通知しない。
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.3",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
      publishedAt: { "1.1.1": new Date(time25HoursAfter - 3 * oneDayMs).toISOString() },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(1);
    expect(server.apiAccessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    let status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.3");
    expect(status.knownReleases?.latest.version).toBe("1.1.0"); // not accepted yet
    expect(status.knownReleases?.downloadedMs).toBe(lastUpdatedMs); // not updated

    // 公開から 4 日経過したら通知する。
    vi.setSystemTime(time25HoursAfter + 1 * oneDayMs);
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.1.1 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.1.1"));
    expect(server.accessCount).toBe(2);
    expect(server.apiAccessCount).toBe(2);
    status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.3");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.link).toBe(releaseLink("1.1.1"));
  });

  it("cooldown/no_status_file", async () => {
    // 既知のリリース情報が無い状態で公開直後のリリースがある場合は何も保存しない。
    reset({
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
      publishedAt: { "1.0.4": new Date(time25HoursAfter - oneDayMs).toISOString() },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.accessCount).toBe(1);
    expect(server.apiAccessCount).toBe(1);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases).toBeUndefined();
    expect(status.updatedMs).toBe(time25HoursAfter);
  });

  it("cooldown/release_not_found", async () => {
    // GitHub にリリースが存在しない場合はエラーとし、通知しない。
    // 次回のチェックまでは一定時間を空ける。
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.4",
      latest: "1.1.0",
      remoteFileName: "release-win.json",
      publishedAt: { "1.0.4": null },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.3");
    const notify = vi.fn();
    await expect(checkUpdates(notify)).rejects.toThrow("404");
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.apiAccessCount).toBe(1);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.3");
    expect(status.knownReleases?.latest.version).toBe("1.1.0");
    expect(status.knownReleases?.downloadedMs).toBe(lastUpdatedMs); // not updated
    expect(status.updatedMs).toBe(time25HoursAfter);

    vi.setSystemTime(time25HoursAfter + 23 * 60 * 60 * 1000);
    await checkUpdates(notify);
    expect(server.accessCount).toBe(1); // skipped
    expect(server.apiAccessCount).toBe(1); // skipped
  });

  it("cooldown/throttle_without_known_releases", async () => {
    // 既知のリリース情報が無い状態でも、次回のチェックまでは一定時間を空ける。
    reset({
      stable: "1.0.4",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
      publishedAt: { "1.0.4": new Date(time25HoursAfter - oneDayMs).toISOString() },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(server.accessCount).toBe(1);
    expect(server.apiAccessCount).toBe(1);

    vi.setSystemTime(time25HoursAfter + 60 * 60 * 1000);
    await checkUpdates(notify);
    expect(server.accessCount).toBe(1); // skipped
    expect(server.apiAccessCount).toBe(1); // skipped

    vi.setSystemTime(time25HoursAfter + 3 * oneDayMs);
    await checkUpdates(notify);
    expect(server.accessCount).toBe(2);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("安定版 v1.0.4 がリリースされました！");
  });

  it("cooldown/manual/verification_error", async () => {
    // 手動チェックで確認に失敗した場合は「最新のバージョンを使用しています」とせずにエラーとする。
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.3",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
      publishedAt: { "1.1.1": null },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await expect(checkUpdatesManually(notify)).rejects.toThrow("404");
    expect(notify.mock.calls).toHaveLength(0);
  });

  it("cooldown/manual", async () => {
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.3",
      latest: "1.1.1",
      remoteFileName: "release-win.json",
      publishedAt: { "1.1.1": new Date(time25HoursAfter - oneDayMs).toISOString() },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.0");
    const notify = vi.fn();
    await checkUpdatesManually(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新のバージョンを使用しています。");
    expect(server.apiAccessCount).toBe(1);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.latest.version).toBe("1.1.0");
  });

  it("cooldown/minor_update", async () => {
    // マイナーアップデートでは旧最新版が安定版に昇格し、新しい最新版が追加される。
    // 新しい最新版がクールダウン中の間は安定版の昇格も受け入れず、系列の判定を維持する。
    reset({
      knownStable: "1.0.4",
      knownLatest: "1.1.1",
      stable: "1.1.1",
      latest: "1.2.0",
      remoteFileName: "release-win.json",
      publishedAt: { "1.2.0": new Date(time25HoursAfter - oneDayMs).toISOString() },
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.1.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(0);
    expect(server.apiAccessCount).toBe(1); // 1.1.1 は既知なので確認しない
    let status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBe(lastUpdatedMs); // not updated

    // クールダウンが明けたら最新版を通知する。
    vi.setSystemTime(time25HoursAfter + 3 * oneDayMs);
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("最新版 v1.2.0 がリリースされました！");
    expect(notify.mock.calls[0][1]).toBe(releaseLink("1.2.0"));
    status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
  });

  it("cooldown/same_version", async () => {
    // 安定版と最新版が同じバージョンの場合は 1 回だけ確認する。
    reset({
      stable: "1.0.4",
      latest: "1.0.4",
      remoteFileName: "release-win.json",
    });
    vi.stubGlobal("process", { platform: "win32" });
    vi.setSystemTime(time25HoursAfter);
    vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.1");
    const notify = vi.fn();
    await checkUpdates(notify);
    expect(notify.mock.calls).toHaveLength(1);
    expect(notify.mock.calls[0][0]).toBe("安定版 v1.0.4 がリリースされました！");
    expect(server.apiAccessCount).toBe(1);
  });

  for (const [name, override] of [
    ["draft", { draft: true }],
    ["unpublished", { published_at: null }],
  ] as const) {
    it(`cooldown/not_published/${name}`, async () => {
      reset({
        knownStable: "1.0.3",
        knownLatest: "1.1.0",
        stable: "1.0.4",
        latest: "1.1.0",
        remoteFileName: "release-win.json",
        apiOverride: { "1.0.4": override },
      });
      vi.stubGlobal("process", { platform: "win32" });
      vi.setSystemTime(time25HoursAfter);
      vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.3");
      const notify = vi.fn();
      await checkUpdates(notify);
      expect(notify.mock.calls).toHaveLength(0);
      expect(server.apiAccessCount).toBe(1);
      const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
      expect(status.knownReleases?.stable.version).toBe("1.0.3");
      expect(status.knownReleases?.latest.version).toBe("1.1.0");
    });
  }

  for (const [name, override, message] of [
    ["tag_mismatch", { tag_name: "v9.9.9" }, "tag mismatch"],
    ["invalid_published_at", { published_at: "invalid" }, "invalid published_at"],
  ] as const) {
    it(`cooldown/verification_error/${name}`, async () => {
      reset({
        knownStable: "1.0.3",
        knownLatest: "1.1.0",
        stable: "1.0.4",
        latest: "1.1.0",
        remoteFileName: "release-win.json",
        apiOverride: { "1.0.4": override },
      });
      vi.stubGlobal("process", { platform: "win32" });
      vi.setSystemTime(time25HoursAfter);
      vi.spyOn(electron, "getAppVersion").mockReturnValue("v1.0.3");
      const notify = vi.fn();
      await expect(checkUpdates(notify)).rejects.toThrow(message);
      expect(notify.mock.calls).toHaveLength(0);
      expect(server.apiAccessCount).toBe(1);
      const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
      expect(status.knownReleases?.stable.version).toBe("1.0.3");
      expect(status.knownReleases?.latest.version).toBe("1.1.0");
    });
  }

  it("known_release_page_url", async () => {
    // 保存されているリンクは使わず、バージョン番号から URL を生成する。
    reset({
      knownStable: "1.0.3",
      knownLatest: "1.1.0",
      stable: "1.0.3",
      latest: "1.1.0",
      remoteFileName: "release-win.json",
    });
    await expect(getKnownReleasePageURL("stable")).resolves.toBe(releaseLink("1.0.3"));
    await expect(getKnownReleasePageURL("latest")).resolves.toBe(releaseLink("1.1.0"));
  });
});
