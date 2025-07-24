import path from "node:path";
import { loadUSIEngines, saveUSIEngines } from "@/background/settings.js";
import { getAppLogger } from "@/background/log.js";
import { HeadlessModeOperation } from "./command.js";
import { getUSIEngineInfo } from "@/background/usi/index.js";

export async function invoke(headless: HeadlessModeOperation) {
  switch (headless.operation) {
    case "addEngine":
      await addEngine(headless.path, headless.name, headless.timeout);
      break;
  }
}

export async function addEngine(enginePath: string, name: string, timeout: number) {
  const engineFullPath = path.resolve(process.cwd(), enginePath);
  getAppLogger().info(
    "Adding engine in headless mode: path=[%s] name=[%s] timeout=[%d]",
    engineFullPath,
    name,
    timeout,
  );
  const engine = await getUSIEngineInfo(engineFullPath, timeout);
  engine.name = name;
  const engineSettings = await loadUSIEngines();
  engineSettings.addEngine(engine);
  await saveUSIEngines(engineSettings);
  getAppLogger().info("Engine added successfully: %s", engine.name);
}
