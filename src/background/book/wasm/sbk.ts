// SBK 形式の WebAssembly 版 (wasm/book)。常に JavaScript 版の On-the-fly モードと同じ方式で動作する。
// 元のファイルの内容と索引を WebAssembly のメモリ上に保持し、検索と書き出しを行う。
// 編集内容 (in-memory のエントリー) は JavaScript 側で保持し、書き出す時に渡す。

import fs from "node:fs";
import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { t } from "@/common/i18n/index.js";
import { decodeEntry, Decoder } from "./codec.js";
import { BookWasmInstance } from "./instance.js";

const textEncoder = new TextEncoder();

// 開ける SBK ファイルの大きさの上限。
// WebAssembly (wasm32) のメモリは 4 GiB までで、ファイルの内容に加えて局面ごとに索引 (開く処理の途中では
// 1 局面あたり 70 バイト強) が必要になる。現実的なファイル (1 局面あたり 50〜90 バイト程度) であれば
// 余裕を持って開ける大きさとする。それでもメモリが不足した場合は BookWasmCrashError になる。
export const MAX_SBK_FILE_SIZE = 1024 * 1024 * 1024;
// ファイルを読み込む単位
const READ_CHUNK_SIZE = 16 * 1024 * 1024;

export class SbkWasmBook extends BookWasmInstance {
  private _author?: string;
  private _description?: string;
  private _stateCount = 0;

  /** 元のファイルが無い空の定跡を作る */
  static create(): SbkWasmBook {
    const book = new SbkWasmBook();
    book.exports.sbk_create();
    return book;
  }

  /** SBK ファイルを開く */
  static async open(path: string): Promise<SbkWasmBook> {
    const book = new SbkWasmBook();
    const file = await fs.promises.open(path, "r");
    try {
      const { size } = await file.stat();
      if (size > MAX_SBK_FILE_SIZE) {
        throw new Error(t.bookFileTooLargeForWasm("1 GiB"));
      }
      // ファイルの内容を WebAssembly のメモリに直接読み込む。
      // 所有権は sbk_open で WebAssembly 側に移る。
      const ptr = book.exports.book_alloc(size);
      let opened = false;
      try {
        let pos = 0;
        while (pos < size) {
          // 読み込み中に WebAssembly のメモリは拡張されないが、念のため毎回ビューを作り直す
          const length = Math.min(READ_CHUNK_SIZE, size - pos);
          const view = new Uint8Array(book.exports.memory.buffer, ptr + pos, length);
          const { bytesRead } = await file.read(view, 0, length, pos);
          if (bytesRead === 0) {
            throw new Error(`Unexpected end of file: ${path}`);
          }
          pos += bytesRead;
        }
        opened = true;
        if (book.exports.sbk_open(ptr, size) < 0) {
          throw book.error();
        }
      } finally {
        if (!opened) {
          book.exports.book_free(ptr, size);
        }
      }
    } finally {
      await file.close();
    }
    const d = new Decoder(book.result());
    book._author = d.u8() ? d.str() : undefined;
    book._description = d.u8() ? d.str() : undefined;
    book._stateCount = d.u32();
    return book;
  }

  get author(): string | undefined {
    return this._author;
  }

  get description(): string | undefined {
    return this._description;
  }

  get stateCount(): number {
    return this._stateCount;
  }

  /** 元のファイルから局面を検索する (searchSbkBookEntryOnTheFly に相当する) */
  search(sfen: string): BookEntry | undefined {
    const r = this.withInput(textEncoder.encode(sfen), (ptr, len) =>
      this.exports.sbk_search(ptr, len),
    );
    if (r < 0) {
      throw this.error();
    }
    if (r === 0) {
      return;
    }
    return decodeEntry(new Decoder(this.result()));
  }

  /**
   * 元のファイルに in-memory のエントリーを統合して SBK 形式で書き出す
   * (storeSbkBookOnTheFly に相当する)。output は書き出し後に閉じられる。
   */
  async store(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeSbk(
      (ptr, len) => this.exports.sbk_save_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }

  /**
   * 全ての局面 (loadSbkBook と同じ) に in-memory のエントリーを統合して、やねうら王形式で書き出す。
   * output は書き出し後に閉じられる。
   */
  async exportYane(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.writeYane(
      (ptr, len) => this.exports.sbk_export_yane_begin(ptr, len),
      entries,
      output,
      onProgress,
    );
  }
}
