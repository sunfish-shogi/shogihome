import { Color, Piece, PieceType, pieceTypeToSFEN } from "tsshogi";

const rankChars = "abcdefghi";

const sbkPieceTypeMap: { [index: number]: PieceType } = {
  1: PieceType.PAWN,
  2: PieceType.LANCE,
  3: PieceType.KNIGHT,
  4: PieceType.SILVER,
  5: PieceType.BISHOP,
  6: PieceType.ROOK,
  7: PieceType.GOLD,
  8: PieceType.KING,
  9: PieceType.PROM_PAWN,
  10: PieceType.PROM_LANCE,
  11: PieceType.PROM_KNIGHT,
  12: PieceType.PROM_SILVER,
  13: PieceType.HORSE,
  14: PieceType.DRAGON,
};

const pieceTypeToSbkIndex: Partial<Record<PieceType, number>> = {
  [PieceType.PAWN]: 1,
  [PieceType.LANCE]: 2,
  [PieceType.KNIGHT]: 3,
  [PieceType.SILVER]: 4,
  [PieceType.BISHOP]: 5,
  [PieceType.ROOK]: 6,
  [PieceType.GOLD]: 7,
  [PieceType.KING]: 8,
  [PieceType.PROM_PAWN]: 9,
  [PieceType.PROM_LANCE]: 10,
  [PieceType.PROM_KNIGHT]: 11,
  [PieceType.PROM_SILVER]: 12,
  [PieceType.HORSE]: 13,
  [PieceType.DRAGON]: 14,
};

export function fromSbkMove(value: number): string {
  const fromDan = value & 0xf;
  const fromSuji = (value >>> 4) & 0xf;
  const toDan = (value >>> 8) & 0xf;
  const toSuji = (value >>> 12) & 0xf;
  const promote = (value >>> 19) & 1;
  const piece = (value >>> 24) & 0x3f;

  const toStr = toSuji.toString() + rankChars[toDan - 1];

  if (fromDan === 0 && fromSuji === 0) {
    // Drop move
    const pt = sbkPieceTypeMap[piece];
    return pieceTypeToSFEN(pt) + "*" + toStr;
  }

  const fromStr = fromSuji.toString() + rankChars[fromDan - 1];
  return fromStr + toStr + (promote ? "+" : "");
}

export function toSbkMove(usi: string, color: Color): number {
  const colorBit = color === Color.BLACK ? 0 : 1;
  const starIdx = usi.indexOf("*");

  if (starIdx !== -1) {
    // Drop move: e.g. "P*3d"
    const toFile = parseInt(usi[starIdx + 1]);
    const toRank = usi.charCodeAt(starIdx + 2) - "a".charCodeAt(0) + 1;
    const pt = (Piece.newBySFEN(usi[0]) as Piece).type;
    const sbkPiece = pieceTypeToSbkIndex[pt] ?? 0;
    return (colorBit << 31) | (sbkPiece << 24) | (toFile << 12) | (toRank << 8);
  }

  // Normal move: e.g. "7g7f" or "2b3c+"
  const fromFile = parseInt(usi[0]);
  const fromRank = usi.charCodeAt(1) - "a".charCodeAt(0) + 1;
  const toFile = parseInt(usi[2]);
  const toRank = usi.charCodeAt(3) - "a".charCodeAt(0) + 1;
  const promote = usi.length === 5 && usi[4] === "+" ? 1 : 0;

  return (
    (colorBit << 31) | (promote << 19) | (toFile << 12) | (toRank << 8) | (fromFile << 4) | fromRank
  );
}
