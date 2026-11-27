// やねうら王形式の WebAssembly 版 (wasm/book)。
// - On-the-fly モード: JavaScript 版の On-the-fly モードと同じく、元のファイルはメモリに読み込まず、
//   検索や書き出しに必要な部分をその都度読む (WebAssembly 側から env.book_read を通して同期的に読む)。
// - in-memory モード: ファイル全体を WebAssembly のメモリに読み込み、索引を作る。
//   局面順に整列されていないファイルも扱える。書き出す時は全ての局面を書き出す。
// どちらのモードでも、編集内容は JavaScript 側で保持し、書き出す時に渡す。

import fs from "node:fs";
import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { BookWasmInstance } from "./instance.js";

// in-memory モードで開けるファイルの大きさの上限 (On-the-fly 閾値の上限より大きい)
const MAX_IN_MEMORY_FILE_SIZE = 1024 * 1024 * 1024;
// ファイルを読み込む単位
const READ_CHUNK_SIZE = 16 * 1024 * 1024;

export class YaneWasmBook extends BookWasmInstance {
  private _mode: "in-memory" | "on-the-fly" = "in-memory";
  private _entryCount = 0;

  /**
   * やねうら王形式のファイルを On-the-fly モードで開く。
   * JavaScript 版と同じく、先頭の局面が整列されていない場合はエラーにする。
   */
  static open(path: string): YaneWasmBook {
    const book = new YaneWasmBook();
    book._mode = "on-the-fly";
    const size = book.openFile(path);
    try {
      const r = book.exports.yane_open(size);
      if (r < 0) {
        throw book.error();
      }
      if (r === 0) {
        throw new Error("Book is not ordered by position"); // FIXME: i18n
      }
    } catch (e) {
      book.close();
      throw e;
    }
    return book;
  }

  /** やねうら王形式のファイルを in-memory モードで開く */
  static async load(path: string): Promise<YaneWasmBook> {
    const book = new YaneWasmBook();
    const file = await fs.promises.open(path, "r");
    try {
      const { size } = await file.stat();
      if (size > MAX_IN_MEMORY_FILE_SIZE) {
        throw new Error(`The book file is too large to load in-memory: ${path}`);
      }
      // ファイルの内容を WebAssembly のメモリに直接読み込む。所有権は yane_load で WebAssembly 側に移る。
      const ptr = book.exports.book_alloc(size);
      let loaded = false;
      try {
        let pos = 0;
        while (pos < size) {
          const length = Math.min(READ_CHUNK_SIZE, size - pos);
          const { bytesRead } = await file.read(book.bytes(ptr + pos, length), 0, length, pos);
          if (bytesRead === 0) {
            throw new Error(`Unexpected end of file: ${path}`);
          }
          pos += bytesRead;
        }
        loaded = true;
        const r = book.exports.yane_load(ptr, size);
        if (r < 0) {
          throw book.error();
        }
        book._entryCount = r;
      } finally {
        if (!loaded) {
          book.exports.book_free(ptr, size);
        }
      }
    } finally {
      await file.close();
    }
    return book;
  }

  /** 元のファイルが無い空の定跡を作る (in-memory モード) */
  static create(): YaneWasmBook {
    const book = new YaneWasmBook();
    book.exports.yane_create();
    return book;
  }

  get mode(): "in-memory" | "on-the-fly" {
    return this._mode;
  }

  /** 元のファイルの局面の数 (in-memory モードのみ) */
  get entryCount(): number {
    return this._entryCount;
  }

  /** 元のファイルから局面を検索する */
  search(sfen: string): BookEntry | undefined {
    return this.searchWith(sfen, (ptr, len) => this.exports.yane_search(ptr, len));
  }

  /**
   * 編集内容を統合してやねうら王形式で書き出す。output は書き出し後に閉じられる。
   * On-the-fly モードでは元のファイルに統合し (mergeYaneuraOuBook に相当する)、
   * in-memory モードでは全ての局面を局面順に書き出す (storeYaneuraOuBook に相当する)。
   */
  async store(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeYane(
      (ptr, len) => this.exports.yane_save_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }

  /**
   * 全ての局面に in-memory のエントリーを統合して、SBK 形式で書き出す。
   * On-the-fly モードではファイル全体を読み込む。output は書き出し後に閉じられる。
   */
  async exportSbk(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeSbk(
      (ptr, len) => this.exports.yane_export_sbk_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }

  /** 全ての局面に in-memory のエントリーを統合して、YBB 形式で書き出す (storeYbbBook と同じ結果) */
  async exportYbb(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeYbb(
      (ptr, len) => this.exports.yane_export_ybb_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }

  /** 全ての局面に in-memory のエントリーを統合して、Apery 形式で書き出す (storeAperyBook と同じ結果) */
  async exportApery(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeApery(
      (ptr, len) => this.exports.yane_export_apery_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }
}
