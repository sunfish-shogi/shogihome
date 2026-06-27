import { Piece, PieceType, Square } from "tsshogi";
import { toAperySquare } from "./apery_move.js";

const MOVE_DROP = 1 << 14;
const MOVE_PROMOTE = 1 << 15;

const dropPieceTypeMap: Record<string, number> = {
  P: 1,
  L: 2,
  N: 3,
  S: 4,
  G: 7,
  B: 5,
  R: 6,
};

const dropPieceTypeReverse: Record<number, string> = {
  1: "P",
  2: "L",
  3: "N",
  4: "S",
  5: "B",
  6: "R",
  7: "G",
};

function squareFromYane(value: number): string {
  const file = Math.trunc(value / 9) + 1;
  const rank = (value % 9) + 1;
  return String(file) + String.fromCharCode("a".charCodeAt(0) + rank - 1);
}

export function toYaneMove16(usi: string): number {
  const from = usi.slice(0, 2);
  const to = usi.slice(2, 4);
  const promote = usi.length === 5 ? 1 : 0;
  const toSq = toAperySquare(Square.newByUSI(to) as Square);
  if (from[1] === "*") {
    const piece = Piece.newBySFEN(from[0]) as Piece;
    const pt =
      dropPieceTypeMap[
        piece.type === PieceType.PAWN
          ? "P"
          : piece.type === PieceType.LANCE
            ? "L"
            : piece.type === PieceType.KNIGHT
              ? "N"
              : piece.type === PieceType.SILVER
                ? "S"
                : piece.type === PieceType.GOLD
                  ? "G"
                  : piece.type === PieceType.BISHOP
                    ? "B"
                    : "R"
      ];
    return MOVE_DROP | (pt << 7) | toSq;
  }
  const fromSq = toAperySquare(Square.newByUSI(from) as Square);
  return (promote << 15) | (fromSq << 7) | toSq;
}

export function fromYaneMove16(value: number): string {
  const toSq = value & 0x7f;
  const to = squareFromYane(toSq);
  if (value & MOVE_DROP) {
    const pt = (value >> 7) & 0x7f;
    const pieceSfen = dropPieceTypeReverse[pt];
    if (!pieceSfen) {
      throw new Error(`Invalid YaneuraOu Move16 drop piece type: ${pt}`);
    }
    return pieceSfen + "*" + to;
  }
  const fromSq = (value >> 7) & 0x7f;
  const from = squareFromYane(fromSq);
  const promote = value & MOVE_PROMOTE ? "+" : "";
  return from + to + promote;
}
