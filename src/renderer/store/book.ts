import {
  BookFormat,
  BookMove,
  BookMoveEx,
  BookPositionEntry,
  BookPositionProperties,
  defaultBookSession,
} from "@/common/book.js";
import { reactive, UnwrapNestedRefs } from "vue";
import { useStore } from ".";
import api from "@/renderer/ipc/api.js";
import { useErrorStore } from "./error.js";
import { useBusyState } from "./busy.js";
import { useConfirmationStore } from "./confirm.js";
import { useMessageStore } from "./message.js";
import { useAppSettings } from "./settings.js";
import { BookImportSettings } from "@/common/settings/book.js";
import { t } from "@/common/i18n/index.js";
import { ImmutableRecord } from "tsshogi";
import { flippedSFEN, flippedUSIMove } from "@/common/helpers/sfen.js";

export class BookStore {
  private _moves: BookMoveEx[] = [];
  private _positionProperties: BookPositionProperties = {};
  // 実際に定跡を検索した SFEN (flippedBook が有効な場合は反転局面のことがある)
  private _resolvedSfen?: string;
  private _format: BookFormat = "yane2016";
  private _reactive: UnwrapNestedRefs<BookStore>;

  constructor(private record: ImmutableRecord) {
    this._reactive = reactive(this);
  }

  get reactive(): UnwrapNestedRefs<BookStore> {
    return this._reactive;
  }

  get moves(): BookMoveEx[] {
    return this._moves;
  }

  get positionProperties(): BookPositionProperties {
    return this._positionProperties;
  }

  get format(): BookFormat {
    return this._format;
  }

  async reloadBookMoves() {
    try {
      const sfen = this.record.position.sfen;
      const { entry, sfen: resolvedSfen } = await this.searchEntry(sfen);
      this._resolvedSfen = resolvedSfen;
      this._positionProperties = entry
        ? {
            comment: entry.comment,
            minPly: entry.minPly,
            games: entry.games,
            wonBlack: entry.wonBlack,
            wonWhite: entry.wonWhite,
            sbkEvals: entry.sbkEvals,
          }
        : {};
      this._moves = (entry?.moves ?? []).map((bookMove) => {
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

  reset(format?: BookFormat) {
    if (useBusyState().isBusy) {
      return;
    }
    useConfirmationStore().show({
      message: t.anyUnsavedDataWillBeLostDoYouReallyWantToResetBookData,
      onOk: () => {
        useBusyState().retain();
        api
          .clearBook(defaultBookSession, format)
          .then(() => {
            this._format = format || "yane2016";
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
        await api.openBook(defaultBookSession, path, {
          yaneOnTheFlyThresholdMB: useAppSettings().yaneBookOnTheFlyThresholdMB,
          aperyOnTheFlyThresholdMB: useAppSettings().aperyBookOnTheFlyThresholdMB,
          sbkOnTheFlyThresholdMB: useAppSettings().sbkOnTheFlyThresholdMB,
          ybbOnTheFlyThresholdMB: useAppSettings().ybbOnTheFlyThresholdMB,
        });
        this._format = await api.getBookFormat(defaultBookSession);
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
      .showSaveBookDialog(defaultBookSession)
      .then(async (path) => {
        if (path) {
          await api.saveBook(defaultBookSession, path);
        }
      })
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  exportBookFile(targetFormat: BookFormat) {
    if (useBusyState().isBusy) {
      return;
    }
    const doExport = () => {
      useBusyState().retain();
      api
        .showSaveBookDialog(defaultBookSession, targetFormat)
        .then(async (path) => {
          if (path) {
            await api.exportBook(defaultBookSession, path, targetFormat);
          }
        })
        .catch((e) => {
          useErrorStore().add(e);
        })
        .finally(() => {
          useBusyState().release();
        });
    };
    useConfirmationStore().show({
      message: t.memoryShortageOnBookConversionMayLoseUnsavedData,
      onOk: doExport,
    });
  }

  async updateMove(sfen: string, move: BookMove) {
    useBusyState().retain();
    return api
      .updateBookMove(defaultBookSession, sfen, move)
      .then(() => this.reloadBookMoves())
      .finally(() => {
        useBusyState().release();
      });
  }

  removeMove(sfen: string, usi: string) {
    useBusyState().retain();
    api
      .removeBookMove(defaultBookSession, sfen, usi)
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
      .updateBookMoveOrder(defaultBookSession, sfen, usi, order)
      .then(() => this.reloadBookMoves())
      .catch((e) => {
        useErrorStore().add(e);
      })
      .finally(() => {
        useBusyState().release();
      });
  }

  async searchMoves(sfen: string): Promise<BookMove[]> {
    const { entry } = await this.searchEntry(sfen);
    return entry?.moves ?? [];
  }

  // 定跡局面を検索する。flippedBook が有効な場合は反転局面の定跡も検索するため、
  // 実際に定跡が見つかった局面の SFEN を entry と合わせて返す。
  private async searchEntry(
    sfen: string,
  ): Promise<{ entry: BookPositionEntry | null; sfen: string }> {
    const entry = await api.searchBookEntry(defaultBookSession, sfen);
    if (entry?.moves.length) {
      return { entry, sfen };
    }
    const appSettings = useAppSettings();
    if (!appSettings.flippedBook) {
      return { entry, sfen };
    }
    const flippedSfen = flippedSFEN(sfen);
    const flippedEntry = await api.searchBookEntry(defaultBookSession, flippedSfen);
    if (!flippedEntry?.moves.length) {
      return { entry, sfen };
    }
    return {
      entry: {
        ...flippedEntry,
        moves: flippedEntry.moves.map((move) => {
          move.usi = flippedUSIMove(move.usi);
          if (move.usi2) {
            move.usi2 = flippedUSIMove(move.usi2);
          }
          return move;
        }),
        wonBlack: flippedEntry.wonWhite,
        wonWhite: flippedEntry.wonBlack,
      },
      sfen: flippedSfen,
    };
  }

  async updatePositionComment(comment: string) {
    const sfen = this._resolvedSfen ?? this.record.position.sfen;
    useBusyState().retain();
    return api
      .updateBookPositionComment(defaultBookSession, sfen, comment)
      .then(() => this.reloadBookMoves())
      .finally(() => {
        useBusyState().release();
      });
  }

  importBookMoves(settings: BookImportSettings) {
    useBusyState().retain();
    api
      .saveBookImportSettings(settings)
      .then(() => api.importBookMoves(defaultBookSession, settings))
      .then((summary) => {
        const items = [
          {
            text: t.file,
            children: [
              `${t.success}: ${summary.successFileCount}`,
              `${t.failed}: ${summary.errorFileCount}`,
              `${t.skipped}: ${summary.skippedFileCount}`,
            ],
          },
        ];
        if (summary.entryCount !== undefined && summary.duplicateCount !== undefined) {
          items.push({
            text: t.moveEntry,
            children: [
              `${t.new}: ${summary.entryCount}`,
              `${t.duplicated}: ${summary.duplicateCount}`,
            ],
          });
        }
        useMessageStore().enqueue({
          text: t.bookMovesWereImported,
          attachments: [{ type: "list", items }],
          withCopyButton: true,
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
