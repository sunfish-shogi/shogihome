import {
  Color,
  Piece,
  PieceType,
  pieceTypeToSFEN,
  standardPieceName,
} from "@/shogi";

describe("shogi/piece", () => {
  it("PieceType", () => {
    expect(standardPieceName(PieceType.PAWN)).toBe("歩");
    expect(standardPieceName(PieceType.LANCE)).toBe("香");
    expect(standardPieceName(PieceType.KNIGHT)).toBe("桂");
    expect(standardPieceName(PieceType.SILVER)).toBe("銀");
    expect(standardPieceName(PieceType.GOLD)).toBe("金");
    expect(standardPieceName(PieceType.BISHOP)).toBe("角");
    expect(standardPieceName(PieceType.ROOK)).toBe("飛");
    expect(standardPieceName(PieceType.KING)).toBe("玉");
    expect(standardPieceName(PieceType.PROM_PAWN)).toBe("と");
    expect(standardPieceName(PieceType.PROM_LANCE)).toBe("成香");
    expect(standardPieceName(PieceType.PROM_KNIGHT)).toBe("成桂");
    expect(standardPieceName(PieceType.PROM_SILVER)).toBe("成銀");
    expect(standardPieceName(PieceType.HORSE)).toBe("馬");
    expect(standardPieceName(PieceType.DRAGON)).toBe("竜");

    expect(pieceTypeToSFEN(PieceType.PAWN)).toBe("P");
    expect(pieceTypeToSFEN(PieceType.LANCE)).toBe("L");
    expect(pieceTypeToSFEN(PieceType.KNIGHT)).toBe("N");
    expect(pieceTypeToSFEN(PieceType.SILVER)).toBe("S");
    expect(pieceTypeToSFEN(PieceType.GOLD)).toBe("G");
    expect(pieceTypeToSFEN(PieceType.BISHOP)).toBe("B");
    expect(pieceTypeToSFEN(PieceType.ROOK)).toBe("R");
    expect(pieceTypeToSFEN(PieceType.KING)).toBe("K");
    expect(pieceTypeToSFEN(PieceType.PROM_PAWN)).toBe("+P");
    expect(pieceTypeToSFEN(PieceType.PROM_LANCE)).toBe("+L");
    expect(pieceTypeToSFEN(PieceType.PROM_KNIGHT)).toBe("+N");
    expect(pieceTypeToSFEN(PieceType.PROM_SILVER)).toBe("+S");
    expect(pieceTypeToSFEN(PieceType.HORSE)).toBe("+B");
    expect(pieceTypeToSFEN(PieceType.DRAGON)).toBe("+R");
  });

  it("getters", () => {
    const blackKnight = new Piece(Color.BLACK, PieceType.KNIGHT);
    expect(blackKnight.id).toBe("black_knight");
    expect(blackKnight.sfen).toBe("N");

    const whiteHorse = new Piece(Color.WHITE, PieceType.HORSE);
    expect(whiteHorse.id).toBe("white_horse");
    expect(whiteHorse.sfen).toBe("+b");
  });

  it("color", () => {
    const blackKnight = new Piece(Color.BLACK, PieceType.KNIGHT);
    expect(blackKnight.black()).toStrictEqual(
      new Piece(Color.BLACK, PieceType.KNIGHT)
    );
    expect(blackKnight.white()).toStrictEqual(
      new Piece(Color.WHITE, PieceType.KNIGHT)
    );

    const whiteSilver = new Piece(Color.WHITE, PieceType.SILVER);
    expect(whiteSilver.black()).toStrictEqual(
      new Piece(Color.BLACK, PieceType.SILVER)
    );
    expect(whiteSilver.white()).toStrictEqual(
      new Piece(Color.WHITE, PieceType.SILVER)
    );
  });

  it("comparison", () => {
    const whiteGold = new Piece(Color.WHITE, PieceType.GOLD);
    expect(
      whiteGold.equals(new Piece(Color.WHITE, PieceType.GOLD))
    ).toBeTruthy();
    expect(
      whiteGold.equals(new Piece(Color.BLACK, PieceType.GOLD))
    ).toBeFalsy();
    expect(
      whiteGold.equals(new Piece(Color.WHITE, PieceType.BISHOP))
    ).toBeFalsy();
  });

  it("promotion", () => {
    expect(new Piece(Color.BLACK, PieceType.LANCE).promoted()).toStrictEqual(
      new Piece(Color.BLACK, PieceType.PROM_LANCE)
    );
    expect(new Piece(Color.WHITE, PieceType.BISHOP).promoted()).toStrictEqual(
      new Piece(Color.WHITE, PieceType.HORSE)
    );
    expect(new Piece(Color.WHITE, PieceType.HORSE).promoted()).toStrictEqual(
      new Piece(Color.WHITE, PieceType.HORSE)
    );
    expect(new Piece(Color.BLACK, PieceType.GOLD).promoted()).toStrictEqual(
      new Piece(Color.BLACK, PieceType.GOLD)
    );

    expect(new Piece(Color.WHITE, PieceType.BISHOP).unpromoted()).toStrictEqual(
      new Piece(Color.WHITE, PieceType.BISHOP)
    );
    expect(new Piece(Color.WHITE, PieceType.HORSE).unpromoted()).toStrictEqual(
      new Piece(Color.WHITE, PieceType.BISHOP)
    );

    expect(
      new Piece(Color.WHITE, PieceType.BISHOP).isPromotable()
    ).toBeTruthy();
    expect(new Piece(Color.WHITE, PieceType.HORSE).isPromotable()).toBeFalsy();
    expect(new Piece(Color.WHITE, PieceType.GOLD).isPromotable()).toBeFalsy();
    expect(new Piece(Color.WHITE, PieceType.KING).isPromotable()).toBeFalsy();
  });

  it("rotation", () => {
    let piece = new Piece(Color.BLACK, PieceType.PAWN);
    piece = piece.rotate();
    expect(piece).toStrictEqual(new Piece(Color.BLACK, PieceType.PROM_PAWN));
    piece = piece.rotate();
    expect(piece).toStrictEqual(new Piece(Color.WHITE, PieceType.PAWN));
    piece = piece.rotate();
    expect(piece).toStrictEqual(new Piece(Color.WHITE, PieceType.PROM_PAWN));
    piece = piece.rotate();
    expect(piece).toStrictEqual(new Piece(Color.BLACK, PieceType.PAWN));
  });

  it("static", () => {
    expect(Piece.isValidSFEN("N")).toBeTruthy();
    expect(Piece.isValidSFEN("+N")).toBeTruthy();
    expect(Piece.isValidSFEN("-N")).toBeFalsy();
    expect(Piece.isValidSFEN(" N")).toBeFalsy();
    expect(Piece.isValidSFEN("N ")).toBeFalsy();
    expect(Piece.isValidSFEN("+")).toBeFalsy();
    expect(Piece.isValidSFEN("X")).toBeFalsy();
    expect(Piece.isValidSFEN("")).toBeFalsy();
    expect(Piece.isValidSFEN(" ")).toBeFalsy();

    expect(Piece.newBySFEN("+N")).toStrictEqual(
      new Piece(Color.BLACK, PieceType.PROM_KNIGHT)
    );
    expect(Piece.newBySFEN("k")).toStrictEqual(
      new Piece(Color.WHITE, PieceType.KING)
    );
    expect(Piece.newBySFEN("XX")).toBeNull();
  });
});
