import { Color, Piece, PieceType, pieceTypeToSFEN, Square } from "tsshogi";

const pieceIndexMap = {
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

const pieceTypeMap: { [index: number]: PieceType } = {
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

export function toAperyPiece(piece: Piece): number {
  return pieceIndexMap[piece.type] + (piece.color === Color.BLACK ? 0 : 16);
}

function toAperyHand(piece: PieceType): number {
  return pieceIndexMap[piece];
}

function fromAperyHand(value: number): PieceType {
  return pieceTypeMap[value];
}

export function toAperySquare(square: Square): number {
  return square.file * 9 + square.rank - 10;
}

function fromAperySquare(value: number): Square {
  return new Square(Math.floor(value / 9) + 1, (value % 9) + 1);
}

export function toAperyMove(usi: string): number {
  const from = usi.slice(0, 2);
  const to = usi.slice(2, 4);
  const promote = usi.length === 5 ? 1 : 0;
  let apFrom: number;
  if (from[1] === "*") {
    const piece = Piece.newBySFEN(from[0]) as Piece;
    apFrom = toAperyHand(piece.type) + 81 - 1;
  } else {
    const square = Square.newByUSI(from) as Square;
    apFrom = toAperySquare(square);
  }
  const apTo = toAperySquare(Square.newByUSI(to) as Square);
  return (promote << 14) | (apFrom << 7) | apTo;
}

export function fromAperyMove(value: number): string {
  const to = fromAperySquare(value & 0x7f).usi;
  const apFrom = (value >> 7) & 0x7f;
  const from =
    apFrom < 81
      ? fromAperySquare(apFrom).usi
      : pieceTypeToSFEN(fromAperyHand(apFrom - 81 + 1)) + "*";
  const promote = ((value >> 14) & 1) === 1 ? "+" : "";
  return from + to + promote;
}
