import { checkUpdates, checkUpdatesManually } from "@/background/version.js";
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

type MockParam = {
  knownStable?: string;
  knownLatest?: string;
  stable: string;
  latest: string;
  remoteFileName: string;
};

const server = {
  param: { stable: "", latest: "" } as MockParam,
  accessCount: 0,
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/stable");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(status.updatedMs).toBe(time23HoursAfter);
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
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/stable");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/stable");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/stable");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.0.4");
    expect(status.knownReleases?.latest.version).toBe("1.1.1");
    expect(status.knownReleases?.downloadedMs).toBe(time23HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
    const status = JSON.parse(fs.readFileSync(statusFilePath, "utf8")) as VersionStatus;
    expect(status.knownReleases?.stable.version).toBe("1.1.1");
    expect(status.knownReleases?.latest.version).toBe("1.2.0");
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(status.knownReleases?.downloadedMs).toBe(time25HoursAfter);
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
    expect(notify.mock.calls[0][1]).toBe("https://link/to/latest");
    expect(server.accessCount).toBe(1);
    expect(server.invalidCount).toBe(0);
  });
});
