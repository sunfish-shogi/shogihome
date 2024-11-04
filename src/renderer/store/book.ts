import { BookLoadingMode, BookMove } from "@/common/book";
import { reactive, UnwrapNestedRefs } from "vue";
import { useStore } from ".";
import api from "@/renderer/ipc/api";
import { useErrorStore } from "./error";
import { useBusyState } from "./busy";
import { useMessageStore } from "./message";
import { useAppSettings } from "./settings";
import { useConfirmationStore } from "./confirm";

class BookStore {
  private _mode: BookLoadingMode = "in-memory";
  private _moves: BookMove[] = [];
  private _reactive: UnwrapNestedRefs<BookStore>;

  constructor() {
    const refs = reactive(this);
    this._reactive = refs;
    useStore().addEventListener("changePosition", this.reloadBookMoves.bind(refs));
  }

  get reactive(): UnwrapNestedRefs<BookStore> {
    return this._reactive;
  }

  get mode(): BookLoadingMode {
    return this._mode;
  }

  get moves(): BookMove[] {
    return this._moves;
  }

  private async reloadBookMoves() {
    try {
      const sfen = useStore().record.position.sfen;
      this._moves = await api.searchBookMoves(sfen);
    } catch (e) {
      useErrorStore().add(e);
    }
  }

  reset() {
    if (useBusyState().isBusy) {
      return;
    }
    useConfirmationStore().show({
      message: "保存していない内容は失われます。定跡を初期化しますか？", // TODO: i18n
      onOk: () => {
        useBusyState().retain();
        api
          .clearBook()
          .then(() => {
            this._mode = "in-memory";
            return this.reloadBookMoves();
          })
          .catch((e) => {
            useErrorStore().add(e);
          })
          .finally(() => {
            useBusyState().release();
          });
      },
    });
  }

  openBookFile() {
    useBusyState().retain();
    api
      .showOpenBookDialog()
      .then(async (path) => {
        if (!path) {
          return;
        }
        const mode = await api.openBook(path, {
          onTheFlyThresholdMB: useAppSettings().bookOnTheFlyThresholdMB,
        });
        if (mode === "on-the-fly") {
          useMessageStore().enqueue({
            text: "定跡ファイルのサイズが大きいため読み込み専用モードで開きます。", // TODO: i18n
          });
        }
        this._mode = mode;
        await this.reloadBookMoves();
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  saveBookFile() {
    if (useBusyState().isBusy) {
      return;
    }
    useBusyState().retain();
    api
      .showSaveBookDialog()
      .then(async (path) => {
        if (path) {
          await api.saveBook(path);
        }
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  updateMove(sfen: string, move: BookMove) {
    useBusyState().retain();
    api
      .updateBookMove(sfen, move)
      .then(() => this.reloadBookMoves())
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  removeMove(sfen: string, usi: string) {
    useBusyState().retain();
    api
      .removeBookMove(sfen, usi)
      .then(() => this.reloadBookMoves())
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  updateMoveOrder(sfen: string, usi: string, order: number) {
    useBusyState().retain();
    api
      .updateBookMoveOrder(sfen, usi, order)
      .then(() => this.reloadBookMoves())
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  async searchMoves(sfen: string): Promise<BookMove[]> {
    return api.searchBookMoves(sfen);
  }
}

export function createBookStore(): UnwrapNestedRefs<BookStore> {
  return new BookStore().reactive;
}

let store: UnwrapNestedRefs<BookStore>;

export function useBookStore(): UnwrapNestedRefs<BookStore> {
  if (!store) {
    store = createBookStore();
  }
  return store;
}
