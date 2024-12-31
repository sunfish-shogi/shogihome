import { BookLoadingMode, BookMove, BookMoveEx } from "@/common/book";
import { reactive, UnwrapNestedRefs } from "vue";
import { useStore } from ".";
import api from "@/renderer/ipc/api";
import { useErrorStore } from "./error";
import { useBusyState } from "./busy";
import { useMessageStore } from "./message";
import { useAppSettings } from "./settings";
import { useConfirmationStore } from "./confirm";
import { BookImportSettings, SourceType } from "@/common/settings/book";
import { t } from "@/common/i18n";
import { ImmutableRecord } from "tsshogi";

export class BookStore {
  private _mode: BookLoadingMode = "in-memory";
  private _moves: BookMoveEx[] = [];
  private _reactive: UnwrapNestedRefs<BookStore>;

  constructor(private record: ImmutableRecord) {
    this._reactive = reactive(this);
  }

  get reactive(): UnwrapNestedRefs<BookStore> {
    return this._reactive;
  }

  get mode(): BookLoadingMode {
    return this._mode;
  }

  get moves(): BookMoveEx[] {
    return this._moves;
  }

  private async reloadBookMoves() {
    try {
      const sfen = this.record.position.sfen;
      const moves = await api.searchBookMoves(sfen);
      this._moves = moves.map((bookMove) => {
        const position = this.record.position.clone();
        const move = position.createMoveByUSI(bookMove.usi);
        let repetition = 0;
        if (move) {
          position.doMove(move);
          repetition = this.record.getRepetitionCount(position);
        }
        return {
          ...bookMove,
          repetition,
        } as BookMoveEx;
      });
    } catch (e) {
      useErrorStore().add(e);
    }
  }

  onChangePosition(record: ImmutableRecord) {
    this.record = record;
    this.reloadBookMoves();
  }

  reset() {
    if (useBusyState().isBusy) {
      return;
    }
    useConfirmationStore().show({
      message: t.anyUnsavedDataWillBeLostDoYouReallyWantToResetBookData,
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
            text: `${t.bookDataOpendAsReadOnlyModeBecauseOfLargeFile} ${t.youCanChangeFileSizeThresholdFromPreferencesDialog}`,
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

  async updateMove(sfen: string, move: BookMove) {
    useBusyState().retain();
    return api
      .updateBookMove(sfen, move)
      .then(() => this.reloadBookMoves())
      .then(async () => {
        const settings = await api.loadBookImportSettings();
        settings.sourceType = SourceType.MEMORY;
        await api.saveBookImportSettings(settings);
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

  importBookMoves(settings: BookImportSettings) {
    useBusyState().retain();
    api
      .saveBookImportSettings(settings)
      .then(() => api.importBookMoves(settings))
      .then((summary) => {
        useMessageStore().enqueue({
          text: t.bookMovesWereImported,
          attachments: [
            {
              type: "list",
              items: [
                {
                  text: t.file,
                  children: [
                    `${t.success}: ${summary.successFileCount}`,
                    `${t.failed}: ${summary.errorFileCount}`,
                  ],
                },
                {
                  text: t.moveEntry,
                  children: [
                    `${t.new}: ${summary.entryCount}`,
                    `${t.duplicated}: ${summary.duplicateCount}`,
                  ],
                },
              ],
            },
          ],
        });
        return this.reloadBookMoves();
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }
}

export function createBookStore(): UnwrapNestedRefs<BookStore> {
  const store = useStore();
  const bookStore = new BookStore(store.record).reactive;
  store.addEventListener("changePosition", () => {
    bookStore.onChangePosition(store.record);
  });
  return bookStore;
}

let store: UnwrapNestedRefs<BookStore>;

export function useBookStore(): UnwrapNestedRefs<BookStore> {
  if (!store) {
    store = createBookStore();
  }
  return store;
}
