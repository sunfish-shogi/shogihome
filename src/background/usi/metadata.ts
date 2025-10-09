import {
  getUSIEngineOptionCurrentValue,
  USIEngine,
  USIEngineMetadataMap,
  USIEngines,
} from "@/common/settings/usi.js";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { exists } from "@/background/helpers/file.js";

export async function loadUSIEngineMeta(engines: USIEngines): Promise<USIEngineMetadataMap> {
  const metadataMap: USIEngineMetadataMap = {};
  for (const engine of engines.engineList) {
    metadataMap[engine.uri] = {
      engineThumbnailURL: await getEngineThumbnailPath(engine),
      evalThumbnailURL: await getEvalThumbnailPath(engine),
    };
  }
  return metadataMap;
}

async function getEngineThumbnailPath(engine: USIEngine): Promise<string> {
  // {EngineRoot}/thumbnail.png
  const engineRoot = path.dirname(engine.path);
  const engineThumbnailPath = path.join(engineRoot, "thumbnail.png");
  if (await exists(engineThumbnailPath)) {
    return pathToFileURL(engineThumbnailPath).toString();
  }

  // script
  if ([".bat", ".cmd", ".sh", ".py"].includes(path.extname(engine.path).toLowerCase())) {
    return "thumbnail/script.png";
  }

  // script (shebang)
  try {
    const shebangBuffer = Buffer.alloc(2);
    const fd = await fs.promises.open(engine.path, "r");
    await fd.read(shebangBuffer, 0, 2, 0);
    await fd.close();
    // #(0x23) !(0x21)
    if (shebangBuffer[0] === 0x23 && shebangBuffer[1] === 0x21) {
      return "thumbnail/script.png";
    }
  } catch {
    // ignore
  }

  return "thumbnail/engine_default.png";
}

async function getEvalThumbnailPath(engine: USIEngine): Promise<string | undefined> {
  // {EvalDir}/eval_thumbnail.png
  const engineRoot = path.dirname(engine.path);
  const evalDirOption = engine.options["EvalDir"];
  if (!evalDirOption) {
    return;
  }
  const evalDir = getUSIEngineOptionCurrentValue(evalDirOption);
  if (typeof evalDir !== "string" || evalDir === "") {
    return;
  }
  const evalThumbnailPath = path.resolve(engineRoot, evalDir, "thumbnail.png");
  if (await exists(evalThumbnailPath)) {
    return pathToFileURL(evalThumbnailPath).toString();
  }
}
