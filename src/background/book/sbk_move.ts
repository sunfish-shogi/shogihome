import { Color, Move, PieceType, Square, pieceTypeToSFEN } from "tsshogi";

const rankChars = "abcdefghi";

// C# Piece enum index (with WhiteFlag stripped) → tsshogi PieceType
// C# order: Pawn=1, Lance=2, Knight=3, Silver=4, Gold=5, Bishop=6, Rook=7, King=8
// Promoted: 1|8=9, 2|8=10, 3|8=11, 4|8=12, 6|8=14, 7|8=15
const sbkPieceTypeMap: { [index: number]: PieceType } = {
  1: PieceType.PAWN,
  2: PieceType.LANCE,
  3: PieceType.KNIGHT,
  4: PieceType.SILVER,
  5: PieceType.GOLD,
  6: PieceType.BISHOP,
  7: PieceType.ROOK,
  8: PieceType.KING,
  9: PieceType.PROM_PAWN,
  10: PieceType.PROM_LANCE,
  11: PieceType.PROM_KNIGHT,
  12: PieceType.PROM_SILVER,
  14: PieceType.HORSE,
  15: PieceType.DRAGON,
};

// tsshogi PieceType → C# Piece enum index (black, without WhiteFlag=0x10)
const pieceTypeToSbkIndex: Partial<Record<PieceType, number>> = {
  [PieceType.PAWN]: 1,
  [PieceType.LANCE]: 2,
  [PieceType.KNIGHT]: 3,
  [PieceType.SILVER]: 4,
  [PieceType.GOLD]: 5,
  [PieceType.BISHOP]: 6,
  [PieceType.ROOK]: 7,
  [PieceType.KING]: 8,
  [PieceType.PROM_PAWN]: 9,
  [PieceType.PROM_LANCE]: 10,
  [PieceType.PROM_KNIGHT]: 11,
  [PieceType.PROM_SILVER]: 12,
  [PieceType.HORSE]: 14,
  [PieceType.DRAGON]: 15,
};

// C# WhiteFlag = 0x10 (bit 4 of the 5-bit piece field stored at bits 24-28 of the move word)
function sbkPieceValue(pt: PieceType, color: Color): number {
  return (pieceTypeToSbkIndex[pt] ?? 0) | (color === Color.WHITE ? 0x10 : 0);
}

export function fromSbkMove(value: number): string {
  const fromDan = value & 0xf;
  const fromSuji = (value >>> 4) & 0xf;
  const toDan = (value >>> 8) & 0xf;
  const toSuji = (value >>> 12) & 0xf;
  const promote = (value >>> 19) & 1;
  const piece = (value >>> 24) & 0x1f;

  const toStr = toSuji.toString() + rankChars[toDan - 1];

  if (fromDan === 0 && fromSuji === 0) {
    // Drop move: strip WhiteFlag (bit 4) to get piece type index
    const pt = sbkPieceTypeMap[piece & 0x0f];
    return pieceTypeToSFEN(pt) + "*" + toStr;
  }

  const fromStr = fromSuji.toString() + rankChars[fromDan - 1];
  return fromStr + toStr + (promote ? "+" : "");
}

export function toSbkMove(move: Move): number {
  const colorBit = move.color === Color.BLACK ? 0 : 1;
  const pieceBits = sbkPieceValue(move.pieceType, move.color);
  const isDrop = !(move.from instanceof Square);

  if (isDrop) {
    const toFile = move.to.file;
    const toRank = move.to.rank;
    return (colorBit << 31) | (pieceBits << 24) | (toFile << 12) | (toRank << 8);
  }

  const from = move.from as Square;
  const fromFile = from.file;
  const fromRank = from.rank;
  const toFile = move.to.file;
  const toRank = move.to.rank;
  const promote = move.promote ? 1 : 0;
  const captureBits =
    move.capturedPieceType !== null ? (pieceTypeToSbkIndex[move.capturedPieceType] ?? 0) : 0;

  return (
    (colorBit << 31) |
    (pieceBits << 24) |
    (captureBits << 20) |
    (promote << 19) |
    (toFile << 12) |
    (toRank << 8) |
    (fromFile << 4) |
    fromRank
  );
}
