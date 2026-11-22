import fs from "node:fs";
import { BinaryWriter } from "@bufbuild/protobuf/wire";
import { SBookState } from "@/background/book/proto/sbk.js";
import { copySbkStateWithoutHashKeys } from "@/background/book/sbk_state_copy.js";

// 従来の処理 (デコード → BoardKey/HandKey を 0 にする → 再エンコード) の結果
function reencode(payload: Uint8Array): Buffer {
  const state = SBookState.decode(payload);
  state.BoardKey = 0n;
  state.HandKey = 0;
  const writer = new BinaryWriter();
  SBookState.encode(state, writer.uint32(26).fork()).join();
  return Buffer.from(writer.finish());
}

function readVarint(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  for (let shift = 0; ; shift += 7) {
    const b = data[offset++];
    value += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) {
      return [value, offset];
    }
  }
}

function varint(value: number | bigint): number[] {
  let v = BigInt.asUintN(64, BigInt(value));
  const bytes: number[] = [];
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return bytes;
}

function int32(value: number): number[] {
  // int32 の負数は 64 bit に符号拡張して 10 バイトで表す
  return varint(BigInt(value));
}

function lengthDelimited(field: number, payload: number[]): number[] {
  return [(field << 3) | 2, ...varint(payload.length), ...payload];
}

function stateBytes(payload: number[]): Uint8Array {
  return new Uint8Array([26, ...varint(payload.length), ...payload]);
}

function utf8(text: string): number[] {
  return [...Buffer.from(text, "utf-8")];
}

function expectSameAsReencode(data: Uint8Array): void {
  const [length, payloadOffset] = readVarint(data, 1);
  const copied = copySbkStateWithoutHashKeys(data, 0);
  expect(copied).toBeDefined();
  expect(Buffer.from(copied!).toString("hex")).toBe(
    reencode(data.subarray(payloadOffset, payloadOffset + length)).toString("hex"),
  );
}

describe("background/book/sbk_state_copy", () => {
  const files = fs
    .readdirSync("src/tests/testdata/book")
    .filter((name) => name.endsWith(".sbk"))
    .sort();
  for (const name of files) {
    it(`same as re-encoding: ${name}`, () => {
      const data = fs.readFileSync(`src/tests/testdata/book/${name}`);
      let offset = 0;
      let states = 0;
      while (offset < data.length) {
        const tagOffset = offset;
        const tag = data[offset];
        const [length, payloadOffset] = readVarint(data, offset + 1);
        offset = payloadOffset + length;
        if (tag !== 26) {
          continue;
        }
        states++;
        const copied = copySbkStateWithoutHashKeys(data, tagOffset);
        expect(copied).toBeDefined();
        expect(Buffer.from(copied!).toString("hex")).toBe(
          reencode(data.subarray(payloadOffset, offset)).toString("hex"),
        );
      }
      expect(states).toBeGreaterThan(0);
    });
  }

  it("drops hash keys and default values", () => {
    const move = [
      ...[8, ...int32(0x01007677)],
      ...[16, ...int32(0)], // Evaluation = None
      ...[24, ...int32(0)], // Weight = 0
      ...[32, ...int32(-1)], // NextStateId = -1
    ];
    const evaluation = [
      ...[8, ...int32(-120)],
      ...[16, ...int32(20)],
      ...[24, ...int32(0)],
      ...[32, ...varint(-5n)], // Nodes (negative int64)
      ...lengthDelimited(5, utf8("7g7f 3c3d")),
      ...lengthDelimited(6, []), // EngineName = ""
    ];
    expectSameAsReencode(
      stateBytes([
        ...[8, ...int32(0)], // Id = 0
        ...[16, ...varint(0x123456789abcdefn)], // BoardKey
        ...[24, ...varint(0xffffffff)], // HandKey
        ...[32, ...int32(10)],
        ...[40, ...int32(0)],
        ...[48, ...int32(-3)],
        ...lengthDelimited(7, []), // Position = ""
        ...lengthDelimited(8, utf8("コメント")),
        ...lengthDelimited(9, move),
        ...lengthDelimited(9, []), // empty move is still written
        ...lengthDelimited(10, evaluation),
      ]),
    );
  });

  it("handles zero int64 written in a non-minimal form", () => {
    expectSameAsReencode(
      stateBytes(lengthDelimited(10, [...[8, ...int32(5)], ...[32, 0x80, 0x80, 0x00]])),
    );
  });

  it("handles hash keys placed after other fields", () => {
    expectSameAsReencode(stateBytes([...[8, ...int32(3)], ...[32, ...int32(1)], ...[16, 0x01]]));
  });

  it("handles a long comment", () => {
    expectSameAsReencode(
      stateBytes([...[8, ...int32(1)], ...lengthDelimited(8, utf8("あ".repeat(300)))]),
    );
  });

  const unsupportedCases: { name: string; data: Uint8Array }[] = [
    { name: "unknown field", data: stateBytes([...[8, 1], ...[11 << 3, 1]]) },
    { name: "fields out of order", data: stateBytes([...[32, 1], ...[8, 1]]) },
    { name: "duplicated field", data: stateBytes([...[32, 1], ...[32, 2]]) },
    { name: "duplicated field with default value", data: stateBytes([...[32, 1], ...[32, 0]]) },
    { name: "unexpected wire type", data: stateBytes([...lengthDelimited(4, [1])]) },
    { name: "non-minimal int32", data: stateBytes([...[32, 0x81, 0x00]]) },
    { name: "string with BOM", data: stateBytes(lengthDelimited(8, [0xef, 0xbb, 0xbf, 0x41])) },
    { name: "invalid UTF-8", data: stateBytes(lengthDelimited(8, [0x41, 0xff])) },
    { name: "truncated payload", data: new Uint8Array([26, 10, 8, 1]) },
    { name: "not a state", data: new Uint8Array([10, 1, 0x41]) },
  ];
  for (const { name, data } of unsupportedCases) {
    it(`falls back: ${name}`, () => {
      expect(copySbkStateWithoutHashKeys(data, 0)).toBeUndefined();
    });
  }
});
