// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getEngineDisplayInfo, updateEngineDisplayInfo } from "@/background/usi/wasm/display.js";
import { emptyUSIEngine, USIEngines } from "@/common/settings/usi.js";
import { ENGINE_ABI } from "@/common/wasm-engine/manifest.js";

vi.mock("@/background/log.js", () => ({ getAppLogger: () => ({ warn: vi.fn() }) }));

function writeManifest(dir: string, fields: { [key: string]: unknown } = {}): string {
  const manifestPath = path.join(dir, "engine.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      abi: ENGINE_ABI,
      module: "engine.js",
      name: "Test Engine",
      author: "Test",
      ...fields,
      presets: [{ id: "test", displayName: "Test" }],
    }),
  );
  return manifestPath;
}

describe("background/usi/wasm/display", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-display-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("getEngineDisplayInfo", async () => {
    const manifestPath = writeManifest(tempDir, {
      banner: "images/banner.png",
      description: "Description",
      links: [{ label: "Website", url: "https://example.com/engine/" }],
    });
    expect(await getEngineDisplayInfo(manifestPath)).toStrictEqual({
      banner: pathToFileURL(path.join(tempDir, "images", "banner.png")).href,
      description: "Description",
      links: [{ label: "Website", url: "https://example.com/engine/" }],
    });
  });

  it("getEngineDisplayInfo/notDeclared", async () => {
    const manifestPath = writeManifest(tempDir);
    expect(await getEngineDisplayInfo(manifestPath)).toStrictEqual({});
  });

  it("getEngineDisplayInfo/notWasmEngine", async () => {
    expect(await getEngineDisplayInfo(path.join(tempDir, "engine.exe"))).toStrictEqual({});
  });

  it("getEngineDisplayInfo/brokenManifest", async () => {
    const manifestPath = path.join(tempDir, "engine.json");
    fs.writeFileSync(manifestPath, "{");
    expect(await getEngineDisplayInfo(manifestPath)).toStrictEqual({});
  });

  it("updateEngineDisplayInfo", async () => {
    const manifestPath = writeManifest(tempDir, {
      banner: "banner.png",
      description: "Description",
    });
    const engines = new USIEngines();
    // マニフェストに無い項目は保存された値を消す。
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/wasm",
      name: "wasm",
      path: manifestPath,
      links: [{ label: "Stale", url: "https://example.com/stale/" }],
    });
    // 保存された値は使わない。
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/native",
      name: "native",
      path: path.join(tempDir, "engine.exe"),
      banner: "file:///stale.png",
      description: "Stale",
      links: [{ label: "Stale", url: "https://example.com/stale/" }],
    });
    await updateEngineDisplayInfo(engines);
    const wasm = engines.getEngine("es://usi-engine/wasm");
    expect(wasm?.banner).toBe(pathToFileURL(path.join(tempDir, "banner.png")).href);
    expect(wasm?.description).toBe("Description");
    expect(wasm).not.toHaveProperty("links");
    const native = engines.getEngine("es://usi-engine/native");
    expect(native).not.toHaveProperty("banner");
    expect(native).not.toHaveProperty("description");
    expect(native).not.toHaveProperty("links");
  });
});
