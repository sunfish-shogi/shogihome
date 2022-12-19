import { Color } from ".";
import { reverseColor } from "./color";
import {
  directions,
  MoveType,
  resolveMoveType,
  reverseDirection,
} from "./direction";
import { Piece, PieceType } from "./piece";
import { Square } from "./square";

export enum InitialPositionType {
  STANDARD = "standard",
  EMPTY = "empty",
  HANDICAP_LANCE = "handicapLance",
  HANDICAP_RIGHT_LANCE = "handicapRightLance",
  HANDICAP_BISHOP = "handicapBishop",
  HANDICAP_ROOK = "handicapRook",
  HANDICAP_ROOK_LANCE = "handicapRookLance",
  HANDICAP_2PIECES = "handicap2Pieces",
  HANDICAP_4PIECES = "handicap4Pieces",
  HANDICAP_6PIECES = "handicap6Pieces",
  HANDICAP_8PIECES = "handicap8Pieces",
  TSUME_SHOGI = "tsumeShogi",
  TSUME_SHOGI_2KINGS = "tsumeShogi2Kings",
}

function sfenCharToNumber(sfen: string): number | null {
  switch (sfen) {
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    case "5":
      return 5;
    case "6":
      return 6;
    case "7":
      return 7;
    case "8":
      return 8;
    case "9":
      return 9;
    default:
      return null;
  }
}

type PowerDetectionOption = {
  filled?: Square;
  ignore?: Square;
};

export interface ImmutableBoard {
  at(square: Square): Piece | null;
  listNonEmptySquares(): Array<Square>;
  hasPower(
    target: Square,
    color: Color,
    option?: PowerDetectionOption
  ): boolean;
  isChecked(kingColor: Color, option?: PowerDetectionOption): boolean;
  readonly sfen: string;
}

export class Board {
  private squares: Array<Piece | null>;

  constructor() {
    this.squares = new Array<Piece>();
    for (let i = 0; i < 81; i += 1) {
      this.squares.push(null);
    }
    this.reset(InitialPositionType.STANDARD);
  }

  at(square: Square): Piece | null {
    return this.squares[square.index];
  }

  set(square: Square, piece: Piece): void {
    this.squares[square.index] = piece;
  }

  swap(square1: Square, square2: Square): void {
    const tmp = this.squares[square1.index];
    this.squares[square1.index] = this.squares[square2.index];
    this.squares[square2.index] = tmp;
  }

  remove(square: Square): Piece | null {
    const removed = this.squares[square.index];
    this.squares[square.index] = null;
    return removed;
  }

  listNonEmptySquares(): Array<Square> {
    const squares = new Array<Square>();
    Square.all.forEach((square) => {
      if (this.squares[square.index]) {
        squares.push(square);
      }
    });
    return squares;
  }

  listSquaresByColor(color: Color): Array<Square> {
    const squares = new Array<Square>();
    Square.all.forEach((square) => {
      const piece = this.squares[square.index];
      if (piece && piece.color === color) {
        squares.push(square);
      }
    });
    return squares;
  }

  clear(): void {
    Square.all.forEach((square) => {
      this.squares[square.index] = null;
    });
  }

  reset(type: InitialPositionType): void {
    this.clear();
    if (type === InitialPositionType.EMPTY) {
      return;
    }
    this.squares[new Square(5, 1).index] = new Piece(
      Color.WHITE,
      PieceType.KING
    );
    if (type === InitialPositionType.TSUME_SHOGI) {
      return;
    }
    this.squares[new Square(5, 9).index] = new Piece(
      Color.BLACK,
      PieceType.KING
    );
    if (type === InitialPositionType.TSUME_SHOGI_2KINGS) {
      return;
    }
    this.squares[new Square(2, 8).index] = new Piece(
      Color.BLACK,
      PieceType.ROOK
    );
    this.squares[new Square(8, 2).index] = new Piece(
      Color.WHITE,
      PieceType.ROOK
    );
    this.squares[new Square(8, 8).index] = new Piece(
      Color.BLACK,
      PieceType.BISHOP
    );
    this.squares[new Square(2, 2).index] = new Piece(
      Color.WHITE,
      PieceType.BISHOP
    );
    this.squares[new Square(4, 9).index] = new Piece(
      Color.BLACK,
      PieceType.GOLD
    );
    this.squares[new Square(6, 9).index] = new Piece(
      Color.BLACK,
      PieceType.GOLD
    );
    this.squares[new Square(6, 1).index] = new Piece(
      Color.WHITE,
      PieceType.GOLD
    );
    this.squares[new Square(4, 1).index] = new Piece(
      Color.WHITE,
      PieceType.GOLD
    );
    this.squares[new Square(3, 9).index] = new Piece(
      Color.BLACK,
      PieceType.SILVER
    );
    this.squares[new Square(7, 9).index] = new Piece(
      Color.BLACK,
      PieceType.SILVER
    );
    this.squares[new Square(7, 1).index] = new Piece(
      Color.WHITE,
      PieceType.SILVER
    );
    this.squares[new Square(3, 1).index] = new Piece(
      Color.WHITE,
      PieceType.SILVER
    );
    this.squares[new Square(2, 9).index] = new Piece(
      Color.BLACK,
      PieceType.KNIGHT
    );
    this.squares[new Square(8, 9).index] = new Piece(
      Color.BLACK,
      PieceType.KNIGHT
    );
    this.squares[new Square(8, 1).index] = new Piece(
      Color.WHITE,
      PieceType.KNIGHT
    );
    this.squares[new Square(2, 1).index] = new Piece(
      Color.WHITE,
      PieceType.KNIGHT
    );
    this.squares[new Square(1, 9).index] = new Piece(
      Color.BLACK,
      PieceType.LANCE
    );
    this.squares[new Square(9, 9).index] = new Piece(
      Color.BLACK,
      PieceType.LANCE
    );
    this.squares[new Square(9, 1).index] = new Piece(
      Color.WHITE,
      PieceType.LANCE
    );
    this.squares[new Square(1, 1).index] = new Piece(
      Color.WHITE,
      PieceType.LANCE
    );
    this.squares[new Square(1, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(2, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(3, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(4, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(5, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(6, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(7, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(8, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(9, 7).index] = new Piece(
      Color.BLACK,
      PieceType.PAWN
    );
    this.squares[new Square(1, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(2, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(3, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(4, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(5, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(6, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(7, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(8, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    this.squares[new Square(9, 3).index] = new Piece(
      Color.WHITE,
      PieceType.PAWN
    );
    switch (type) {
      default:
      case InitialPositionType.STANDARD:
        return;
      case InitialPositionType.HANDICAP_LANCE:
        this.squares[new Square(1, 1).index] = null;
        return;
      case InitialPositionType.HANDICAP_RIGHT_LANCE:
        this.squares[new Square(9, 1).index] = null;
        return;
      case InitialPositionType.HANDICAP_BISHOP:
        this.squares[new Square(2, 2).index] = null;
        return;
      case InitialPositionType.HANDICAP_ROOK:
        this.squares[new Square(8, 2).index] = null;
        return;
      case InitialPositionType.HANDICAP_ROOK_LANCE:
        this.squares[new Square(8, 2).index] = null;
        this.squares[new Square(1, 1).index] = null;
        return;
      case InitialPositionType.HANDICAP_2PIECES:
        this.squares[new Square(8, 2).index] = null;
        this.squares[new Square(2, 2).index] = null;
        return;
      case InitialPositionType.HANDICAP_4PIECES:
        this.squares[new Square(8, 2).index] = null;
        this.squares[new Square(2, 2).index] = null;
        this.squares[new Square(1, 1).index] = null;
        this.squares[new Square(9, 1).index] = null;
        return;
      case InitialPositionType.HANDICAP_6PIECES:
        this.squares[new Square(8, 2).index] = null;
        this.squares[new Square(2, 2).index] = null;
        this.squares[new Square(1, 1).index] = null;
        this.squares[new Square(2, 1).index] = null;
        this.squares[new Square(8, 1).index] = null;
        this.squares[new Square(9, 1).index] = null;
        return;
      case InitialPositionType.HANDICAP_8PIECES:
        this.squares[new Square(8, 2).index] = null;
        this.squares[new Square(2, 2).index] = null;
        this.squares[new Square(1, 1).index] = null;
        this.squares[new Square(2, 1).index] = null;
        this.squares[new Square(3, 1).index] = null;
        this.squares[new Square(7, 1).index] = null;
        this.squares[new Square(8, 1).index] = null;
        this.squares[new Square(9, 1).index] = null;
        return;
    }
  }

  get sfen(): string {
    let ret = "";
    let empty = 0;
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const piece = this.at(Square.newByXY(x, y));
        if (piece) {
          if (empty) {
            ret += empty;
            empty = 0;
          }
          ret += piece.sfen;
        } else {
          empty += 1;
        }
      }
      if (empty) {
        ret += empty;
        empty = 0;
      }
      if (y !== 8) {
        ret += "/";
      }
    }
    return ret;
  }

  resetBySFEN(sfen: string): boolean {
    if (!Board.isValidSFEN(sfen)) {
      return false;
    }
    this.clear();
    const rows = sfen.split("/");
    for (let y = 0; y < 9; y += 1) {
      let x = 0;
      for (let i = 0; i < rows[y].length; i += 1) {
        let c = rows[y][i];
        if (c === "+") {
          i += 1;
          c += rows[y][i];
        }
        const n = sfenCharToNumber(c);
        if (n) {
          x += n;
        } else {
          this.set(Square.newByXY(x, y), Piece.newBySFEN(c) as Piece);
          x += 1;
        }
      }
    }
    return true;
  }

  findKing(color: Color): Square | undefined {
    const king = new Piece(color, PieceType.KING);
    return Square.all.find((square) => {
      const piece = this.at(square);
      if (piece && king.equals(piece)) {
        return true;
      }
      return;
    });
  }

  hasPower(
    target: Square,
    color: Color,
    option?: PowerDetectionOption
  ): boolean {
    return !!directions.find((dir) => {
      let step = 0;
      for (
        let square = target.neighbor(dir);
        square.valid;
        square = square.neighbor(dir)
      ) {
        step += 1;
        if (option && option.filled && square.equals(option.filled)) {
          break;
        }
        if (option && option.ignore && square.equals(option.ignore)) {
          continue;
        }
        const piece = this.at(square);
        if (piece) {
          if (piece.color !== color) {
            return false;
          }
          const rdir = reverseDirection(dir);
          const type = resolveMoveType(piece, rdir);
          return (
            type === MoveType.LONG || (type === MoveType.SHORT && step === 1)
          );
        }
      }
      return false;
    });
  }

  isChecked(kingColor: Color, option?: PowerDetectionOption): boolean {
    const square = this.findKing(kingColor);
    if (!square) {
      return false;
    }
    return this.hasPower(square, reverseColor(kingColor), {
      filled: option && option.filled,
      ignore: option && option.ignore,
    });
  }

  static isValidSFEN(sfen: string): boolean {
    const rows = sfen.split("/");
    if (rows.length !== 9) {
      return false;
    }
    for (let y = 0; y < 9; y += 1) {
      let x = 0;
      for (let i = 0; i < rows[y].length; i += 1) {
        let c = rows[y][i];
        if (c === "+") {
          i += 1;
          c += rows[y][i];
        }
        const n = sfenCharToNumber(c);
        if (n) {
          x += n;
        } else if (Piece.isValidSFEN(c)) {
          x += 1;
        } else {
          return false;
        }
      }
      if (x !== 9) {
        return false;
      }
    }
    return true;
  }

  copyFrom(board: Board): void {
    Square.all.forEach((square) => {
      this.squares[square.index] = board.at(square);
    });
  }
}
