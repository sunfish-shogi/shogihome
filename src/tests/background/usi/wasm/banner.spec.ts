// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getEngineBannerURL, updateEngineBanners } from "@/background/usi/wasm/banner.js";
import { emptyUSIEngine, USIEngines } from "@/common/settings/usi.js";
import { ENGINE_ABI } from "@/common/wasm-engine/manifest.js";

vi.mock("@/background/log.js", () => ({ getAppLogger: () => ({ warn: vi.fn() }) }));

function writeManifest(dir: string, banner?: string): string {
  const manifestPath = path.join(dir, "engine.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      abi: ENGINE_ABI,
      module: "engine.js",
      name: "Test Engine",
      author: "Test",
      banner,
      presets: [{ id: "test", displayName: "Test" }],
    }),
  );
  return manifestPath;
}

describe("background/usi/wasm/banner", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-banner-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("getEngineBannerURL", async () => {
    const manifestPath = writeManifest(tempDir, "images/banner.png");
    expect(await getEngineBannerURL(manifestPath)).toBe(
      pathToFileURL(path.join(tempDir, "images", "banner.png")).href,
    );
  });

  it("getEngineBannerURL/notDeclared", async () => {
    const manifestPath = writeManifest(tempDir);
    expect(await getEngineBannerURL(manifestPath)).toBeUndefined();
  });

  it("getEngineBannerURL/notWasmEngine", async () => {
    expect(await getEngineBannerURL(path.join(tempDir, "engine.exe"))).toBeUndefined();
  });

  it("getEngineBannerURL/brokenManifest", async () => {
    const manifestPath = path.join(tempDir, "engine.json");
    fs.writeFileSync(manifestPath, "{");
    expect(await getEngineBannerURL(manifestPath)).toBeUndefined();
  });

  it("updateEngineBanners", async () => {
    const manifestPath = writeManifest(tempDir, "banner.png");
    const engines = new USIEngines();
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/wasm",
      name: "wasm",
      path: manifestPath,
    });
    // 保存された値は使わない。
    engines.addEngine({
      ...emptyUSIEngine(),
      uri: "es://usi-engine/native",
      name: "native",
      path: path.join(tempDir, "engine.exe"),
      banner: "file:///stale.png",
    });
    await updateEngineBanners(engines);
    expect(engines.getEngine("es://usi-engine/wasm")?.banner).toBe(
      pathToFileURL(path.join(tempDir, "banner.png")).href,
    );
    expect(engines.getEngine("es://usi-engine/native")?.banner).toBeUndefined();
  });
});
