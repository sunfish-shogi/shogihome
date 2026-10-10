import { reactive, UnwrapNestedRefs } from "vue";
import { EnginePackageInstallProgress } from "@/common/wasm-engine/package.js";

// ダウンロード中のエンジンのパッケージの進捗。background から届く (ipc/setup.ts)。
export class EnginePackageStore {
  private _progress: { [id: string]: EnginePackageInstallProgress } = {};

  getProgress(id: string): EnginePackageInstallProgress | undefined {
    return this._progress[id];
  }

  updateProgress(progress: EnginePackageInstallProgress): void {
    this._progress[progress.id] = progress;
  }

  clearProgress(id: string): void {
    delete this._progress[id];
  }
}

export function createEnginePackageStore(): UnwrapNestedRefs<EnginePackageStore> {
  return reactive(new EnginePackageStore());
}

let store: UnwrapNestedRefs<EnginePackageStore>;

export function useEnginePackageStore(): UnwrapNestedRefs<EnginePackageStore> {
  if (!store) {
    store = createEnginePackageStore();
  }
  return store;
}
