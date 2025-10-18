import { USIEngineMetadata } from "@/common/settings/usi.js";
import { isShellScript } from "@/background/helpers/file.js";

export async function loadUSIEngineMeta(enginePath: string): Promise<USIEngineMetadata> {
  return {
    isShellScript: await isShellScript(enginePath),
  };
}
