// 定跡データを WebAssembly モジュール (wasm/book) のメモリ上に保持する SBK 用のストア。
// JavaScript 版の Map<string, BookEntry> と同じように使える。
// get が返すエントリーはコピーなので、変更した場合は set で書き戻す必要がある。

import events from "node:events";
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
  book_clear(): void;
  book_size(): number;
  book_load_sbk(ptr: number, len: number): number;
  book_get(ptr: number, len: number): number;
  book_set(keyPtr: number, keyLen: number, entryPtr: number, entryLen: number): number;
  book_entries(start: number, count: number): number;
  book_get_sbk_meta(): number;
  book_set_sbk_meta(ptr: number, len: number): number;
  book_save_sbk_begin(): number;
  book_save_sbk_next(maxStates: number): number;
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

// 列挙の際に 1 回の呼び出しで取得するエントリーの数
const ITERATION_CHUNK_ENTRIES = 1024;

// 1 回の呼び出しで書き出す State の数
const SAVE_CHUNK_STATES = 4096;

export class SbkWasmStore {
  private exports: BookWasmExports;
  private encoder = new Encoder();

  /**
   * ストアを作る。インスタンスごとに独立したメモリを持ち、
   * 参照されなくなると GC によってメモリが解放される。
   */
  constructor() {
    const instance = new WebAssembly.Instance(getModule(), {});
    this.exports = instance.exports as unknown as BookWasmExports;
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

  private withInput2<T>(
    a: Uint8Array,
    b: Uint8Array,
    fn: (aPtr: number, aLen: number, bPtr: number, bLen: number) => T,
  ): T {
    return this.withInput(a, (aPtr, aLen) =>
      this.withInput(b, (bPtr, bLen) => fn(aPtr, aLen, bPtr, bLen)),
    );
  }

  get size(): number {
    return this.exports.book_size();
  }

  clear(): void {
    this.exports.book_clear();
  }

  /** SBK ファイルの内容を読み込む (既存の内容は破棄される) */
  loadSbk(data: Uint8Array): void {
    if (this.withInput(data, (ptr, len) => this.exports.book_load_sbk(ptr, len)) < 0) {
      throw this.error();
    }
  }

  get(sfen: string): BookEntry | undefined {
    const r = this.withInput(textEncoder.encode(sfen), (ptr, len) =>
      this.exports.book_get(ptr, len),
    );
    if (r < 0) {
      throw this.error();
    }
    if (r === 0) {
      return;
    }
    return decodeEntry(new Decoder(this.result()));
  }

  has(sfen: string): boolean {
    return this.get(sfen) !== undefined;
  }

  set(sfen: string, entry: BookEntry): this {
    this.encoder.reset();
    encodeEntry(this.encoder, entry);
    const r = this.withInput2(
      textEncoder.encode(sfen),
      this.encoder.bytes,
      (kPtr, kLen, ePtr, eLen) => this.exports.book_set(kPtr, kLen, ePtr, eLen),
    );
    if (r < 0) {
      throw this.error();
    }
    return this;
  }

  /** 挿入順にエントリーを列挙する。列挙中に変更した場合の動作は保証しない。 */
  *entries(): IterableIterator<[string, BookEntry]> {
    const size = this.size;
    for (let start = 0; start < size;) {
      const n = this.exports.book_entries(start, ITERATION_CHUNK_ENTRIES);
      if (n <= 0) {
        break;
      }
      // 列挙中に別の呼び出しが行われても壊れないよう、先にまとめてデコードする
      const d = new Decoder(this.result());
      const chunk: [string, BookEntry][] = [];
      for (let i = 0; i < n; i++) {
        const sfen = d.str();
        chunk.push([sfen, decodeEntry(d)]);
      }
      yield* chunk;
      start += n;
    }
  }

  [Symbol.iterator](): IterableIterator<[string, BookEntry]> {
    return this.entries();
  }

  get sbkMeta(): { author: string; description: string } {
    this.exports.book_get_sbk_meta();
    const d = new Decoder(this.result());
    return { author: d.str(), description: d.str() };
  }

  set sbkMeta(meta: { author: string; description: string }) {
    const e = new Encoder();
    e.str(meta.author);
    e.str(meta.description);
    if (this.withInput(e.bytes, (ptr, len) => this.exports.book_set_sbk_meta(ptr, len)) < 0) {
      throw this.error();
    }
  }

  /** SBK 形式で書き出す。output は書き出し後に閉じられる。 */
  async storeSbk(output: Writable, onProgress?: (progress: number) => void): Promise<void> {
    const total = this.exports.book_save_sbk_begin();
    if (total < 0) {
      throw this.error();
    }
    // 局面の列挙を終えた時点で 3 割とする (JavaScript 版と同じ配分)
    let progress = 0.3;
    onProgress?.(progress);
    let written = 0;
    for (;;) {
      const n = this.exports.book_save_sbk_next(SAVE_CHUNK_STATES);
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
      written += n;
      if (onProgress) {
        const prev = progress;
        progress = 0.3 + Math.floor((written / total) * 700) / 1000;
        if (progress > prev) {
          onProgress(progress);
        }
      }
    }
    output.end();
    await events.once(output, "finish");
  }
}

/**
 * WebAssembly のストアを作る。
 * WebAssembly モジュールを初期化できない場合はログを出力して undefined を返す。
 * 呼び出し元は JavaScript 版にフォールバックする。
 */
export function tryCreateSbkWasmStore(): SbkWasmStore | undefined {
  try {
    return new SbkWasmStore();
  } catch (e) {
    getAppLogger().warn("failed to initialize WebAssembly book module: %s", e);
    return;
  }
}
