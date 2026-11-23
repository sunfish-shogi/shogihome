// SBK 形式の WebAssembly 版 (wasm/book)。常に JavaScript 版の On-the-fly モードと同じ方式で動作する。
// 元のファイルの内容と索引を WebAssembly のメモリ上に保持し、検索と書き出しを行う。
// 編集内容 (in-memory のエントリー) は JavaScript 側で保持し、書き出す時に渡す。

import events from "node:events";
import fs from "node:fs";
import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { t } from "@/common/i18n/index.js";
import { decodeEntry, Decoder, encodeEntry, Encoder } from "./codec.js";
import { BookWasmInstance } from "./instance.js";

const textEncoder = new TextEncoder();

// 開ける SBK ファイルの大きさの上限。
// WebAssembly (wasm32) のメモリは 4 GiB までで、ファイルの内容に加えて局面ごとに索引 (開く処理の途中では
// 1 局面あたり 70 バイト強) が必要になる。現実的なファイル (1 局面あたり 50〜90 バイト程度) であれば
// 余裕を持って開ける大きさとする。それでもメモリが不足した場合は BookWasmCrashError になる。
export const MAX_SBK_FILE_SIZE = 1024 * 1024 * 1024;
// ファイルを読み込む単位
const READ_CHUNK_SIZE = 16 * 1024 * 1024;
// 1 回の呼び出しで書き出す State の数
const SAVE_CHUNK_STATES = 4096;

export class SbkWasmBook extends BookWasmInstance {
  private _author?: string;
  private _description?: string;
  private _stateCount = 0;
  private saving = false;

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
    // 書き出しの状態は WebAssembly 側に 1 つしか持てないため、同時に書き出すことはできない
    if (this.saving) {
      throw new Error("The book is already being saved.");
    }
    this.saving = true;
    try {
      await this.storeInternal(entries, output, onProgress);
    } finally {
      this.saving = false;
    }
  }

  private async storeInternal(
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    // 書き込み先がエラーになった場合 (開けなかった場合など) も、最後に finished を待ってエラーを返す
    const finished = events.once(output, "finish");
    finished.catch(() => {});
    const encoder = new Encoder();
    encoder.u32(entries.size);
    for (const [sfen, entry] of entries) {
      encoder.str(sfen);
      encodeEntry(encoder, entry);
    }
    const total = this.withInput(encoder.bytes, (ptr, len) =>
      this.exports.sbk_save_begin(ptr, len),
    );
    if (total < 0) {
      throw this.error();
    }
    let processed = 0;
    let progress = 0;
    for (;;) {
      const n = this.exports.sbk_save_next(SAVE_CHUNK_STATES);
      if (n < 0) {
        throw this.error();
      }
      // メモリ上の結果は次の呼び出しで上書きされるためコピーして渡す
      const chunk = Buffer.from(this.result());
      if (chunk.length > 0 && !output.write(chunk)) {
        // 書き込み先がエラーになっている場合は drain が発生しないので待たない
        if (output.errored) {
          throw output.errored;
        }
        await events.once(output, "drain");
      }
      if (n === 0) {
        break;
      }
      processed += n;
      if (onProgress) {
        const prev = progress;
        progress = Math.floor((processed / total) * 1000) / 1000;
        if (progress !== prev) {
          onProgress(progress);
        }
      }
    }
    output.end();
    await finished;
  }
}
