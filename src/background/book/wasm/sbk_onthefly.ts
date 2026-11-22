// SBK 形式の On-the-fly モードの WebAssembly 版 (wasm/book)。
// 元のファイルの内容と索引を WebAssembly のメモリ上に保持し、検索と書き出しを行う。
// 編集内容 (in-memory のエントリー) は JavaScript 側で保持し、書き出す時に渡す。

import events from "node:events";
import fs from "node:fs";
import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { getAppLogger } from "@/background/log.js";
import { bookWasmBase64 } from "./binary.js";
import { decodeEntry, Decoder, encodeEntry, Encoder } from "./codec.js";

type BookWasmExports = {
  memory: WebAssembly.Memory;
  book_alloc(len: number): number;
  book_free(ptr: number, len: number): void;
  book_result_ptr(): number;
  book_result_len(): number;
  book_error_ptr(): number;
  book_error_len(): number;
  sbk_open(ptr: number, len: number): number;
  sbk_create(): void;
  sbk_search(ptr: number, len: number): number;
  sbk_save_begin(ptr: number, len: number): number;
  sbk_save_next(maxStates: number): number;
};

let compiledModule: WebAssembly.Module | undefined;

function getModule(): WebAssembly.Module {
  if (!compiledModule) {
    compiledModule = new WebAssembly.Module(Buffer.from(bookWasmBase64, "base64"));
  }
  return compiledModule;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// WebAssembly (wasm32) のメモリの上限は 4 GiB
const MAX_FILE_SIZE = 0xffff0000;
// ファイルを読み込む単位
const READ_CHUNK_SIZE = 16 * 1024 * 1024;
// 1 回の呼び出しで書き出す State の数
const SAVE_CHUNK_STATES = 4096;

export class SbkWasmOnTheFly {
  private exports: BookWasmExports;
  private _author?: string;
  private _description?: string;
  private _stateCount = 0;
  private saving = false;

  /**
   * インスタンスごとに独立したメモリを持ち、参照されなくなると GC によってメモリが解放される。
   * WebAssembly モジュールを初期化できない場合は例外を投げる。
   */
  private constructor() {
    const instance = new WebAssembly.Instance(getModule(), {});
    this.exports = instance.exports as unknown as BookWasmExports;
  }

  /** 元のファイルが無い空の定跡を作る */
  static create(): SbkWasmOnTheFly {
    const book = new SbkWasmOnTheFly();
    book.exports.sbk_create();
    return book;
  }

  /** SBK ファイルを開く */
  static async open(path: string): Promise<SbkWasmOnTheFly> {
    const book = new SbkWasmOnTheFly();
    const file = await fs.promises.open(path, "r");
    try {
      const { size } = await file.stat();
      if (size > MAX_FILE_SIZE) {
        throw new Error(`The file is too large: ${path} (${size} bytes)`);
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

  private bytes(ptr: number, len: number): Uint8Array {
    // メモリが拡張されると ArrayBuffer が差し替わるため、呼び出しのたびに取得する
    return new Uint8Array(this.exports.memory.buffer, ptr, len);
  }

  private result(): Uint8Array {
    return this.bytes(this.exports.book_result_ptr(), this.exports.book_result_len());
  }

  private error(): Error {
    const message = textDecoder.decode(
      this.bytes(this.exports.book_error_ptr(), this.exports.book_error_len()),
    );
    return new Error(message);
  }

  /** data を WebAssembly のメモリにコピーして fn を呼び出す */
  private withInput<T>(data: Uint8Array, fn: (ptr: number, len: number) => T): T {
    const ptr = this.exports.book_alloc(data.length);
    try {
      this.bytes(ptr, data.length).set(data);
      return fn(ptr, data.length);
    } finally {
      this.exports.book_free(ptr, data.length);
    }
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
    await events.once(output, "finish");
  }
}

/**
 * WebAssembly モジュールを初期化できるか確認する。
 * 初期化できない場合はログを出力して false を返す。呼び出し元は JavaScript 版にフォールバックする。
 */
export function isBookWasmAvailable(): boolean {
  try {
    getModule();
    return true;
  } catch (e) {
    getAppLogger().warn("failed to initialize WebAssembly book module: %s", e);
    return false;
  }
}
