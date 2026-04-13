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

const STANDARD_SFEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const PIECE_ORDER: NonKingPieceType[] = ["P", "L", "N", "S", "G", "B", "R"];
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

class BitWriter {
  private cursor = 0;
  readonly bytes = new Uint8Array(32);

  writeBit(value: number): void {
    if (this.cursor >= 256) {
      throw new Error("Packed SFEN overflow: too many bits");
    }
    if (value) {
      this.bytes[this.cursor >> 3] |= 1 << (this.cursor & 7);
    }
    this.cursor++;
  }

  writeBits(value: number, bits: number): void {
    for (let i = 0; i < bits; i++) {
      this.writeBit((value >> i) & 1);
    }
  }

  get bitLength(): number {
    return this.cursor;
  }
}

function normalizeInputSFEN(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "startpos" || trimmed === "position startpos") {
    return STANDARD_SFEN;
  }
  if (trimmed.startsWith("position sfen ")) {
    return trimmed.slice("position sfen ".length);
  }
  if (trimmed.startsWith("sfen ")) {
    return trimmed.slice("sfen ".length);
  }
  return trimmed;
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

export function packSfenToPackedSfen(sfen: string): Uint8Array {
  const normalized = normalizeInputSFEN(sfen);
  const [boardPart, turnPart, handsPart] = normalized.split(/\s+/, 4);
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
  return writer.bytes;
}
