import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { USIEngine, USIEngines } from "@/common/settings/usi.js";
import { isEngineManifestPath } from "@/common/wasm-engine/package.js";
import { parseEngineManifest } from "@/common/wasm-engine/manifest.js";
import { getAppLogger } from "@/background/log.js";
import { resolveEnginePath } from "@/background/usi/path.js";

// エンジン選択の一覧で表示するために、マニフェスト (engine.json) から読み取る情報。
// バナー画像は file: URL にしてある。
export type EngineDisplayInfo = Pick<USIEngine, "banner" | "description" | "links">;

const DISPLAY_INFO_KEYS = ["banner", "description", "links"] as const;

// マニフェスト (engine.json) で指定された表示用の情報を返す。
// WebAssembly エンジンでない場合や、マニフェストを読めない場合は空のオブジェクトを返す。
// 指定されていない項目はキーごと含めない。
export async function getEngineDisplayInfo(enginePath: string): Promise<EngineDisplayInfo> {
  if (!isEngineManifestPath(enginePath)) {
    return {};
  }
  const manifestPath = resolveEnginePath(enginePath);
  try {
    const manifest = parseEngineManifest(
      JSON.parse(await fs.promises.readFile(manifestPath, "utf8")),
    );
    const info: EngineDisplayInfo = {};
    if (manifest.banner) {
      info.banner = pathToFileURL(path.join(path.dirname(manifestPath), manifest.banner)).href;
    }
    if (manifest.description) {
      info.description = manifest.description;
    }
    if (manifest.links) {
      info.links = manifest.links;
    }
    return info;
  } catch (e) {
    getAppLogger().warn("failed to read engine display info: %s: %s", manifestPath, e);
    return {};
  }
}

// 保存された値は使わず、全てのエンジンの表示用の情報をマニフェストから設定し直す。
export async function updateEngineDisplayInfo(engines: USIEngines): Promise<void> {
  for (const engine of engines.engineList) {
    const info = await getEngineDisplayInfo(engine.path);
    // links は配列なので、内容で比較する。
    if (
      DISPLAY_INFO_KEYS.every((key) => JSON.stringify(info[key]) === JSON.stringify(engine[key]))
    ) {
      continue;
    }
    const updated: USIEngine = { ...engine };
    for (const key of DISPLAY_INFO_KEYS) {
      delete updated[key];
    }
    engines.updateEngine({ ...updated, ...info });
  }
}
