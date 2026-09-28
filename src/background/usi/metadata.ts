import { USIEngineMetadata } from "@/common/settings/usi.js";
import { isEngineManifestPath } from "@/common/wasm-engine/package.js";
import { isShellScript } from "@/background/helpers/file.js";

export async function loadUSIEngineMeta(enginePath: string): Promise<USIEngineMetadata> {
  // ダウンロードした WebAssembly エンジンは engine.json を指す。中身はテキストなので
  // isShellScript の判定ではシェルスクリプトとみなされてしまうが、実際には utility プロセスで
  // 直接動くため、スレッド数やハッシュサイズの見積もりから除外しない。
  if (isEngineManifestPath(enginePath)) {
    return { isShellScript: false };
  }
  return {
    isShellScript: await isShellScript(enginePath),
  };
}
