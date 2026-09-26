// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import {
  cleanupEnginePackagesDir,
  fetchEngineIndex,
  fetchEnginePackageLicenses,
  getEngineIndexURL,
  getEnginePackagesDir,
  installEnginePackage,
  listInstalledEnginePackages,
  setFetchForTesting,
  uninstallEnginePackage,
} from "@/background/usi/wasm/install.js";
import * as usi from "@/background/usi/index.js";
import { emptyUSIEngine } from "@/common/settings/usi.js";
import * as log from "@/background/log.js";
import { getNopLogger } from "@/tests/mock/log.js";
import { Mocked } from "vitest";

vi.mock("electron", () => ({ net: { fetch: vi.fn() } }));
vi.mock("@/background/log.js");
vi.mock("@/background/helpers/electron.js", () => ({ getAppVersion: () => "0.0.0-test" }));
vi.mock("@/background/usi/index.js");

const mockUSI = usi as Mocked<typeof usi>;
const mockLog = log as Mocked<typeof log>;

const ENGINE_ID = "sunfish4-lite";

// GitHub Pages の配信物。一覧 (docs/engine-index.json) と本家のエンジンの成果物を返す。
const DOCS_DIR = path.resolve("docs");
const ENGINE_DIR = path.join(DOCS_DIR, "webapp", "engines", ENGINE_ID);

type Server = {
  index: unknown;
  requested: string[];
  // 差し替える応答の内容 (URL の末尾で照合する)。
  overrides: Map<string, Buffer>;
};

function setupServer(): Server {
  const server: Server = {
    index: JSON.parse(fs.readFileSync(path.join(DOCS_DIR, "engine-index.json"), "utf8")),
    requested: [],
    overrides: new Map(),
  };
  const indexURL = getEngineIndexURL();
  const base = new URL("./", indexURL).href;
  setFetchForTesting(async (url) => {
    server.requested.push(url);
    for (const [suffix, data] of server.overrides) {
      if (url.endsWith(suffix)) {
        return new Response(new Uint8Array(data));
      }
    }
    if (url === indexURL) {
      return new Response(JSON.stringify(server.index));
    }
    const file = path.join(DOCS_DIR, url.substring(base.length));
    if (!url.startsWith(`${base}webapp/engines/`) || !fs.existsSync(file)) {
      return new Response("not found", { status: 404 });
    }
    return new Response(new Uint8Array(fs.readFileSync(file)));
  });
  return server;
}

describe("background/usi/wasm/install", () => {
  let server: Server;

  beforeEach(async () => {
    await fs.promises.rm(getEnginePackagesDir(), { recursive: true, force: true });
    mockLog.getAppLogger.mockReturnValue(getNopLogger());
    server = setupServer();
    mockUSI.isEnginePathInUse.mockReturnValue(false);
    mockUSI.getUSIEngineInfo.mockImplementation(async (enginePath) => ({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/test",
      name: "Sunfish4-Lite",
      path: enginePath,
      options: {
        MaxDepth: { name: "MaxDepth", type: "spin", order: 100, default: 64 },
        USI_Hash: { name: "USI_Hash", type: "spin", order: 1, default: 32 },
      },
    }));
  });

  it("install", async () => {
    await fetchEngineIndex();
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

    // プリセットごとに項目が作られ、プリセットの値が既定値に入る。
    const manifest = JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, "engine.json"), "utf8"));
    expect(result.engines.map((e) => e.name)).toEqual(
      manifest.presets.map((p: { displayName: string }) => p.displayName),
    );
    expect(new Set(result.engines.map((e) => e.uri)).size).toBe(result.engines.length);
    const d3 = result.engines.find((e) => e.name.endsWith("Depth-03"));
    expect(d3?.options.MaxDepth).toMatchObject({ type: "spin", default: 3 });
    expect(d3?.options.MaxDepth).not.toHaveProperty("value");
    expect(result.engines.every((e) => e.path === result.installed.enginePath)).toBeTruthy();

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
