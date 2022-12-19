import { Direction } from "./direction";

function sfenFileToNumber(sfen: string): number | null {
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

function sfenRankToNumber(sfen: string): number | null {
  switch (sfen) {
    case "a":
      return 1;
    case "b":
      return 2;
    case "c":
      return 3;
    case "d":
      return 4;
    case "e":
      return 5;
    case "f":
      return 6;
    case "g":
      return 7;
    case "h":
      return 8;
    case "i":
      return 9;
    default:
      return null;
  }
}

const sfenRanks = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

export class Square {
  constructor(public file: number, public rank: number) {}

  get x(): number {
    return 9 - this.file;
  }

  get y(): number {
    return this.rank - 1;
  }

  get index(): number {
    return this.y * 9 + this.x;
  }

  get opposite(): Square {
    return new Square(10 - this.file, 10 - this.rank);
  }

  neighbor(dx: number, dy: number): Square;
  neighbor(dir: Direction): Square;
  neighbor(arg0: number | Direction, arg1?: number): Square {
    switch (arg0) {
      case Direction.UP:
        return new Square(this.file, this.rank - 1);
      case Direction.DOWN:
        return new Square(this.file, this.rank + 1);
      case Direction.LEFT:
        return new Square(this.file + 1, this.rank);
      case Direction.RIGHT:
        return new Square(this.file - 1, this.rank);
      case Direction.LEFT_UP:
        return new Square(this.file + 1, this.rank - 1);
      case Direction.RIGHT_UP:
        return new Square(this.file - 1, this.rank - 1);
      case Direction.LEFT_DOWN:
        return new Square(this.file + 1, this.rank + 1);
      case Direction.RIGHT_DOWN:
        return new Square(this.file - 1, this.rank + 1);
      case Direction.LEFT_UP_KNIGHT:
        return new Square(this.file + 1, this.rank - 2);
      case Direction.RIGHT_UP_KNIGHT:
        return new Square(this.file - 1, this.rank - 2);
      case Direction.LEFT_DOWN_KNIGHT:
        return new Square(this.file + 1, this.rank + 2);
      case Direction.RIGHT_DOWN_KNIGHT:
        return new Square(this.file - 1, this.rank + 2);
    }
    const dx = arg0 as number;
    const dy = arg1 as number;
    return new Square(this.file - dx, this.rank + dy);
  }

  get valid(): boolean {
    return this.file >= 1 && this.file <= 9 && this.rank >= 1 && this.rank <= 9;
  }

  equals(square: Square | null | undefined): boolean {
    return !!square && this.file === square.file && this.rank === square.rank;
  }

  static newByXY(x: number, y: number): Square {
    return new Square(9 - x, y + 1);
  }

  static newByIndex(index: number): Square {
    return new Square(9 - (index % 9), Math.trunc(index / 9) + 1);
  }

  static all: Square[] = [];

  get sfen(): string {
    return this.file + sfenRanks[this.rank - 1];
  }

  static parseSFENSquare(sfen: string): Square | null {
    const file = sfenFileToNumber(sfen[0]);
    const rank = sfenRankToNumber(sfen[1]);
    if (!file || !rank) {
      return null;
    }
    return new Square(file, rank);
  }
}

for (let index = 0; index < 81; index += 1) {
  Square.all.push(Square.newByIndex(index));
}
