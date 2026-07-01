import { Color, countExistingPieces, Piece, PieceType, Position, Square } from "tsshogi";

export type PieceSet = {
  pawn: number;
  lance: number;
  knight: number;
  silver: number;
  gold: number;
  bishop: number;
  rook: number;
  king: number;
};

export type PieceStandDestination = "board" | "blackHand" | "whiteHand";

export function applyPieceSet(
  position: Position,
  pieceSet: PieceSet,
  destination: PieceStandDestination,
): void {
  const counts = countExistingPieces(position);
  const updates = {
    king: pieceSet.king - counts.king,
    rook: pieceSet.rook - (counts.rook + counts.dragon),
    bishop: pieceSet.bishop - (counts.bishop + counts.horse),
    gold: pieceSet.gold - counts.gold,
    silver: pieceSet.silver - (counts.silver + counts.promSilver),
    knight: pieceSet.knight - (counts.knight + counts.promKnight),
    lance: pieceSet.lance - (counts.lance + counts.promLance),
    pawn: pieceSet.pawn - (counts.pawn + counts.promPawn),
  };
  Object.entries(updates)
    .filter(([, update]) => update < 0)
    .forEach(([key, update]) => {
      const pieceType = key as PieceType;
      for (let u = 0; u > update; u--) {
        const square = Square.all.find(
          (square) => position.board.at(square)?.unpromoted().type === pieceType,
        );
        if (square) {
          position.board.remove(square);
        } else if (pieceType !== PieceType.KING) {
          if (position.blackHand.count(pieceType) > position.whiteHand.count(pieceType)) {
            position.blackHand.reduce(pieceType, 1);
          } else {
            position.whiteHand.reduce(pieceType, 1);
          }
        }
      }
    });
  Object.entries(updates)
    .filter(([, update]) => update > 0)
    .forEach(([key, update]) => {
      const pieceType = key as PieceType;
      for (let u = 0; u < update; u++) {
        if (pieceType === PieceType.KING || destination === "board") {
          const square = Square.all.find((square) => !position.board.at(square));
          if (square) {
            position.board.set(square, new Piece(Color.BLACK, pieceType));
          }
        } else if (destination === "blackHand") {
          position.blackHand.add(pieceType, 1);
        } else {
          position.whiteHand.add(pieceType, 1);
        }
      }
    });
}
