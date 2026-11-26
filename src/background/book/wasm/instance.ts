// 定跡の WebAssembly モジュール (wasm/book) のインスタンス。形式ごとのラッパーの共通部分。

import events from "node:events";
import fs from "node:fs";
import { Writable } from "node:stream";
import { BookEntry } from "@/background/book/types.js";
import { getAppLogger } from "@/background/log.js";
import { getBookWasmPath } from "@/background/proc/env.js";
import { decodeEntry, Decoder, encodeEntry, Encoder } from "./codec.js";

export type BookWasmExports = {
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
  yane_open(size: number): number;
  yane_load(ptr: number, len: number): number;
  yane_create(): void;
  yane_search(ptr: number, len: number): number;
  yane_save_begin(ptr: number, len: number): number;
  yane_save_next(maxBytes: number): number;
  yane_save_progress(): number;
  yane_export_sbk_begin(ptr: number, len: number): number;
  yane_export_ybb_begin(ptr: number, len: number): number;
  sbk_export_yane_begin(ptr: number, len: number): number;
  sbk_export_ybb_begin(ptr: number, len: number): number;
  ybb_open(): number;
  ybb_create(): void;
  ybb_search(ptr: number, len: number): number;
  ybb_save_begin(ptr: number, len: number): number;
  ybb_save_next(maxBytes: number): number;
  ybb_save_progress(): number;
  ybb_export_yane_begin(ptr: number, len: number): number;
  ybb_export_sbk_begin(ptr: number, len: number): number;
};

let compiledModule: WebAssembly.Module | undefined;

function getModule(): WebAssembly.Module {
  if (!compiledModule) {
    compiledModule = new WebAssembly.Module(fs.readFileSync(getBookWasmPath()));
  }
  return compiledModule;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// アドレスを返す関数。wasm32 のアドレスは符号なし 32 bit だが、JavaScript には符号付きの i32 として
// 渡されるため、メモリの後半 2 GiB にある領域のアドレスは負の値になる。符号なしの値に変換して扱う。
const POINTER_FUNCTIONS = new Set(["book_alloc", "book_result_ptr", "book_error_ptr"]);

/**
 * WebAssembly モジュールが異常終了した (メモリ不足や不具合によるトラップ) ことを表す。
 * 異常終了したインスタンスは以後使えない。
 */
export class BookWasmCrashError extends Error {
  constructor(cause: unknown) {
    super(`WebAssembly book module crashed: ${cause}`, { cause });
    this.name = "BookWasmCrashError";
  }
}

/**
 * WebAssembly モジュールのインスタンス。
 * インスタンスごとに独立したメモリを持ち、参照されなくなると GC によってメモリが解放される。
 */
export abstract class BookWasmInstance {
  protected raw: BookWasmExports;
  protected exports: BookWasmExports;
  private crashed?: BookWasmCrashError;

  /** WebAssembly モジュールを初期化できない場合は例外を投げる。 */
  protected constructor() {
    const instance = new WebAssembly.Instance(getModule(), {
      env: {
        // 元のファイルの読み込み。例外は WebAssembly の中を通過させずに -1 を返す。
        // (Rust 側の状態が中途半端なまま残り、以後の呼び出しが誤動作するのを防ぐ)
        book_read: (pos: number, ptr: number, len: number): number => {
          try {
            return this.read(pos, ptr >>> 0, len >>> 0);
          } catch (e) {
            getAppLogger().error("failed to read the book file: %s", e);
            return -1;
          }
        },
      },
    });
    // exports は変更できないため、テストで差し替えられるように複製して保持する
    this.raw = { ...instance.exports } as unknown as BookWasmExports;
    this.exports = this.guard();
  }

  // WebAssembly 側から読む元のファイル (ファイルの内容をメモリに読み込まない形式のみ)
  private fd?: number;
  private readError?: unknown;

  /** WebAssembly 側から読む元のファイルを開く */
  protected openFile(path: string): number {
    this.fd = fs.openSync(path, "r");
    return fs.fstatSync(this.fd).size;
  }

  /** 元のファイルを閉じる (開いている場合)。閉じた後は検索や書き出しはできない。 */
  close(): void {
    if (this.fd !== undefined) {
      fs.closeSync(this.fd);
      this.fd = undefined;
    }
  }

  /**
   * 元のファイルの pos から最大 len バイトを WebAssembly のメモリの ptr に読み込み、読み込めたバイト数を返す。
   */
  private read(pos: number, ptr: number, len: number): number {
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

  /**
   * 関数の呼び出しを監視するラッパーを作る。アドレスを返す関数の戻り値は符号なしの値に変換する。
   * トラップが発生した場合は BookWasmCrashError を投げ、以後の呼び出しも同じエラーにする。
   * (異常終了した時点の状態が残っているため、続けて呼び出すと誤動作する可能性がある)
   */
  private guard(): BookWasmExports {
    const guarded = {} as Record<string, unknown>;
    for (const name of Object.keys(this.raw)) {
      if (name === "memory") {
        continue;
      }
      guarded[name] = (...args: number[]) => {
        if (this.crashed) {
          throw this.crashed;
        }
        try {
          const fn = this.raw[name as keyof BookWasmExports] as (...a: number[]) => number;
          const result = fn(...args);
          return POINTER_FUNCTIONS.has(name) ? result >>> 0 : result;
        } catch (e) {
          if (e instanceof WebAssembly.RuntimeError) {
            this.crashed = new BookWasmCrashError(e);
            getAppLogger().error("WebAssembly book module crashed: %s", e);
            throw this.crashed;
          }
          throw e;
        }
      };
    }
    Object.defineProperty(guarded, "memory", { get: () => this.raw.memory });
    return guarded as unknown as BookWasmExports;
  }

  protected bytes(ptr: number, len: number): Uint8Array {
    // メモリが拡張されると ArrayBuffer が差し替わるため、呼び出しのたびに取得する
    return new Uint8Array(this.exports.memory.buffer, ptr, len);
  }

  protected result(): Uint8Array {
    return this.bytes(this.exports.book_result_ptr(), this.exports.book_result_len());
  }

  protected error(): Error {
    // 元のファイルの読み込みに失敗した場合は、その原因を返す
    const readError = this.readError;
    this.readError = undefined;
    if (readError instanceof Error) {
      return readError;
    }
    const message = textDecoder.decode(
      this.bytes(this.exports.book_error_ptr(), this.exports.book_error_len()),
    );
    return new Error(message);
  }

  /** fn (xxx_search) で局面を検索する */
  protected searchWith(
    sfen: string,
    fn: (ptr: number, len: number) => number,
  ): BookEntry | undefined {
    const r = this.withInput(textEncoder.encode(sfen), fn);
    if (r < 0) {
      throw this.error();
    }
    if (r === 0) {
      return;
    }
    return decodeEntry(new Decoder(this.result()));
  }

  private saving = false;

  /**
   * 書き出しを行う。書き出しの状態は WebAssembly 側に 1 つしか持てないため、同時に書き出すことはできない。
   */
  protected async exclusive(fn: () => Promise<void>): Promise<void> {
    if (this.saving) {
      throw new Error("The book is already being saved.");
    }
    this.saving = true;
    try {
      await fn();
    } finally {
      this.saving = false;
    }
  }

  /** 編集内容を受け渡し形式にする ([エントリーの数, (キー, エントリー) × エントリーの数]) */
  protected encodePatches(entries: Map<string, BookEntry>): Uint8Array {
    const encoder = new Encoder();
    encoder.u32(entries.size);
    for (const [sfen, entry] of entries) {
      encoder.str(sfen);
      encodeEntry(encoder, entry);
    }
    return encoder.bytes;
  }

  /** begin で書き出しを開始し、sbk_save_next で SBK 形式の続きを書き出す。begin は State の総数を返す。 */
  protected async writeSbk(
    begin: (ptr: number, len: number) => number,
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    let total = 0;
    let processed = 0;
    await this.write(
      output,
      () => {
        total = this.withInput(this.encodePatches(entries), begin);
        if (total < 0) {
          throw this.error();
        }
      },
      () => {
        const n = this.exports.sbk_save_next(SAVE_CHUNK_STATES);
        if (n < 0) {
          throw this.error();
        }
        processed += n;
        return n === 0;
      },
      () => (total > 0 ? processed / total : 0),
      onProgress,
    );
  }

  /** begin で書き出しを開始し、yane_save_next でやねうら王形式の続きを書き出す */
  protected async writeYane(
    begin: (ptr: number, len: number) => number,
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.write(
      output,
      () => {
        if (this.withInput(this.encodePatches(entries), begin) < 0) {
          throw this.error();
        }
      },
      () => {
        const status = this.exports.yane_save_next(SAVE_CHUNK_BYTES);
        if (status < 0) {
          throw this.error();
        }
        return status === 0;
      },
      () => this.exports.yane_save_progress(),
      onProgress,
    );
  }

  /** begin で書き出しを開始し、ybb_save_next で YBB 形式の続きを書き出す */
  protected async writeYbb(
    begin: (ptr: number, len: number) => number,
    entries: Map<string, BookEntry>,
    output: Writable,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.write(
      output,
      () => {
        if (this.withInput(this.encodePatches(entries), begin) < 0) {
          throw this.error();
        }
      },
      () => {
        const status = this.exports.ybb_save_next(SAVE_CHUNK_BYTES);
        if (status < 0) {
          throw this.error();
        }
        return status === 0;
      },
      () => this.exports.ybb_save_progress(),
      onProgress,
    );
  }

  /**
   * next が true を返すまで呼び出し、結果を output に書き込む。output は書き出し後に閉じられる。
   */
  private async write(
    output: Writable,
    begin: () => void,
    next: () => boolean,
    progress: () => number,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    await this.exclusive(async () => {
      // 書き込み先がエラーになった場合 (開けなかった場合など) も、最後に finished を待ってエラーを返す
      const finished = events.once(output, "finish");
      finished.catch(() => {});
      begin();
      let lastProgress = 0;
      for (;;) {
        const done = next();
        // メモリ上の結果は次の呼び出しで上書きされるためコピーして渡す
        const chunk = Buffer.from(this.result());
        if (chunk.length > 0 && !output.write(chunk)) {
          // 書き込み先がエラーになっている場合は drain が発生しないので待たない
          if (output.errored) {
            throw output.errored;
          }
          await events.once(output, "drain");
        }
        if (done) {
          break;
        }
        if (onProgress) {
          const p = Math.floor(progress() * 1000) / 1000;
          if (p !== lastProgress) {
            lastProgress = p;
            onProgress(p);
          }
        }
      }
      output.end();
      await finished;
    });
  }

  /** data を WebAssembly のメモリにコピーして fn を呼び出す */
  protected withInput<T>(data: Uint8Array, fn: (ptr: number, len: number) => T): T {
    const ptr = this.exports.book_alloc(data.length);
    try {
      this.bytes(ptr, data.length).set(data);
      return fn(ptr, data.length);
    } finally {
      this.exports.book_free(ptr, data.length);
    }
  }
}

// 1 回の呼び出しで書き出す量 (SBK 形式は State の数、やねうら王形式はバイト数の目安)
const SAVE_CHUNK_STATES = 4096;
const SAVE_CHUNK_BYTES = 1024 * 1024;

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
