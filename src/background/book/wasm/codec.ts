// WebAssembly モジュールとの間で BookEntry を受け渡すためのバイナリ形式。
// 形式は specs/book-wasm.md を参照。Rust 側の実装は wasm/book/src/codec.rs。

import { BookMove } from "@/common/book.js";
import { BookEntry, SbkEval } from "@/background/book/types.js";

const ENTRY_PATCH = 1;
const ENTRY_MIN_PLY = 2;
const ENTRY_COMMENT = 4;
const ENTRY_GAMES = 8;
const ENTRY_WON_BLACK = 16;
const ENTRY_WON_WHITE = 32;
const ENTRY_SBK_EVALS = 64;

const MOVE_USI2 = 1;
const MOVE_SCORE = 2;
const MOVE_DEPTH = 4;
const MOVE_COUNT = 8;
const MOVE_COMMENT = 16;
const MOVE_SBK_EVAL = 32;
const MOVE_SBK_ID = 64;

const EVAL_VARIATION = 1;
const EVAL_ENGINE_NAME = 2;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class Encoder {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  reset(): void {
    this.pos = 0;
  }

  get bytes(): Uint8Array {
    return this.buf.subarray(0, this.pos);
  }

  private reserve(n: number): void {
    if (this.pos + n <= this.buf.length) {
      return;
    }
    let size = this.buf.length * 2;
    while (size < this.pos + n) {
      size *= 2;
    }
    const buf = new Uint8Array(size);
    buf.set(this.buf.subarray(0, this.pos));
    this.buf = buf;
    this.view = new DataView(buf.buffer);
  }

  u8(v: number): void {
    this.reserve(1);
    this.buf[this.pos++] = v;
  }

  u32(v: number): void {
    this.reserve(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }

  f64(v: number): void {
    this.reserve(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
  }

  i64(v: bigint): void {
    this.reserve(8);
    this.view.setBigInt64(this.pos, BigInt.asIntN(64, v), true);
    this.pos += 8;
  }

  str(s: string): void {
    // UTF-8 は UTF-16 の 3 倍を超えない
    this.reserve(4 + s.length * 3);
    const { written } = textEncoder.encodeInto(s, this.buf.subarray(this.pos + 4));
    this.view.setUint32(this.pos, written, true);
    this.pos += 4 + written;
  }
}

export class Decoder {
  private view: DataView;
  private pos = 0;

  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  u8(): number {
    return this.buf[this.pos++];
  }

  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  i64(): bigint {
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }

  str(): string {
    const len = this.u32();
    const start = this.pos;
    this.pos += len;
    // SFEN や USI などの短い ASCII 文字列は TextDecoder を使うより速い
    if (len <= 128) {
      let ascii = true;
      for (let i = start; i < this.pos; i++) {
        if (this.buf[i] > 0x7f) {
          ascii = false;
          break;
        }
      }
      if (ascii) {
        return String.fromCharCode.apply(
          null,
          this.buf.subarray(start, this.pos) as unknown as number[],
        );
      }
    }
    return textDecoder.decode(this.buf.subarray(start, this.pos));
  }
}

export function encodeEntry(e: Encoder, entry: BookEntry): void {
  let flags = 0;
  if (entry.type === "patch") {
    flags |= ENTRY_PATCH;
  }
  if (entry.minPly !== undefined) {
    flags |= ENTRY_MIN_PLY;
  }
  if (entry.comment !== undefined) {
    flags |= ENTRY_COMMENT;
  }
  if (entry.games !== undefined) {
    flags |= ENTRY_GAMES;
  }
  if (entry.wonBlack !== undefined) {
    flags |= ENTRY_WON_BLACK;
  }
  if (entry.wonWhite !== undefined) {
    flags |= ENTRY_WON_WHITE;
  }
  if (entry.sbkEvals !== undefined) {
    flags |= ENTRY_SBK_EVALS;
  }
  e.u8(flags);
  if (entry.minPly !== undefined) {
    e.f64(entry.minPly);
  }
  if (entry.comment !== undefined) {
    e.str(entry.comment);
  }
  if (entry.games !== undefined) {
    e.f64(entry.games);
  }
  if (entry.wonBlack !== undefined) {
    e.f64(entry.wonBlack);
  }
  if (entry.wonWhite !== undefined) {
    e.f64(entry.wonWhite);
  }
  e.u32(entry.moves.length);
  for (const m of entry.moves) {
    e.str(m.usi);
    let mf = 0;
    if (m.usi2 !== undefined) {
      mf |= MOVE_USI2;
    }
    if (m.score !== undefined) {
      mf |= MOVE_SCORE;
    }
    if (m.depth !== undefined) {
      mf |= MOVE_DEPTH;
    }
    if (m.count !== undefined) {
      mf |= MOVE_COUNT;
    }
    if (m.comment !== undefined) {
      mf |= MOVE_COMMENT;
    }
    if (m.sbkEval !== undefined) {
      mf |= MOVE_SBK_EVAL;
    }
    if (m.sbkId !== undefined) {
      mf |= MOVE_SBK_ID;
    }
    e.u8(mf);
    if (m.usi2 !== undefined) {
      e.str(m.usi2);
    }
    if (m.score !== undefined) {
      e.f64(m.score);
    }
    if (m.depth !== undefined) {
      e.f64(m.depth);
    }
    if (m.count !== undefined) {
      e.f64(m.count);
    }
    if (m.comment !== undefined) {
      e.str(m.comment);
    }
    if (m.sbkEval !== undefined) {
      e.f64(m.sbkEval);
    }
    if (m.sbkId !== undefined) {
      e.f64(m.sbkId);
    }
  }
  if (entry.sbkEvals !== undefined) {
    e.u32(entry.sbkEvals.length);
    for (const ev of entry.sbkEvals) {
      e.f64(ev.EvaluationValue);
      e.f64(ev.Depth);
      e.f64(ev.SelDepth);
      e.i64(ev.Nodes);
      let ef = 0;
      if (ev.Variation !== undefined) {
        ef |= EVAL_VARIATION;
      }
      if (ev.EngineName !== undefined) {
        ef |= EVAL_ENGINE_NAME;
      }
      e.u8(ef);
      if (ev.Variation !== undefined) {
        e.str(ev.Variation);
      }
      if (ev.EngineName !== undefined) {
        e.str(ev.EngineName);
      }
    }
  }
}

export function decodeEntry(d: Decoder): BookEntry {
  const flags = d.u8();
  const entry: BookEntry = {
    type: flags & ENTRY_PATCH ? "patch" : "normal",
    moves: [],
  };
  if (flags & ENTRY_MIN_PLY) {
    entry.minPly = d.f64();
  }
  if (flags & ENTRY_COMMENT) {
    entry.comment = d.str();
  }
  if (flags & ENTRY_GAMES) {
    entry.games = d.f64();
  }
  if (flags & ENTRY_WON_BLACK) {
    entry.wonBlack = d.f64();
  }
  if (flags & ENTRY_WON_WHITE) {
    entry.wonWhite = d.f64();
  }
  const moveCount = d.u32();
  for (let i = 0; i < moveCount; i++) {
    const move: BookMove = { usi: d.str() };
    const mf = d.u8();
    if (mf & MOVE_USI2) {
      move.usi2 = d.str();
    }
    if (mf & MOVE_SCORE) {
      move.score = d.f64();
    }
    if (mf & MOVE_DEPTH) {
      move.depth = d.f64();
    }
    if (mf & MOVE_COUNT) {
      move.count = d.f64();
    }
    if (mf & MOVE_COMMENT) {
      move.comment = d.str();
    }
    if (mf & MOVE_SBK_EVAL) {
      move.sbkEval = d.f64();
    }
    if (mf & MOVE_SBK_ID) {
      move.sbkId = d.f64();
    }
    entry.moves.push(move);
  }
  if (flags & ENTRY_SBK_EVALS) {
    const n = d.u32();
    const evals: SbkEval[] = [];
    for (let i = 0; i < n; i++) {
      const ev: SbkEval = {
        EvaluationValue: d.f64(),
        Depth: d.f64(),
        SelDepth: d.f64(),
        Nodes: d.i64(),
      };
      const ef = d.u8();
      if (ef & EVAL_VARIATION) {
        ev.Variation = d.str();
      }
      if (ef & EVAL_ENGINE_NAME) {
        ev.EngineName = d.str();
      }
      evals.push(ev);
    }
    entry.sbkEvals = evals;
  }
  return entry;
}
