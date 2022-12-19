import { Piece, PieceType } from "./piece";
import { Color } from "./color";

function buildSFEN(n: number, piece: Piece): string {
  if (n === 0) {
    return "";
  }
  return (n !== 1 ? n : "") + piece.sfen;
}

export interface ImmutableHand {
  count(pieceType: PieceType): number;
  forEach(handler: (pieceType: PieceType, n: number) => void): void;
  readonly sfenBlack: string;
  readonly sfenWhite: string;
  formatSFEN(color: Color): string;
}

export class Hand {
  private pieces: Map<PieceType, number>;

  constructor() {
    this.pieces = new Map<PieceType, number>();
    this.pieces.set(PieceType.PAWN, 0);
    this.pieces.set(PieceType.LANCE, 0);
    this.pieces.set(PieceType.KNIGHT, 0);
    this.pieces.set(PieceType.SILVER, 0);
    this.pieces.set(PieceType.GOLD, 0);
    this.pieces.set(PieceType.BISHOP, 0);
    this.pieces.set(PieceType.ROOK, 0);
  }

  count(pieceType: PieceType): number {
    return this.pieces.get(pieceType) as number;
  }

  set(pieceType: PieceType, count: number): void {
    this.pieces.set(pieceType, count);
  }

  add(pieceType: PieceType, n: number): number {
    let c = this.pieces.get(pieceType) as number;
    c += n;
    this.pieces.set(pieceType, c);
    return c;
  }

  reduce(pieceType: PieceType, n: number): number {
    let c = this.pieces.get(pieceType) as number;
    c -= n;
    this.pieces.set(pieceType, c);
    return c;
  }

  forEach(handler: (pieceType: PieceType, n: number) => void): void {
    handler(PieceType.PAWN, this.pieces.get(PieceType.PAWN) as number);
    handler(PieceType.LANCE, this.pieces.get(PieceType.LANCE) as number);
    handler(PieceType.KNIGHT, this.pieces.get(PieceType.KNIGHT) as number);
    handler(PieceType.SILVER, this.pieces.get(PieceType.SILVER) as number);
    handler(PieceType.GOLD, this.pieces.get(PieceType.GOLD) as number);
    handler(PieceType.BISHOP, this.pieces.get(PieceType.BISHOP) as number);
    handler(PieceType.ROOK, this.pieces.get(PieceType.ROOK) as number);
  }

  get sfenBlack(): string {
    return this.formatSFEN(Color.BLACK);
  }

  get sfenWhite(): string {
    return this.formatSFEN(Color.WHITE);
  }

  formatSFEN(color: Color): string {
    let ret = "";
    ret += buildSFEN(
      this.count(PieceType.ROOK) as number,
      new Piece(color, PieceType.ROOK)
    );
    ret += buildSFEN(
      this.count(PieceType.BISHOP) as number,
      new Piece(color, PieceType.BISHOP)
    );
    ret += buildSFEN(
      this.count(PieceType.GOLD) as number,
      new Piece(color, PieceType.GOLD)
    );
    ret += buildSFEN(
      this.count(PieceType.SILVER) as number,
      new Piece(color, PieceType.SILVER)
    );
    ret += buildSFEN(
      this.count(PieceType.KNIGHT) as number,
      new Piece(color, PieceType.KNIGHT)
    );
    ret += buildSFEN(
      this.count(PieceType.LANCE) as number,
      new Piece(color, PieceType.LANCE)
    );
    ret += buildSFEN(
      this.count(PieceType.PAWN) as number,
      new Piece(color, PieceType.PAWN)
    );
    if (ret === "") {
      return "-";
    }
    return ret;
  }

  static formatSFEN(black: Hand, white: Hand): string {
    const b = black.sfenBlack;
    const w = white.sfenWhite;
    if (b === "-" && w === "-") {
      return "-";
    }
    if (w === "-") {
      return b;
    }
    if (b === "-") {
      return w;
    }
    return b + w;
  }

  static isValidSFEN(sfen: string): boolean {
    if (sfen === "-") {
      return true;
    }
    return !!sfen.match(/^(?:[0-9]*[PLNSGBRplnsgbr])*$/);
  }

  static parseSFEN(sfen: string): { black: Hand; white: Hand } | null {
    if (sfen === "-") {
      return { black: new Hand(), white: new Hand() };
    }
    if (!sfen.match(/^(?:[0-9]*[PLNSGBRplnsgbr])*$/)) {
      return null;
    }
    const sections = sfen.match(
      /([0-9]*[PLNSGBRplnsgbr])/g
    ) as RegExpMatchArray;
    const black = new Hand();
    const white = new Hand();
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      let n = 1;
      if (section.length >= 2) {
        n = Number(section.substring(0, section.length - 1));
      }
      const piece = Piece.newBySFEN(section[section.length - 1]) as Piece;
      if (piece.color === Color.BLACK) {
        black.add(piece.type, n);
      } else {
        white.add(piece.type, n);
      }
    }
    return { black, white };
  }

  copyFrom(hand: Hand): void {
    hand.pieces.forEach((n, pieceType) => {
      this.pieces.set(pieceType, n);
    });
  }
}
