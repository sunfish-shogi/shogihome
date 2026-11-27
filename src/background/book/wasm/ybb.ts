// YBB 形式の WebAssembly 版 (wasm/book)。常に On-the-fly モードで動作する。
// JavaScript 版の On-the-fly モードと同じく、元のファイルはメモリに読み込まず、検索や書き出しに必要な部分を
// その都度読む (WebAssembly 側から env.book_read を通して同期的に読む)。
// 編集内容 (in-memory のエントリー) は JavaScript 側で保持し、書き出す時に渡す。

import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { BookWasmInstance } from "./instance.js";

export class YbbWasmBook extends BookWasmInstance {
  /** YBB 形式のファイルを開く */
  static open(path: string): YbbWasmBook {
    const book = new YbbWasmBook();
    book.openFile(path);
    try {
      if (book.exports.ybb_open() < 0) {
        throw book.error();
      }
    } catch (e) {
      book.close();
      throw e;
    }
    return book;
  }

  /** 元のファイルが無い空の定跡を作る */
  static create(): YbbWasmBook {
    const book = new YbbWasmBook();
    book.exports.ybb_create();
    return book;
  }

  /** 元のファイルから局面を検索する (searchYbbBookMovesOnTheFly に相当する) */
  search(sfen: string): BookEntry | undefined {
    return this.searchWith(sfen, (ptr, len) => this.exports.ybb_search(ptr, len));
  }

  /**
   * 元のファイルに in-memory のエントリーを統合して YBB 形式で書き出す (mergeYbbBook に相当する)。
   * output は書き出し後に閉じられる。
   */
  async store(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeYbb(
      (ptr, len) => this.exports.ybb_save_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }

  /** 全ての局面 (loadYbbBookFull と同じ) に in-memory のエントリーを統合して、やねうら王形式で書き出す */
  async exportYane(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeYane(
      (ptr, len) => this.exports.ybb_export_yane_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }

  /** 全ての局面 (loadYbbBookFull と同じ) に in-memory のエントリーを統合して、SBK 形式で書き出す */
  async exportSbk(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeSbk(
      (ptr, len) => this.exports.ybb_export_sbk_begin(ptr, len),
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
      (ptr, len) => this.exports.ybb_export_apery_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }
}
