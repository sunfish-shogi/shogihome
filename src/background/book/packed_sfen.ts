import { Color as TsColor, ImmutablePosition, PieceType as TsPieceType, Square } from "tsshogi";

type PieceType = "P" | "L" | "N" | "S" | "G" | "B" | "R" | "K";
type NonKingPieceType = Exclude<PieceType, "K">;
type Color = "b" | "w";

type HuffmanCode = {
  code: number;
  bits: number;
};

type ParsedPiece = {
  type: PieceType;
  color: Color;
  promoted: boolean;
};

const PIECE_ORDER: NonKingPieceType[] = ["P", "L", "N", "S", "G", "B", "R"];
const HAND_SFEN_ORDER: NonKingPieceType[] = ["R", "B", "G", "S", "N", "L", "P"];
const BOARD_PIECE_TOTAL: Record<NonKingPieceType, number> = {
  P: 18,
  L: 4,
  N: 4,
  S: 4,
  G: 4,
  B: 2,
  R: 2,
};

const BOARD_HUFFMAN: Record<NonKingPieceType | "E", HuffmanCode> = {
  E: { code: 0x00, bits: 1 },
  P: { code: 0x01, bits: 2 },
  L: { code: 0x03, bits: 4 },
  N: { code: 0x0b, bits: 4 },
  S: { code: 0x07, bits: 4 },
  G: { code: 0x0f, bits: 5 },
  B: { code: 0x1f, bits: 6 },
  R: { code: 0x3f, bits: 6 },
};

const PIECEBOX_HUFFMAN: Record<NonKingPieceType, HuffmanCode> = {
  P: { code: 0x02, bits: 2 },
  L: { code: 0x09, bits: 4 },
  N: { code: 0x0d, bits: 4 },
  S: { code: 0x0b, bits: 4 },
  G: { code: 0x1b, bits: 5 },
  B: { code: 0x2f, bits: 6 },
  R: { code: 0x3f, bits: 6 },
};

const BOARD_CHAR_TO_PIECE: Record<string, PieceType> = {
  p: "P",
  l: "L",
  n: "N",
  s: "S",
  g: "G",
  b: "B",
  r: "R",
  k: "K",
};

const BOARD_DECODE_TABLE = new Map<string, NonKingPieceType | "E">(
  Object.entries(BOARD_HUFFMAN).map(([piece, h]) => [
    `${h.bits}:${h.code}`,
    piece as NonKingPieceType | "E",
  ]),
);

const HAND_DECODE_TABLE = new Map<string, NonKingPieceType>(
  PIECE_ORDER.map((piece) => {
    const h = BOARD_HUFFMAN[piece];
    return [`${h.bits - 1}:${h.code >> 1}`, piece];
  }),
);

class BitWriter {
  private cursor = 0;
  readonly words = new Uint32Array(8);

  writeBits(value: number, bits: number): void {
    if (bits <= 0) {
      return;
    }
    if (bits > 32 || this.cursor + bits > 256) {
      throw new Error("Packed SFEN overflow: too many bits");
    }
    const masked = bits === 32 ? value >>> 0 : (value & ((1 << bits) - 1)) >>> 0;
    const wordIndex = this.cursor >>> 5;
    const bitOffset = this.cursor & 31;
    this.words[wordIndex] = (this.words[wordIndex] | (masked << bitOffset)) >>> 0;
    const available = 32 - bitOffset;
    if (bits > available) {
      this.words[wordIndex + 1] = (this.words[wordIndex + 1] | (masked >>> available)) >>> 0;
    }
    this.cursor += bits;
  }

  writeBit(value: number): void {
    this.writeBits(value & 1, 1);
  }

  get bitLength(): number {
    return this.cursor;
  }
}

class BitReader {
  private cursor = 0;
  readonly words: Uint32Array;
  private readonly bitLimit: number;

  constructor(data: Uint32Array) {
    this.words = data;
    this.bitLimit = data.length * 32;
  }

  readBits(bits: number): number {
    if (bits <= 0) {
      return 0;
    }
    if (bits > 32 || this.cursor + bits > this.bitLimit) {
      throw new Error("Packed SFEN underflow: no more bits");
    }
    const wordIndex = this.cursor >>> 5;
    const bitOffset = this.cursor & 31;
    const mask = bits === 32 ? 0xffffffff : ((1 << bits) - 1) >>> 0;
    let value = (this.words[wordIndex] >>> bitOffset) & mask;
    const available = 32 - bitOffset;
    if (bits > available) {
      const upperMask = ((1 << (bits - available)) - 1) >>> 0;
      value = (value | ((this.words[wordIndex + 1] & upperMask) << available)) >>> 0;
    }
    this.cursor += bits;
    return value;
  }

  readBit(): number {
    return this.readBits(1);
  }

  get bitLength(): number {
    return this.cursor;
  }
}

function createNonKingCountMap(): Record<NonKingPieceType, number> {
  return { P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 };
}

function parseBoard(boardPart: string): {
  board: (ParsedPiece | undefined)[];
  kings: Record<Color, number>;
  boardCounts: Record<NonKingPieceType, number>;
} {
  const ranks = boardPart.split("/");
  if (ranks.length !== 9) {
    throw new Error(`Invalid SFEN board: expected 9 ranks but got ${ranks.length}`);
  }

  const board: (ParsedPiece | undefined)[] = [];
  const kings: Record<Color, number> = { b: 81, w: 81 };
  const boardCounts = createNonKingCountMap();

  for (let rankIndex = 0; rankIndex < ranks.length; rankIndex++) {
    const rank = ranks[rankIndex];
    let fileIndex = 0;
    for (let i = 0; i < rank.length; i++) {
      const ch = rank[i];
      if (ch >= "1" && ch <= "9") {
        const empty = Number(ch);
        for (let j = 0; j < empty; j++) {
          board.push(undefined);
          fileIndex++;
        }
        continue;
      }

      let promoted = false;
      let pieceChar = ch;
      if (ch === "+") {
        i++;
        if (i >= rank.length) {
          throw new Error("Invalid SFEN board: dangling promotion marker");
        }
        promoted = true;
        pieceChar = rank[i];
      }

      const lower = pieceChar.toLowerCase();
      const type = BOARD_CHAR_TO_PIECE[lower];
      if (!type) {
        throw new Error(`Invalid SFEN board piece: ${pieceChar}`);
      }

      const color: Color = pieceChar === lower ? "w" : "b";
      if (type === "K") {
        if (promoted) {
          throw new Error("Invalid SFEN board: king cannot be promoted");
        }
        const square = rankIndex * 9 + fileIndex;
        if (kings[color] !== 81) {
          throw new Error(`Invalid SFEN board: duplicate ${color} king`);
        }
        kings[color] = square;
      } else {
        if (type === "G" && promoted) {
          throw new Error("Invalid SFEN board: gold cannot be promoted");
        }
        boardCounts[type]++;
      }

      board.push({ type, color, promoted });
      fileIndex++;
    }

    if (fileIndex !== 9) {
      throw new Error(`Invalid SFEN board rank width at rank ${rankIndex + 1}: ${fileIndex}`);
    }
  }

  if (board.length !== 81) {
    throw new Error(`Invalid SFEN board squares: ${board.length}`);
  }

  return { board, kings, boardCounts };
}

function parseHands(handsPart: string): Record<Color, Record<NonKingPieceType, number>> {
  const hands: Record<Color, Record<NonKingPieceType, number>> = {
    b: createNonKingCountMap(),
    w: createNonKingCountMap(),
  };
  if (handsPart === "-") {
    return hands;
  }

  let num = "";
  for (const ch of handsPart) {
    if (ch >= "0" && ch <= "9") {
      num += ch;
      continue;
    }

    const lower = ch.toLowerCase();
    const type = BOARD_CHAR_TO_PIECE[lower];
    if (!type || type === "K") {
      throw new Error(`Invalid SFEN hand piece: ${ch}`);
    }

    const n = num ? Number(num) : 1;
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid SFEN hand count: ${num}`);
    }
    num = "";

    const color: Color = ch === lower ? "w" : "b";
    hands[color][type] += n;
  }

  if (num) {
    throw new Error(`Invalid SFEN hands: dangling number ${num}`);
  }
  return hands;
}

function computePieceBoxCounts(
  boardCounts: Record<NonKingPieceType, number>,
  hands: Record<Color, Record<NonKingPieceType, number>>,
): Record<NonKingPieceType, number> {
  const result = createNonKingCountMap();
  for (const type of PIECE_ORDER) {
    const remaining = BOARD_PIECE_TOTAL[type] - boardCounts[type] - hands.b[type] - hands.w[type];
    if (remaining < 0) {
      throw new Error(`Invalid SFEN: too many ${type} pieces`);
    }
    result[type] = remaining;
  }
  return result;
}

function writeBoardPiece(writer: BitWriter, piece: ParsedPiece | undefined): void {
  if (!piece) {
    const emptyCode = BOARD_HUFFMAN.E;
    writer.writeBits(emptyCode.code, emptyCode.bits);
    return;
  }
  if (piece.type === "K") {
    return;
  }

  const code = BOARD_HUFFMAN[piece.type];
  writer.writeBits(code.code, code.bits);
  if (piece.type !== "G") {
    writer.writeBit(piece.promoted ? 1 : 0);
  }
  writer.writeBit(piece.color === "b" ? 0 : 1);
}

function writeHandPiece(writer: BitWriter, type: NonKingPieceType, color: Color): void {
  const code = BOARD_HUFFMAN[type];
  writer.writeBits(code.code >> 1, code.bits - 1);
  if (type !== "G") {
    writer.writeBit(0); // hand piece uses non-promoted marker
  }
  writer.writeBit(color === "b" ? 0 : 1);
}

function writePieceBoxPiece(writer: BitWriter, type: NonKingPieceType): void {
  const code = PIECEBOX_HUFFMAN[type];
  writer.writeBits(code.code, code.bits);
  if (type !== "G") {
    writer.writeBit(0);
  }
}

function convertTsColor(color: TsColor): Color {
  return color === TsColor.BLACK ? "b" : "w";
}

function convertTsPieceType(type: TsPieceType): { type: PieceType; promoted: boolean } {
  switch (type) {
    case TsPieceType.PAWN:
      return { type: "P", promoted: false };
    case TsPieceType.PROM_PAWN:
      return { type: "P", promoted: true };
    case TsPieceType.LANCE:
      return { type: "L", promoted: false };
    case TsPieceType.PROM_LANCE:
      return { type: "L", promoted: true };
    case TsPieceType.KNIGHT:
      return { type: "N", promoted: false };
    case TsPieceType.PROM_KNIGHT:
      return { type: "N", promoted: true };
    case TsPieceType.SILVER:
      return { type: "S", promoted: false };
    case TsPieceType.PROM_SILVER:
      return { type: "S", promoted: true };
    case TsPieceType.GOLD:
      return { type: "G", promoted: false };
    case TsPieceType.BISHOP:
      return { type: "B", promoted: false };
    case TsPieceType.HORSE:
      return { type: "B", promoted: true };
    case TsPieceType.ROOK:
      return { type: "R", promoted: false };
    case TsPieceType.DRAGON:
      return { type: "R", promoted: true };
    case TsPieceType.KING:
      return { type: "K", promoted: false };
  }
}

function getHandsFromPosition(
  position: ImmutablePosition,
): Record<Color, Record<NonKingPieceType, number>> {
  return {
    b: {
      P: position.blackHand.count(TsPieceType.PAWN),
      L: position.blackHand.count(TsPieceType.LANCE),
      N: position.blackHand.count(TsPieceType.KNIGHT),
      S: position.blackHand.count(TsPieceType.SILVER),
      G: position.blackHand.count(TsPieceType.GOLD),
      B: position.blackHand.count(TsPieceType.BISHOP),
      R: position.blackHand.count(TsPieceType.ROOK),
    },
    w: {
      P: position.whiteHand.count(TsPieceType.PAWN),
      L: position.whiteHand.count(TsPieceType.LANCE),
      N: position.whiteHand.count(TsPieceType.KNIGHT),
      S: position.whiteHand.count(TsPieceType.SILVER),
      G: position.whiteHand.count(TsPieceType.GOLD),
      B: position.whiteHand.count(TsPieceType.BISHOP),
      R: position.whiteHand.count(TsPieceType.ROOK),
    },
  };
}

function readBoardPiece(reader: BitReader): ParsedPiece | undefined {
  let code = 0;
  for (let bits = 1; bits <= 6; bits++) {
    code |= reader.readBit() << (bits - 1);
    const type = BOARD_DECODE_TABLE.get(`${bits}:${code}`);
    if (!type) {
      continue;
    }
    if (type === "E") {
      return undefined;
    }

    const promoted = type !== "G" ? reader.readBit() === 1 : false;
    const color: Color = reader.readBit() === 0 ? "b" : "w";
    return { type, color, promoted };
  }
  throw new Error("Invalid packed sfen: cannot decode board piece");
}

function readHandPiece(reader: BitReader): ParsedPiece {
  let code = 0;
  for (let bits = 1; bits <= 6; bits++) {
    code |= reader.readBit() << (bits - 1);
    const type = HAND_DECODE_TABLE.get(`${bits}:${code}`);
    if (!type) {
      continue;
    }

    const promoted = type !== "G" ? reader.readBit() === 1 : false;
    const color: Color = reader.readBit() === 0 ? "b" : "w";
    return { type, color, promoted };
  }
  throw new Error("Invalid packed sfen: cannot decode hand/piece-box piece");
}

function pieceToBoardChar(piece: ParsedPiece): string {
  const ch = piece.color === "b" ? piece.type : piece.type.toLowerCase();
  if (!piece.promoted) {
    return ch;
  }
  return `+${ch}`;
}

function boardToSFEN(board: (ParsedPiece | undefined)[]): string {
  const ranks: string[] = [];
  for (let rank = 0; rank < 9; rank++) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 9; file++) {
      const piece = board[rank * 9 + file];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += pieceToBoardChar(piece);
    }
    if (empty > 0) {
      row += String(empty);
    }
    ranks.push(row);
  }
  return ranks.join("/");
}

function handsToSFEN(hands: Record<Color, Record<NonKingPieceType, number>>): string {
  let text = "";
  for (const color of ["b", "w"] as const) {
    for (const type of HAND_SFEN_ORDER) {
      const count = hands[color][type];
      if (!count) {
        continue;
      }
      if (count > 1) {
        text += String(count);
      }
      text += color === "b" ? type : type.toLowerCase();
    }
  }
  return text || "-";
}

export function packSfenToPackedSfen(sfen: string): Uint32Array {
  const [boardPart, turnPart, handsPart] = sfen.split(/\s+/, 4);
  if (!boardPart || !turnPart || !handsPart) {
    throw new Error(`Invalid SFEN: ${sfen}`);
  }
  if (turnPart !== "b" && turnPart !== "w") {
    throw new Error(`Invalid SFEN turn: ${turnPart}`);
  }

  const { board, kings, boardCounts } = parseBoard(boardPart);
  const hands = parseHands(handsPart);
  const pieceBoxCounts = computePieceBoxCounts(boardCounts, hands);

  const writer = new BitWriter();

  writer.writeBit(turnPart === "b" ? 0 : 1);
  writer.writeBits(kings.b, 7);
  writer.writeBits(kings.w, 7);

  for (const piece of board) {
    if (piece?.type === "K") {
      continue;
    }
    writeBoardPiece(writer, piece);
  }

  for (const color of ["b", "w"] as const) {
    for (const type of PIECE_ORDER) {
      for (let i = 0; i < hands[color][type]; i++) {
        writeHandPiece(writer, type, color);
      }
    }
  }

  for (const type of PIECE_ORDER) {
    for (let i = 0; i < pieceBoxCounts[type]; i++) {
      writePieceBoxPiece(writer, type);
    }
  }

  if (writer.bitLength !== 256) {
    throw new Error(`Invalid packed sfen bit length: ${writer.bitLength}`);
  }
  return writer.words;
}

export function packPositionToPackedSfen(position: ImmutablePosition): Uint32Array {
  const writer = new BitWriter();
  const boardCounts = createNonKingCountMap();
  const hands = getHandsFromPosition(position);

  writer.writeBit(position.color === TsColor.BLACK ? 0 : 1);
  const blackKing = position.board.findKing(TsColor.BLACK);
  const whiteKing = position.board.findKing(TsColor.WHITE);
  writer.writeBits(blackKing ? blackKing.index : 81, 7);
  writer.writeBits(whiteKing ? whiteKing.index : 81, 7);

  for (let i = 0; i < 81; i++) {
    const piece = position.board.at(Square.all[i]);
    if (!piece) {
      writeBoardPiece(writer, undefined);
      continue;
    }
    const converted = convertTsPieceType(piece.type);
    if (converted.type === "K") {
      continue;
    }
    boardCounts[converted.type]++;
    writeBoardPiece(writer, {
      type: converted.type,
      color: convertTsColor(piece.color),
      promoted: converted.promoted,
    });
  }

  for (const color of ["b", "w"] as const) {
    for (const type of PIECE_ORDER) {
      for (let i = 0; i < hands[color][type]; i++) {
        writeHandPiece(writer, type, color);
      }
    }
  }

  const pieceBoxCounts = computePieceBoxCounts(boardCounts, hands);
  for (const type of PIECE_ORDER) {
    for (let i = 0; i < pieceBoxCounts[type]; i++) {
      writePieceBoxPiece(writer, type);
    }
  }

  if (writer.bitLength !== 256) {
    throw new Error(`Invalid packed sfen bit length: ${writer.bitLength}`);
  }
  return writer.words;
}

export function unpackPackedSfenToSfen(packedSfen: Uint32Array, ply: number = 1): string {
  if (packedSfen.length < 8) {
    throw new Error(`Packed SFEN requires 8 words but got ${packedSfen.length}`);
  }
  const reader = new BitReader(packedSfen.subarray(0, 8));
  const board: (ParsedPiece | undefined)[] = Array.from({ length: 81 }, () => undefined);

  const turn: Color = reader.readBit() === 0 ? "b" : "w";

  for (const color of ["b", "w"] as const) {
    const sq = reader.readBits(7);
    if (sq === 81) {
      continue;
    }
    if (sq < 0 || sq >= 81) {
      throw new Error(`Invalid packed sfen: king square out of range (${sq})`);
    }
    if (board[sq]) {
      throw new Error(`Invalid packed sfen: duplicated king square (${sq})`);
    }
    board[sq] = { type: "K", color, promoted: false };
  }

  for (let sq = 0; sq < 81; sq++) {
    if (board[sq]?.type === "K") {
      continue;
    }
    board[sq] = readBoardPiece(reader);
  }

  const hands: Record<Color, Record<NonKingPieceType, number>> = {
    b: createNonKingCountMap(),
    w: createNonKingCountMap(),
  };

  while (reader.bitLength < 256) {
    const piece = readHandPiece(reader);
    if (piece.promoted) {
      continue; // piece-box marker
    }
    hands[piece.color][piece.type as NonKingPieceType]++;
  }

  if (reader.bitLength !== 256) {
    throw new Error(`Invalid packed sfen bit length: ${reader.bitLength}`);
  }

  return `${boardToSFEN(board)} ${turn} ${handsToSFEN(hands)} ${ply}`;
}
