import { isUtf8 } from "node:buffer";

// SBookState をデコード・再エンコードせずに、BoardKey と HandKey を取り除いたバイト列を作る。
//
// 出力は SBookState.decode → (BoardKey = 0, HandKey = 0) → SBookState.encode と
// バイト単位で一致しなければならない。ts-proto のエンコーダーはフィールド番号順に、
// 既定値 (0 や空文字) ではないフィールドだけを最短の形式で出力する。
// そこで、既定値のフィールドを取り除きながらバイト列をコピーする。
// フィールドの順序が異なる・同じフィールドが重複している・未知のフィールドがあるなど、
// 再エンコードの結果と一致させられる確証が無い場合は undefined を返す。
// 呼び出し元は undefined の場合に従来通りデコードと再エンコードを行う。

const enum FieldKind {
  Unknown = 0,
  Int32 = 1,
  Int64 = 2,
  String = 3,
  Message = 4,
  Drop = 5,
}

type FieldSchema = {
  kinds: FieldKind[];
  repeated: boolean[];
  nested: (FieldSchema | undefined)[];
};

function createSchema(fields: {
  [field: number]: { kind: FieldKind; repeated?: boolean; nested?: FieldSchema };
}): FieldSchema {
  const schema: FieldSchema = { kinds: [], repeated: [], nested: [] };
  for (let i = 0; i < 16; i++) {
    const f = fields[i];
    schema.kinds.push(f ? f.kind : FieldKind.Unknown);
    schema.repeated.push(!!f?.repeated);
    schema.nested.push(f?.nested);
  }
  return schema;
}

const SBOOK_MOVE_SCHEMA = createSchema({
  1: { kind: FieldKind.Int32 }, // Move
  2: { kind: FieldKind.Int32 }, // Evaluation (enum)
  3: { kind: FieldKind.Int32 }, // Weight
  4: { kind: FieldKind.Int32 }, // NextStateId
});

const SBOOK_EVAL_SCHEMA = createSchema({
  1: { kind: FieldKind.Int32 }, // EvaluationValue
  2: { kind: FieldKind.Int32 }, // Depth
  3: { kind: FieldKind.Int32 }, // SelDepth
  4: { kind: FieldKind.Int64 }, // Nodes
  5: { kind: FieldKind.String }, // Variation
  6: { kind: FieldKind.String }, // EngineName
});

const SBOOK_STATE_SCHEMA = createSchema({
  1: { kind: FieldKind.Int32 }, // Id
  2: { kind: FieldKind.Drop }, // BoardKey
  3: { kind: FieldKind.Drop }, // HandKey
  4: { kind: FieldKind.Int32 }, // Games
  5: { kind: FieldKind.Int32 }, // WonBlack
  6: { kind: FieldKind.Int32 }, // WonWhite
  7: { kind: FieldKind.String }, // Position
  8: { kind: FieldKind.String }, // Comment
  9: { kind: FieldKind.Message, repeated: true, nested: SBOOK_MOVE_SCHEMA }, // Moves
  10: { kind: FieldKind.Message, repeated: true, nested: SBOOK_EVAL_SCHEMA }, // Evals
});

const WIRE_VARINT = 0;
const WIRE_LEN = 2;
const STATE_TAG = 26; // field 3 (BookStates), wire type 2

const int32Scratch = new Uint8Array(10);

/** varint の終端オフセットを返す。不正な場合は -1 を返す。 */
function varintEnd(data: Uint8Array, offset: number, limit: number): number {
  for (let i = 0; i < 10; i++) {
    const p = offset + i;
    if (p >= limit) {
      return -1;
    }
    if ((data[p] & 0x80) === 0) {
      return p + 1;
    }
  }
  return -1;
}

/** BinaryWriter.uint32 が出力する最短形式の varint かどうか */
function isMinimalVarint(data: Uint8Array, start: number, end: number): boolean {
  return end - start === 1 || data[end - 1] !== 0;
}

/** 5 バイト以下の varint を読む (長さの読み取り用)。varint の範囲は呼び出し元で検証済みであること。 */
function readLengthVarint(data: Uint8Array, start: number, end: number): number {
  if (end - start > 5) {
    return -1;
  }
  let value = 0;
  for (let i = start, shift = 0; i < end; i++, shift += 7) {
    value += (data[i] & 0x7f) * 2 ** shift;
  }
  return value;
}

/** BinaryWriter.int32 と同じ形式で書き出し、そのバイト数を返す。 */
function encodeInt32(value: number, out: Uint8Array): number {
  let n = 0;
  if (value >= 0) {
    while (value > 0x7f) {
      out[n++] = (value & 0x7f) | 0x80;
      value >>>= 7;
    }
    out[n++] = value;
    return n;
  }
  for (let i = 0; i < 9; i++) {
    out[n++] = (value & 0x7f) | 0x80;
    value >>= 7;
  }
  out[n++] = 1;
  return n;
}
/** BinaryReader.int32 と同様に下位 32 bit を値として読む */
function readInt32Varint(data: Uint8Array, start: number, end: number): number {
  let value = 0;
  for (let i = 0; i < 5 && start + i < end; i++) {
    value |= (data[start + i] & 0x7f) << (7 * i);
  }
  return value;
}

/** 0 以外の int32 が BinaryWriter.int32 の出力と同じ形式で書かれているかどうか */
function isCanonicalInt32(value: number, data: Uint8Array, start: number, end: number): boolean {
  const n = encodeInt32(value, int32Scratch);
  if (n !== end - start) {
    return false;
  }
  for (let i = 0; i < n; i++) {
    if (data[start + i] !== int32Scratch[i]) {
      return false;
    }
  }
  return true;
}

/** BinaryReader.int64 と同様に下位 64 bit を値として読んだ場合に 0 になるかどうか */
function isZeroInt64Varint(data: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    // 10 バイト目は最下位 bit (bit 63) だけが値に含まれる
    const mask = i - start === 9 ? 0x01 : 0x7f;
    if (data[i] & mask) {
      return false;
    }
  }
  return true;
}

/** 0 以外の int64 が BinaryWriter.int64 の出力と同じ形式で書かれているかどうか */
function isCanonicalNonZeroInt64(data: Uint8Array, start: number, end: number): boolean {
  const length = end - start;
  if (length === 1) {
    return true;
  }
  if (data[end - 1] === 0) {
    return false;
  }
  // 10 バイトの場合は負数であり、最終バイトは必ず 1 になる
  return length < 10 || data[end - 1] === 1;
}

/** 空でない文字列が、デコードと再エンコードで変化しないかどうか */
function isRoundTripSafeString(data: Uint8Array, start: number, end: number): boolean {
  // TextDecoder は先頭の BOM を取り除くため再エンコードで変化する
  if (
    end - start >= 3 &&
    data[start] === 0xef &&
    data[start + 1] === 0xbb &&
    data[start + 2] === 0xbf
  ) {
    return false;
  }
  for (let i = start; i < end; i++) {
    if (data[i] > 0x7f) {
      // 不正な UTF-8 は U+FFFD に置き換えられるため再エンコードで変化する
      return isUtf8(data.subarray(start, end));
    }
  }
  return true;
}

function varintSize(value: number): number {
  let n = 1;
  while (value > 0x7f) {
    value >>>= 7;
    n++;
  }
  return n;
}

function writeVarint(out: Uint8Array, pos: number, value: number): number {
  while (value > 0x7f) {
    out[pos++] = (value & 0x7f) | 0x80;
    value >>>= 7;
  }
  out[pos++] = value;
  return pos;
}

function copyBytes(out: Uint8Array, pos: number, data: Uint8Array, start: number, end: number) {
  if (end - start > 32) {
    out.set(data.subarray(start, end), pos);
    return;
  }
  for (let i = start; i < end; i++) {
    out[pos++] = data[i];
  }
}

/**
 * data[start, end) のメッセージを正規形に変換して out[pos] 以降に書き込み、書き込み後の位置を返す。
 * out を省略した場合は書き込まずに正規形の長さだけを計算する。
 * 正規形に変換できない場合は -1 を返す。
 */
function emitCanonicalMessage(
  data: Uint8Array,
  start: number,
  end: number,
  schema: FieldSchema,
  out: Uint8Array | undefined,
  pos: number,
): number {
  let offset = start;
  let lastField = 0;
  while (offset < end) {
    // フィールド番号 15 以下なのでタグは必ず 1 バイトになる
    const tag = data[offset];
    if (tag & 0x80) {
      return -1;
    }
    const field = tag >>> 3;
    const wireType = tag & 7;
    const kind = schema.kinds[field] ?? FieldKind.Unknown;
    if (kind === FieldKind.Unknown) {
      return -1;
    }
    if (kind !== FieldKind.Drop) {
      // デコーダーは後に現れた値で上書きするため、順序の入れ替わりや重複があれば諦める
      if (field < lastField || (field === lastField && !schema.repeated[field])) {
        return -1;
      }
      lastField = field;
    }
    const fieldStart = offset;
    const valueStart = offset + 1;

    if (kind === FieldKind.Int32 || kind === FieldKind.Int64 || kind === FieldKind.Drop) {
      if (wireType !== WIRE_VARINT) {
        return -1;
      }
      const valueEnd = varintEnd(data, valueStart, end);
      if (valueEnd < 0) {
        return -1;
      }
      offset = valueEnd;
      if (kind === FieldKind.Drop) {
        continue;
      }
      if (kind === FieldKind.Int32) {
        const value = readInt32Varint(data, valueStart, valueEnd);
        if (value === 0) {
          continue; // 既定値は出力されない
        }
        if (!isCanonicalInt32(value, data, valueStart, valueEnd)) {
          return -1;
        }
      } else {
        if (isZeroInt64Varint(data, valueStart, valueEnd)) {
          continue; // 既定値は出力されない
        }
        if (!isCanonicalNonZeroInt64(data, valueStart, valueEnd)) {
          return -1;
        }
      }
      if (out) {
        copyBytes(out, pos, data, fieldStart, valueEnd);
      }
      pos += valueEnd - fieldStart;
      continue;
    }

    // String or Message
    if (wireType !== WIRE_LEN) {
      return -1;
    }
    const lengthEnd = varintEnd(data, valueStart, end);
    if (lengthEnd < 0) {
      return -1;
    }
    const length = readLengthVarint(data, valueStart, lengthEnd);
    if (length < 0 || lengthEnd + length > end) {
      return -1;
    }
    const valueEnd = lengthEnd + length;
    offset = valueEnd;

    if (kind === FieldKind.String) {
      if (length === 0) {
        continue; // 空文字は出力されない
      }
      if (
        !isMinimalVarint(data, valueStart, lengthEnd) ||
        !isRoundTripSafeString(data, lengthEnd, valueEnd)
      ) {
        return -1;
      }
      if (out) {
        copyBytes(out, pos, data, fieldStart, valueEnd);
      }
      pos += valueEnd - fieldStart;
      continue;
    }

    // Message (repeated のため空でも出力される)
    const nested = schema.nested[field]!;
    const nestedLength = emitCanonicalMessage(data, lengthEnd, valueEnd, nested, undefined, 0);
    if (nestedLength < 0) {
      return -1;
    }
    if (!out) {
      pos += 1 + varintSize(nestedLength) + nestedLength;
      continue;
    }
    out[pos++] = tag;
    pos = writeVarint(out, pos, nestedLength);
    pos = emitCanonicalMessage(data, lengthEnd, valueEnd, nested, out, pos);
  }
  return pos;
}

/**
 * ファイル内の stateTagOffset から始まる SBookState (タグと長さを含む) について、
 * BoardKey と HandKey を取り除き、再エンコードした場合と同じバイト列をタグと長さ付きで返す。
 * 再エンコードの結果と一致することが保証できない場合は undefined を返す。
 */
export function copySbkStateWithoutHashKeys(
  data: Uint8Array,
  stateTagOffset: number,
): Uint8Array | undefined {
  if (data[stateTagOffset] !== STATE_TAG) {
    return;
  }
  const lengthOffset = stateTagOffset + 1;
  const lengthEnd = varintEnd(data, lengthOffset, data.length);
  if (lengthEnd < 0) {
    return;
  }
  const payloadLength = readLengthVarint(data, lengthOffset, lengthEnd);
  if (payloadLength < 0 || lengthEnd + payloadLength > data.length) {
    return;
  }

  // 正規形は元のバイト列より長くならない。
  // 先頭にタグと長さ (最大 1 + 5 バイト) を書くための領域を空けて書き込む。
  const headerSpace = 6;
  const out = new Uint8Array(headerSpace + payloadLength);
  const written = emitCanonicalMessage(
    data,
    lengthEnd,
    lengthEnd + payloadLength,
    SBOOK_STATE_SCHEMA,
    out,
    headerSpace,
  );
  if (written < 0) {
    return;
  }
  const outLength = written - headerSpace;
  const headerStart = headerSpace - 1 - varintSize(outLength);
  out[headerStart] = STATE_TAG;
  writeVarint(out, headerStart + 1, outLength);
  return out.subarray(headerStart, written);
}
