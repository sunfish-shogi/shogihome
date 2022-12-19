import { Color } from "./color";
import { Piece, PieceType, pieceTypeToSFEN, standardPieceName } from "./piece";
import { Square } from "./square";

const fileDisplayTexts = ["１", "２", "３", "４", "５", "６", "７", "８", "９"];
const rankDisplayTexts = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export class Move {
  constructor(
    public from: Square | PieceType,
    public to: Square,
    public promote: boolean,
    public color: Color,
    public pieceType: PieceType,
    public capturedPieceType: PieceType | null
  ) {}

  equals(move: Move | null | undefined): boolean {
    if (!move) {
      return false;
    }
    return (
      ((this.from instanceof Square &&
        move.from instanceof Square &&
        this.from.equals(move.from)) ||
        (!(this.from instanceof Square) &&
          !(move.from instanceof Square) &&
          this.from === move.from)) &&
      this.to.equals(move.to) &&
      this.promote === move.promote &&
      this.color === move.color &&
      this.pieceType === move.pieceType &&
      this.capturedPieceType === move.capturedPieceType
    );
  }

  withPromote(): Move {
    return new Move(
      this.from,
      this.to,
      true,
      this.color,
      this.pieceType,
      this.capturedPieceType
    );
  }

  getDisplayText(opt?: {
    /**
     * 前の指し手を指定します。
     * 指定することで「同　歩」のような表記になります。
     */
    prev?: Move | null;
    /**
     * 古いファイルフォーマットでの文字化けを防ぐ場合に指定します。
     */
    legacy?: boolean;
  }): string {
    let text = "";
    text +=
      this.color === Color.BLACK
        ? opt?.legacy
          ? "▲"
          : "☗"
        : opt?.legacy
        ? "△"
        : "☖";
    if (opt?.prev && opt?.prev.to.equals(this.to)) {
      text += "同　";
    } else {
      text += fileDisplayTexts[this.to.file - 1];
      text += rankDisplayTexts[this.to.rank - 1];
    }
    text += standardPieceName(this.pieceType);
    if (this.promote) {
      text += "成";
    }
    if (this.from instanceof Square) {
      const square = this.from;
      text += `(${square.file}${square.rank})`;
    } else {
      text += "打";
    }
    return text;
  }

  get usi(): string {
    let ret = "";
    if (this.from instanceof Square) {
      ret += this.from.sfen;
    } else {
      ret += pieceTypeToSFEN(this.from) + "*";
    }
    ret += this.to.sfen;
    if (this.promote) {
      ret += "+";
    }
    return ret;
  }
}

export function parseUSIMove(str: string): {
  from: Square | PieceType;
  to: Square;
  promote: boolean;
} | null {
  let from: PieceType | Square;
  if (str[1] === "*") {
    const piece = Piece.newBySFEN(str[0]);
    if (!piece) {
      return null;
    }
    from = piece.type;
  } else {
    const square = Square.parseSFENSquare(str);
    if (!square) {
      return null;
    }
    from = square;
  }
  const to = Square.parseSFENSquare(str.substring(2));
  if (!to) {
    return null;
  }
  const promote = str.length >= 5 && str[4] === "+";
  return { from, to, promote };
}
