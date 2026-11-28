// Apery 形式の WebAssembly 版 (wasm/book)。常に On-the-fly モードで動作する。
// JavaScript 版の On-the-fly モードと同じく、元のファイルはメモリに読み込まず、検索や書き出しに必要な部分を
// その都度読む (WebAssembly 側から env.book_read を通して同期的に読む)。
// 編集内容 (in-memory のエントリー) は JavaScript 側でハッシュ値をキーとして保持し、書き出す時に渡す。
// 他の形式への変換はできない (JavaScript 版と同じ)。

import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { BookWasmInstance } from "./instance.js";

export class AperyWasmBook extends BookWasmInstance {
  /** Apery 形式のファイルを開く */
  static open(path: string): AperyWasmBook {
    const book = new AperyWasmBook();
    const size = book.openFile(path);
    book.exports.apery_open(size);
    return book;
  }

  /** 元のファイルが無い空の定跡を作る */
  static create(): AperyWasmBook {
    const book = new AperyWasmBook();
    book.exports.apery_create();
    return book;
  }

  /** 元のファイルから局面を検索する (searchAperyBookMovesOnTheFly に相当する) */
  search(sfen: string): BookEntry | undefined {
    return this.searchWith(sfen, (ptr, len) => this.exports.apery_search(ptr, len));
  }

  /**
   * 元のファイルに in-memory のエントリーを統合して Apery 形式で書き出す (mergeAperyBook に相当する)。
   * entries のキーはハッシュ値。output は書き出し後に閉じられる。
   */
  async store(
    entries: Map<bigint, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeApery(
      (ptr, len) => this.exports.apery_save_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }
}
