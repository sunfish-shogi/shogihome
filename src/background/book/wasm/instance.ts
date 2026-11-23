// 定跡の WebAssembly モジュール (wasm/book) のインスタンス。形式ごとのラッパーの共通部分。

import fs from "node:fs";
import { getAppLogger } from "@/background/log.js";
import { getBookWasmPath } from "@/background/proc/env.js";

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
  yane_search(ptr: number, len: number): number;
  yane_save_begin(ptr: number, len: number): number;
  yane_save_next(maxBytes: number): number;
  yane_save_position(): number;
};

let compiledModule: WebAssembly.Module | undefined;

function getModule(): WebAssembly.Module {
  if (!compiledModule) {
    compiledModule = new WebAssembly.Module(fs.readFileSync(getBookWasmPath()));
  }
  return compiledModule;
}

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

  /**
   * 元のファイルの pos から最大 len バイトを WebAssembly のメモリの ptr に読み込み、読み込めたバイト数を返す。
   * ファイルを WebAssembly 側から読む形式で実装する。
   */
  protected read(pos: number, ptr: number, len: number): number {
    void pos;
    void ptr;
    void len;
    throw new Error("reading files is not supported");
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
    const message = textDecoder.decode(
      this.bytes(this.exports.book_error_ptr(), this.exports.book_error_len()),
    );
    return new Error(message);
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
