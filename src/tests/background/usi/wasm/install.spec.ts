// @vitest-environment node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  cancelEnginePackageInstall,
  cleanupEnginePackagesDir,
  fetchEnginePackageLicenses,
  getEngineIndex,
  getEnginePackagesDir,
  installEnginePackage,
  listInstalledEnginePackages,
  setEngineIndexForTesting,
  setFetchForTesting,
  setLicenseFetchTimeoutForTesting,
  uninstallEnginePackage,
} from "@/background/usi/wasm/install.js";
import * as usi from "@/background/usi/index.js";
import * as settings from "@/background/settings.js";
import { emptyUSIEngine, getPredefinedUSIEngineTag, USIEngines } from "@/common/settings/usi.js";
import {
  ENGINE_INDEX_FORMAT,
  ENGINE_PACKAGE_INSTALL_CANCELED,
  EnginePackageFile,
  parseEngineIndex,
} from "@/common/wasm-engine/package.js";
import { PUBLIC_ENGINES_DIR } from "@plugins/builtin_engines.js";
import * as log from "@/background/log.js";
import { getNopLogger } from "@/tests/mock/log.js";
import { Mocked } from "vitest";

vi.mock("electron", () => ({ net: { fetch: vi.fn() } }));
vi.mock("@/background/log.js");
vi.mock("@/background/helpers/electron.js", () => ({ getAppVersion: () => "0.0.0-test" }));
vi.mock("@/background/usi/index.js");
vi.mock("@/background/settings.js");

const mockUSI = usi as Mocked<typeof usi>;
const mockSettings = settings as Mocked<typeof settings>;
const mockLog = log as Mocked<typeof log>;

const ENGINE_ID = "sunfish4-lite";

// テスト用の配信物として、リポジトリにある本家のエンジンの成果物を使う。
// 同梱の一覧 (engine-index.json) には依存せず、テスト用の一覧をここから組み立てる。
const ENGINE_DIR = path.join(PUBLIC_ENGINES_DIR, ENGINE_ID);
const PACKAGE_URL = `https://engines.example.com/${ENGINE_ID}/v1/`;

type Server = {
  index: unknown;
  requested: string[];
  // 差し替える応答の内容 (URL の末尾で照合する)。
  overrides: Map<string, Buffer | (() => Response)>;
};

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.split("/").some((segment) => segment.startsWith(".")))
    .sort();
}

function buildIndex() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, "engine.json"), "utf8"));
  return {
    format: ENGINE_INDEX_FORMAT,
    engines: [
      {
        id: ENGINE_ID,
        version: "v1",
        name: manifest.name,
        author: manifest.author,
        licenses: manifest.licenses.map((license: { spdx: string }) => license.spdx),
        packageURL: PACKAGE_URL,
        files: listFiles(ENGINE_DIR).map((file) => {
          const data = fs.readFileSync(path.join(ENGINE_DIR, file));
          return {
            path: file,
            sha256: crypto.createHash("sha256").update(data).digest("hex"),
            size: data.byteLength,
          };
        }),
      },
    ],
  };
}

function setupServer(): Server {
  const server: Server = {
    index: buildIndex(),
    requested: [],
    overrides: new Map(),
  };
  setFetchForTesting(async (url) => {
    server.requested.push(url);
    for (const [suffix, data] of server.overrides) {
      if (url.endsWith(suffix)) {
        return typeof data === "function" ? data() : new Response(new Uint8Array(data));
      }
    }
    const file = path.join(ENGINE_DIR, url.substring(PACKAGE_URL.length));
    if (!url.startsWith(PACKAGE_URL) || !fs.existsSync(file)) {
      return new Response("not found", { status: 404 });
    }
    return new Response(new Uint8Array(fs.readFileSync(file)));
  });
  return server;
}

// 配信する engine.json を書き換える。一覧の sha256 と大きさも合わせて書き換える。
// 書き換えた一覧は useIndex で使い始める。
function replaceManifest(server: Server, modify: (manifest: Record<string, unknown>) => void) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, "engine.json"), "utf8"));
  modify(manifest);
  const data = Buffer.from(JSON.stringify(manifest));
  const index = server.index as { engines: { files: EnginePackageFile[] }[] };
  const entry = index.engines[0].files.find((file) => file.path === "engine.json")!;
  entry.sha256 = crypto.createHash("sha256").update(data).digest("hex");
  entry.size = data.byteLength;
  server.overrides.set("/engine.json", data);
}

function useIndex(server: Server) {
  setEngineIndexForTesting(server.index);
}

describe("background/usi/wasm/install", () => {
  let server: Server;

  beforeEach(async () => {
    await fs.promises.rm(getEnginePackagesDir(), { recursive: true, force: true });
    mockLog.getAppLogger.mockReturnValue(getNopLogger());
    server = setupServer();
    vi.restoreAllMocks();
    mockUSI.isEnginePathInUse.mockReturnValue(false);
    mockSettings.loadUSIEngines.mockResolvedValue(new USIEngines());
    // 一覧を読み直す (前のテストで書き換えたものを持ち越さない)。
    useIndex(server);
    mockUSI.getUSIEngineInfo.mockImplementation(async (enginePath) => ({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/test",
      // エンジンが id name で返す名前。表示名にはマニフェストの name が使われる。
      name: "Sunfish4",
      path: enginePath,
      options: {
        MaxDepth: { name: "MaxDepth", type: "spin", order: 100, default: 64 },
        USI_Hash: { name: "USI_Hash", type: "spin", order: 1, default: 32 },
      },
    }));
  });

  // 一覧はアプリに同梱したものを使い、オンラインでは取得しない。
  it("getEngineIndex/bundled", () => {
    setEngineIndexForTesting(undefined);
    const bundled = JSON.parse(
      fs.readFileSync(path.resolve("src/background/usi/wasm/engine-index.json"), "utf8"),
    );
    expect(getEngineIndex()).toEqual(parseEngineIndex(bundled));
    expect(server.requested).toEqual([]);
  });

  it("getEngineIndex/forTesting", () => {
    expect(getEngineIndex().engines.map((e) => e.packageURL)).toEqual([PACKAGE_URL]);
  });

  it("install", async () => {
    const licenses = await fetchEnginePackageLicenses(ENGINE_ID);
    expect(licenses[0].spdx).toBe("MIT");
    expect(licenses[0].text).toContain("MIT");

    const progress: number[] = [];
    const result = await installEnginePackage(ENGINE_ID, 10, (p) => progress.push(p.receivedBytes));
    expect(result.installed.id).toBe(ENGINE_ID);
    expect(result.installed.broken).toBeFalsy();
    expect(path.basename(result.installed.enginePath)).toBe("engine.json");
    for (const file of result.installed.files) {
      const installed = path.join(path.dirname(result.installed.enginePath), file.path);
      const original = path.join(ENGINE_DIR, file.path);
      expect(fs.readFileSync(installed).equals(fs.readFileSync(original))).toBeTruthy();
    }
    expect(progress[progress.length - 1]).toBe(
      result.installed.files.reduce((sum, file) => sum + file.size, 0),
    );

    // プリセットは使わず、エンジンが申告したオプションのまま 1 件だけを登録する。
    expect(result.engines).toHaveLength(1);
    const [engine] = result.engines;
    expect(mockUSI.getUSIEngineInfo).toHaveBeenCalledWith(result.installed.enginePath, 10);
    expect(engine.name).toBe("Sunfish4-Lite");
    expect(engine.defaultName).toBe("Sunfish4-Lite");
    expect(engine.path).toBe(result.installed.enginePath);
    expect(engine.options.MaxDepth).toEqual({
      name: "MaxDepth",
      type: "spin",
      order: 100,
      default: 64,
    });
    // 全てのプリセットのタグを OR で集めたものに「ダウンロード」のタグを加える。
    // (Sunfish4-Lite は最初のプリセットだけが game と research を持つ)
    expect(engine.tags).toEqual([
      getPredefinedUSIEngineTag("game"),
      getPredefinedUSIEngineTag("research"),
      getPredefinedUSIEngineTag("download"),
    ]);

    const list = await listInstalledEnginePackages();
    expect(list.map((p) => p.id)).toEqual([ENGINE_ID]);
  });

  it("reinstall/reuseLocalFiles", async () => {
    await installEnginePackage(ENGINE_ID, 10, () => {});
    server.requested = [];
    // 手元のファイルが壊れていても修復できる。
    const [installed] = await listInstalledEnginePackages();
    const dir = path.dirname(installed.enginePath);
    fs.writeFileSync(path.join(dir, "sunfish4.wasm"), "broken");
    expect((await listInstalledEnginePackages())[0].broken).toBeTruthy();

    await installEnginePackage(ENGINE_ID, 10, () => {});
    expect((await listInstalledEnginePackages())[0].broken).toBeFalsy();
    // 内容が同じファイルは取り直さず、壊れたものだけを取得する。
    expect(server.requested.map((url) => path.basename(url))).toEqual(["sunfish4.wasm"]);
  });

  it("hashMismatch", async () => {
    server.overrides.set("/sunfish4.js", Buffer.from("console.log('evil');"));
    await expect(installEnginePackage(ENGINE_ID, 10, () => {})).rejects.toThrow(/sunfish4\.js/);
    // 何もインストールされず、一時ディレクトリも残らない。
    expect(await listInstalledEnginePackages()).toEqual([]);
    expect(fs.readdirSync(getEnginePackagesDir())).toEqual([]);
  });

  it("uninstall", async () => {
    const { installed } = await installEnginePackage(ENGINE_ID, 10, () => {});
    mockUSI.isEnginePathInUse.mockReturnValue(true);
    await expect(uninstallEnginePackage(installed.id, installed.version)).rejects.toThrow();
    mockUSI.isEnginePathInUse.mockReturnValue(false);
    await uninstallEnginePackage(installed.id, installed.version);
    expect(await listInstalledEnginePackages()).toEqual([]);
    await expect(uninstallEnginePackage("..", "x")).rejects.toThrow(/invalid/);
  });

  // 画面を開いた後に別のインスタンスが保存した参照も、削除の時点で確かめる。
  it("uninstall/referencedBySavedList", async () => {
    const { installed, engines } = await installEnginePackage(ENGINE_ID, 10, () => {});
    const saved = new USIEngines();
    saved.addEngine(engines[0]);
    mockSettings.loadUSIEngines.mockResolvedValue(saved);
    await expect(uninstallEnginePackage(installed.id, installed.version)).rejects.toThrow();
    expect((await listInstalledEnginePackages()).map((p) => p.id)).toEqual([ENGINE_ID]);
  });

  // シンボリックリンクを経由したパスで登録されていても、参照されているとみなす。
  it("uninstall/referencedThroughSymlink", async () => {
    const { installed, engines } = await installEnginePackage(ENGINE_ID, 10, () => {});
    const dir = path.dirname(installed.enginePath);
    const link = `${getEnginePackagesDir()}-link`;
    fs.rmSync(link, { force: true });
    fs.symlinkSync(dir, link);
    const saved = new USIEngines();
    saved.addEngine({ ...engines[0], path: path.join(link, "engine.json") });
    mockSettings.loadUSIEngines.mockResolvedValue(saved);
    await expect(uninstallEnginePackage(installed.id, installed.version)).rejects.toThrow();
    expect(fs.existsSync(dir)).toBeTruthy();
    fs.rmSync(link, { force: true });
  });

  // ライセンスを申告していないパッケージは、ライセンスの表示もインストールもしない。
  it("licenses/notDeclared", async () => {
    replaceManifest(server, (manifest) => delete manifest.licenses);
    useIndex(server);
    await expect(fetchEnginePackageLicenses(ENGINE_ID)).rejects.toThrow(
      /does not declare licenses/,
    );
    await expect(installEnginePackage(ENGINE_ID, 10, () => {})).rejects.toThrow(
      /does not declare licenses/,
    );
    expect(await listInstalledEnginePackages()).toEqual([]);
  });

  // マニフェストのライセンスが一覧の申告と違うパッケージも扱わない。
  it("licenses/mismatch", async () => {
    replaceManifest(server, (manifest) => {
      (manifest.licenses as { spdx: string }[])[0].spdx = "GPL-3.0-or-later";
    });
    useIndex(server);
    await expect(fetchEnginePackageLicenses(ENGINE_ID)).rejects.toThrow(/do not match/);
    await expect(installEnginePackage(ENGINE_ID, 10, () => {})).rejects.toThrow(/do not match/);
  });

  // 置き換えに失敗した場合は古いものを戻す。
  it("reinstall/restoreOnFailure", async () => {
    await installEnginePackage(ENGINE_ID, 10, () => {});
    const rename = fs.promises.rename;
    vi.spyOn(fs.promises, "rename").mockImplementation(async (src, dest) => {
      if (path.basename(String(src)).startsWith(".tmp-")) {
        throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
      }
      return rename(src, dest);
    });
    await expect(installEnginePackage(ENGINE_ID, 10, () => {})).rejects.toThrow(/cross-device/);
    vi.restoreAllMocks();
    const list = await listInstalledEnginePackages();
    expect(list.map((p) => p.id)).toEqual([ENGINE_ID]);
    expect(list[0].broken).toBeFalsy();
    expect(fs.readdirSync(getEnginePackagesDir())).toEqual([
      path.basename(path.dirname(list[0].enginePath)),
    ]);
  });

  // 全てのファイルを取得し終えた後、置く前にキャンセルされた場合は何もインストールしない。
  it("cancel/beforeCommit", async () => {
    await expect(
      installEnginePackage(ENGINE_ID, 10, (p) => {
        if (p.receivedBytes === p.totalBytes && p.file === undefined) {
          cancelEnginePackageInstall(ENGINE_ID);
        }
      }),
    ).rejects.toThrow(ENGINE_PACKAGE_INSTALL_CANCELED);
    expect(await listInstalledEnginePackages()).toEqual([]);
    expect(fs.readdirSync(getEnginePackagesDir())).toEqual([]);
  });

  // キャンセルと同時に別の理由で失敗した場合は、キャンセルではなくその失敗を伝える。
  it("cancel/doesNotHideOtherFailures", async () => {
    await installEnginePackage(ENGINE_ID, 10, () => {});
    const rename = fs.promises.rename;
    vi.spyOn(fs.promises, "rename").mockImplementation(async (src, dest) => {
      if (path.basename(String(src)).startsWith(".tmp-")) {
        cancelEnginePackageInstall(ENGINE_ID);
        throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" });
      }
      return rename(src, dest);
    });
    const error = await installEnginePackage(ENGINE_ID, 10, () => {}).catch((e) => e);
    expect(String(error)).toMatch(/cross-device/);
    expect(String(error)).not.toContain(ENGINE_PACKAGE_INSTALL_CANCELED);
  });

  // ライセンスの取得は宣言より大きな応答を受け取り続けない。
  it("licenses/oversized", async () => {
    // 終わりの無い応答。全体を受け取ってから照合すると、いつまでも終わらない。
    server.overrides.set(
      "/LICENSE.txt",
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(64 * 1024));
            },
          }),
        ),
    );
    useIndex(server);
    await expect(fetchEnginePackageLicenses(ENGINE_ID)).rejects.toThrow(/LICENSE\.txt/);
  }, 5000);

  // 配信側が応答の途中でデータを送らなくなっても、ライセンスの取得は時間切れで終わる。
  // この間は画面が操作できないため、待ち続けてはならない。
  it.each(["/engine.json", "/LICENSE.txt"])(
    "licenses/stalled: %s",
    async (suffix) => {
      // 一部だけ送って、その後は何も送らない (接続は保ったまま)。
      server.overrides.set(
        suffix,
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(1));
              },
              pull() {
                return new Promise(() => {});
              },
            }),
          ),
      );
      useIndex(server);
      setLicenseFetchTimeoutForTesting(200);
      try {
        await expect(fetchEnginePackageLicenses(ENGINE_ID)).rejects.toThrow(/timed out/);
      } finally {
        setLicenseFetchTimeoutForTesting(60_000);
      }
    },
    5000,
  );

  // エンジンの起動中にキャンセルされた場合は一覧に登録しない (ファイルは残る)。
  it("cancel/duringHandshake", async () => {
    const original = mockUSI.getUSIEngineInfo.getMockImplementation();
    mockUSI.getUSIEngineInfo.mockImplementation(async (...args) => {
      cancelEnginePackageInstall(ENGINE_ID);
      return original!(...args);
    });
    await expect(installEnginePackage(ENGINE_ID, 10, () => {})).rejects.toThrow(
      ENGINE_PACKAGE_INSTALL_CANCELED,
    );
    expect((await listInstalledEnginePackages()).map((p) => p.id)).toEqual([ENGINE_ID]);
  });

  it("cleanup", async () => {
    const root = getEnginePackagesDir();
    const stale = path.join(root, ".tmp-stale");
    const fresh = path.join(root, ".tmp-fresh");
    fs.mkdirSync(stale, { recursive: true });
    fs.mkdirSync(fresh, { recursive: true });
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    await cleanupEnginePackagesDir();
    expect(fs.existsSync(stale)).toBeFalsy();
    expect(fs.existsSync(fresh)).toBeTruthy();
  });
});
