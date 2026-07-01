import { InitialPositionSFEN, PieceType, Position, Square, countExistingPieces } from "tsshogi";
import { applyPieceSet } from "@/renderer/record/pieceSet.js";

describe("record/pieceSet", () => {
  it("applyPieceSet/decrease", () => {
    const position = Position.newBySFEN(InitialPositionSFEN.STANDARD) as Position;
    // 減らす方向だけの変更は追加先に関わらず、盤上優先で削除し、次に多い駒台から削除する。
    applyPieceSet(
      position,
      { king: 1, rook: 1, bishop: 1, gold: 3, silver: 3, knight: 3, lance: 3, pawn: 15 },
      "board",
    );
    const counts = countExistingPieces(position);
    expect(counts.king).toBe(1);
    expect(counts.rook + counts.dragon).toBe(1);
    expect(counts.bishop + counts.horse).toBe(1);
    expect(counts.gold).toBe(3);
    expect(counts.silver + counts.promSilver).toBe(3);
    expect(counts.knight + counts.promKnight).toBe(3);
    expect(counts.lance + counts.promLance).toBe(3);
    expect(counts.pawn + counts.promPawn).toBe(15);
  });

  it("applyPieceSet/increase to board", () => {
    const position = Position.newBySFEN(InitialPositionSFEN.TSUME_SHOGI) as Position;
    // TSUME_SHOGI は 18 枚の歩が全て後手の駒台にある。1枚増やすと駒台はそのままで盤上に追加される。
    applyPieceSet(
      position,
      { king: 1, rook: 2, bishop: 2, gold: 4, silver: 4, knight: 4, lance: 4, pawn: 19 },
      "board",
    );
    const counts = countExistingPieces(position);
    expect(counts.pawn + counts.promPawn).toBe(19);
    expect(position.whiteHand.count(PieceType.PAWN)).toBe(18);
  });

  it("applyPieceSet/increase to blackHand", () => {
    const position = Position.newBySFEN(InitialPositionSFEN.EMPTY) as Position;
    applyPieceSet(
      position,
      { king: 0, rook: 2, bishop: 0, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
      "blackHand",
    );
    expect(position.blackHand.count(PieceType.ROOK)).toBe(2);
    expect(position.whiteHand.count(PieceType.ROOK)).toBe(0);
    expect(countExistingPieces(position).rook).toBe(2);
  });

  it("applyPieceSet/increase to whiteHand", () => {
    const position = Position.newBySFEN(InitialPositionSFEN.EMPTY) as Position;
    applyPieceSet(
      position,
      { king: 0, rook: 0, bishop: 1, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
      "whiteHand",
    );
    expect(position.whiteHand.count(PieceType.BISHOP)).toBe(1);
    expect(position.blackHand.count(PieceType.BISHOP)).toBe(0);
    expect(countExistingPieces(position).bishop).toBe(1);
  });

  it("applyPieceSet/king is always placed on the board", () => {
    const position = Position.newBySFEN(InitialPositionSFEN.EMPTY) as Position;
    applyPieceSet(
      position,
      { king: 1, rook: 0, bishop: 0, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
      "blackHand",
    );
    expect(countExistingPieces(position).king).toBe(1);
    const onBoard = Square.all.some((square) => position.board.at(square)?.type === PieceType.KING);
    expect(onBoard).toBe(true);
  });
});
