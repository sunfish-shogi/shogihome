import { reactive, UnwrapNestedRefs } from "vue";

export class BusyState {
  private count = 0;
  private _progress?: number;

  get isBusy(): boolean {
    return this.count !== 0;
  }

  get progress(): number | undefined {
    return this._progress;
  }

  retain(): void {
    this.count += 1;
  }

  release(): void {
    this.count -= 1;
    if (this.count === 0) {
      this._progress = undefined;
    }
  }

  updateProgress(progress: number) {
    if (this.count) {
      this._progress = progress;
    }
  }
}

export function createBusyStore(): UnwrapNestedRefs<BusyState> {
  return reactive(new BusyState());
}

let store: UnwrapNestedRefs<BusyState>;

export function useBusyState(): UnwrapNestedRefs<BusyState> {
  if (!store) {
    store = createBusyStore();
  }
  return store;
}
