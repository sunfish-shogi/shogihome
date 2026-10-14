import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { USIEngine, USIEngines } from "@/common/settings/usi.js";
import { isEngineManifestPath } from "@/common/wasm-engine/package.js";
import { parseEngineManifest } from "@/common/wasm-engine/manifest.js";
import { getAppLogger } from "@/background/log.js";
import { resolveEnginePath } from "@/background/usi/path.js";

// マニフェスト (engine.json) で指定されたバナー画像の file: URL を返す。
// WebAssembly エンジンでない場合や、マニフェストを読めない場合は undefined を返す。
export async function getEngineBannerURL(enginePath: string): Promise<string | undefined> {
  if (!isEngineManifestPath(enginePath)) {
    return;
  }
  const manifestPath = resolveEnginePath(enginePath);
  try {
    const manifest = parseEngineManifest(
      JSON.parse(await fs.promises.readFile(manifestPath, "utf8")),
    );
    if (!manifest.banner) {
      return;
    }
    return pathToFileURL(path.join(path.dirname(manifestPath), manifest.banner)).href;
  } catch (e) {
    getAppLogger().warn("failed to read engine banner: %s: %s", manifestPath, e);
  }
}

// 保存された値は使わず、全てのエンジンのバナー画像をマニフェストから設定し直す。
export async function updateEngineBanners(engines: USIEngines): Promise<void> {
  for (const engine of engines.engineList) {
    const banner = await getEngineBannerURL(engine.path);
    if (banner !== engine.banner) {
      const updated: USIEngine = { ...engine, banner };
      if (!banner) {
        delete updated.banner;
      }
      engines.updateEngine(updated);
    }
  }
}
