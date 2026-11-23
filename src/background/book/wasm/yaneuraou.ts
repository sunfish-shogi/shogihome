// やねうら王形式の WebAssembly 版 (wasm/book) の On-the-fly モード。
// JavaScript 版の On-the-fly モードと同じく、元のファイルはメモリに読み込まず、検索や書き出しに必要な部分を
// その都度読む (WebAssembly 側から env.book_read を通して同期的に読む)。
// 編集内容 (in-memory のエントリー) は JavaScript 側で保持し、書き出す時に渡す。

import events from "node:events";
import fs from "node:fs";
import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { decodeEntry, Decoder, encodeEntry, Encoder } from "./codec.js";
import { BookWasmInstance } from "./instance.js";

const textEncoder = new TextEncoder();

// 1 回の呼び出しで書き出すバイト数の目安
const SAVE_CHUNK_BYTES = 1024 * 1024;

export class YaneWasmBook extends BookWasmInstance {
  private fd?: number;
  private size = 0;
  private readError?: unknown;
  private saving = false;

  /**
   * やねうら王形式のファイルを On-the-fly モードで開く。
   * JavaScript 版と同じく、先頭の局面が整列されていない場合はエラーにする。
   */
  static open(path: string): YaneWasmBook {
    const book = new YaneWasmBook();
    book.fd = fs.openSync(path, "r");
    try {
      book.size = fs.fstatSync(book.fd).size;
      const r = book.exports.yane_open(book.size);
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

  /** 元のファイルを閉じる。閉じた後は検索や書き出しはできない。 */
  close(): void {
    if (this.fd !== undefined) {
      fs.closeSync(this.fd);
      this.fd = undefined;
    }
  }

  protected read(pos: number, ptr: number, len: number): number {
    if (this.fd === undefined) {
      throw new Error("The book file is closed.");
    }
    try {
      return fs.readSync(this.fd, this.bytes(ptr, len), 0, len, pos);
    } catch (e) {
      this.readError = e;
      throw e;
    }
  }

  protected error(): Error {
    // 読み込みに失敗した場合は、その原因を返す
    const readError = this.readError;
    this.readError = undefined;
    if (readError instanceof Error) {
      return readError;
    }
    return super.error();
  }

  /** 元のファイルから局面を検索する (searchYaneuraOuBookMovesOnTheFly に相当する) */
  search(sfen: string): BookEntry | undefined {
    const r = this.withInput(textEncoder.encode(sfen), (ptr, len) =>
      this.exports.yane_search(ptr, len),
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
   * 元のファイルに in-memory のエントリーを統合してやねうら王形式で書き出す
   * (mergeYaneuraOuBook に相当する)。output は書き出し後に閉じられる。
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
    const r = this.withInput(encoder.bytes, (ptr, len) => this.exports.yane_save_begin(ptr, len));
    if (r < 0) {
      throw this.error();
    }
    let progress = 0;
    for (;;) {
      const status = this.exports.yane_save_next(SAVE_CHUNK_BYTES);
      if (status < 0) {
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
      if (status === 0) {
        break;
      }
      if (onProgress && this.size > 0) {
        const prev = progress;
        progress = Math.floor((this.exports.yane_save_position() / this.size) * 1000) / 1000;
        if (progress !== prev) {
          onProgress(progress);
        }
      }
    }
    output.end();
    await finished;
  }
}
