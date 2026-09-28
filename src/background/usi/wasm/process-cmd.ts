// コマンドラインツール (src/command/) 向けの実装。
// webpack の設定で process-electron.ts と差し替える。utility プロセスは Electron の機能なので、
// コマンドラインツールでは WebAssembly エンジンを起動できない。
import { isEngineManifestPath } from "@/common/wasm-engine/package.js";
import { EngineProcessHandle } from "@/background/usi/process.js";

export function isWasmEnginePath(enginePath: string): boolean {
  return isEngineManifestPath(enginePath);
}

export class WasmEngineProcess implements EngineProcessHandle {
  constructor() {
    throw new Error("WebAssembly engines are not supported on command line tool");
  }

  get pid(): number | undefined {
    return undefined;
  }

  on(): this {
    return this;
  }

  send(): void {}

  kill(): void {}
}
