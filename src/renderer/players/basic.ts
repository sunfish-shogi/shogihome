import {
  ImmutablePosition,
  isPromotable,
  isPromotableRank,
  Move,
  Piece,
  PieceType,
  Square,
  movableDirections,
  MoveType,
  resolveMoveType,
  handPieceTypes,
  Color,
  promotedPieceType,
  unpromotedPieceType,
  Position,
  ImmutableHand,
  Record,
} from "tsshogi";
import { Player, SearchHandler } from "./player.js";
import { TimeStates } from "@/common/game/time.js";
import * as uri from "@/common/uri.js";

const pieceValues: { [key in PieceType]: number } = {
  [PieceType.PAWN]: 100,
  [PieceType.LANCE]: 300,
  [PieceType.KNIGHT]: 400,
  [PieceType.SILVER]: 500,
  [PieceType.GOLD]: 600,
  [PieceType.BISHOP]: 700,
  [PieceType.ROOK]: 800,
  [PieceType.KING]: 0,
  [PieceType.PROM_PAWN]: 400,
  [PieceType.PROM_LANCE]: 500,
  [PieceType.PROM_KNIGHT]: 500,
  [PieceType.PROM_SILVER]: 600,
  [PieceType.HORSE]: 1200,
  [PieceType.DRAGON]: 1500,
};

export class BasicPlayer implements Player {
  private timer?: NodeJS.Timeout;

  constructor(private uri: string) {}

  isEngine(): boolean {
    return true;
  }

  async readyNewGame(): Promise<void> {
    // noop
  }

  async startSearch(
    position: ImmutablePosition,
    usi: string,
    timeStates: TimeStates,
    handler: SearchHandler,
  ): Promise<void> {
    this.timer = setTimeout(() => {
      let move: Move | null = null;
      if (this.uri === uri.ES_BASIC_ENGINE_RANDOM) {
        move = this.searchRandom(position);
      } else {
        const record = Record.newByUSI(usi);
        if (record instanceof Record) {
          const repCheck = (p: ImmutablePosition) => {
            // 相手番かつ迂回経路で千日手になる可能性があるので1回でも出現してたら回避する。
            return record.getRepetitionCount(p) >= 1;
          };
          move = this.search(this.uri, position.clone(), 2, repCheck)[0];
        }
      }
      if (move === null) {
        handler.onResign();
      } else {
        handler.onMove(move);
      }
    }, 500);
  }

  async startPonder(): Promise<void> {
    // ponder is not supported
  }

  async startMateSearch(): Promise<void> {
    // mate search is not supported
  }

  async stop(): Promise<void> {
    clearTimeout(this.timer);
  }

  async gameover(): Promise<void> {
    // noop
  }

  async close(): Promise<void> {
    clearTimeout(this.timer);
  }

  private searchRandom(position: ImmutablePosition): Move | null {
    const moves = listMoves(position);
    for (let range = moves.length; range > 0; range--) {
      const index = Math.floor(Math.random() * range);
      const move = moves[index];
      if (position.isValidMove(move)) {
        return move;
      }
      moves[index] = moves[range - 1];
    }
    return null;
  }

  private search(
    playerURI: string,
    position: Position,
    depth: number,
    repCheck?: (position: ImmutablePosition) => boolean,
  ): [Move, number] | [null, 0] {
    const moves = listMoves(position);
    let bestMove: Move | null = null;
    let bestScore = -Infinity;
    for (const move of moves) {
      let score = new Evaluator(playerURI, position, move).evaluate();
      if (!position.doMove(move)) {
        continue;
      }
      score -=
        repCheck && repCheck(position)
          ? 1000
          : depth > 1
            ? this.search(playerURI, position, depth - 1)[1]
            : this.see(position, move.to);
      position.undoMove(move);
      score += Math.random() * 10;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove ? [bestMove, bestScore] : [null, 0];
  }

  private see(position: ImmutablePosition, to: Square): number {
    const myPieces: PieceType[] = [];
    const enemyPieces: PieceType[] = [position.board.at(to)!.type];
    for (const from of position.listAttackers(to)) {
      const piece = position.board.at(from) as Piece;
      if (piece.color === position.color) {
        myPieces.push(piece.type);
      } else {
        enemyPieces.push(piece.type);
      }
    }
    myPieces.sort((a, b) => pieceValues[a] - pieceValues[b]);
    enemyPieces.sort((a, b) => pieceValues[a] - pieceValues[b]);
    return this.seeSearch(0, myPieces, 0, enemyPieces, 0);
  }

  private seeSearch(
    baseScore: number,
    myPieces: PieceType[],
    myIndex: number,
    enemyPieces: PieceType[],
    enemyIndex: number,
  ): number {
    if (myIndex >= myPieces.length) {
      return 0;
    }
    let score =
      baseScore +
      pieceValues[enemyPieces[enemyIndex]] +
      pieceValues[unpromotedPieceType(enemyPieces[enemyIndex])];
    if (score <= 0) {
      return 0;
    }
    score -= this.seeSearch(-score, enemyPieces, enemyIndex + 1, myPieces, myIndex);
    return Math.max(score, 0);
  }
}

function listMoves(position: ImmutablePosition): Move[] {
  const moves: Move[] = [];

  // 盤上の駒を動かす手
  function addMove(from: Square, to: Square, pieceType: PieceType): void {
    const captured = position.board.at(to);
    if (captured?.color === position.color) {
      return;
    }
    const move = new Move(from, to, false, position.color, pieceType, captured?.type || null);
    if (
      isPromotable(pieceType) &&
      (isPromotableRank(position.color, from.rank) || isPromotableRank(position.color, to.rank))
    ) {
      moves.push(move.withPromote());
      // 桂馬と銀以外は成れるなら成る。香車も成らない方が良い場合はあるがレアケースなので考えない。
      if (pieceType !== PieceType.KNIGHT && pieceType !== PieceType.SILVER) {
        return;
      }
    }
    moves.push(move);
  }
  for (const from of position.board.listNonEmptySquares()) {
    const piece = position.board.at(from) as Piece;
    if (piece.color !== position.color) {
      continue;
    }
    const directions = movableDirections(piece);
    for (const direction of directions) {
      const moveType = resolveMoveType(piece, direction);
      switch (moveType) {
        case MoveType.SHORT: {
          const to = from.neighbor(direction);
          if (to.valid) {
            addMove(from, to, piece.type);
          }
          break;
        }
        case MoveType.LONG:
          for (let to = from.neighbor(direction); to.valid; to = to.neighbor(direction)) {
            addMove(from, to, piece.type);
            if (position.board.at(to)) {
              break;
            }
          }
          break;
      }
    }
  }

  // 持ち駒を打つ手
  for (const pieceType of handPieceTypes) {
    if (position.hand(position.color).count(pieceType)) {
      for (const to of Square.all) {
        if (!position.board.at(to)) {
          const move = new Move(pieceType, to, false, position.color, pieceType, null);
          moves.push(move);
        }
      }
    }
  }

  return moves;
}

class Evaluator {
  private drop: boolean;
  private from?: Square;
  private to: Square;
  private whiteHand: ImmutableHand;

  constructor(
    private playerURI: string,
    private position: ImmutablePosition,
    private move: Move,
  ) {
    if (move.from instanceof Square) {
      this.drop = false;
      this.from = position.color === Color.BLACK ? move.from : move.from.opposite;
    } else {
      this.drop = true;
    }
    this.to = position.color === Color.BLACK ? move.to : move.to.opposite;
    this.whiteHand =
      this.position.color === Color.BLACK ? this.position.whiteHand : this.position.blackHand;
  }

  private isTo(file: number, rank: number) {
    return this.to.equals(new Square(file, rank));
  }

  private at(file: number, rank: number): Piece | null;
  private at(square: Square): Piece | null;
  private at(arg0: number | Square, arg1?: number) {
    let square = arg0 instanceof Square ? arg0 : new Square(arg0, arg1!);
    if (this.position.color === Color.WHITE) {
      square = square.opposite;
    }
    return this.position.board.at(square);
  }

  evaluate(): number {
    let score = 0;

    if (this.move.capturedPieceType) {
      const t = this.move.capturedPieceType;
      score += pieceValues[t] + pieceValues[unpromotedPieceType(t)];
    }
    if (this.move.promote) {
      const t = this.move.pieceType;
      score += pieceValues[promotedPieceType(t)] - pieceValues[t];
    }

    switch (this.move.pieceType) {
      case PieceType.PAWN:
        if (this.to.rank === 4) {
          // 歩をぶつける
          score += this.drop ? 10 : 20;
        } else if (!this.drop && (this.to.file === 1 || this.to.file === 9)) {
          // 端歩を突く
          score += 10;
        } else if (!this.drop && this.isTo(3, 6) && this.at(4, 6)) {
          score += 30;
        } else if (!this.drop && this.isTo(5, 6) && this.at(4, 6)?.type === PieceType.BISHOP) {
          score += 50;
        }
        break;
      case PieceType.SILVER:
        if (
          this.from &&
          this.to.rank < this.from.rank &&
          this.to.rank >= 7 &&
          this.to.file >= 2 &&
          this.to.file <= 8
        ) {
          // 銀を押し上げる
          score += 20;
        }
        break;
      case PieceType.BISHOP:
        if (this.drop && this.to.rank >= 4 && (this.to.file + this.to.rank) % 2 !== 0) {
          // 筋違いの角を避ける
          score -= 200;
        } else if (this.to.file === 1 || this.to.file === 9) {
          // 角を端に打たない(出ない)
          score -= 500;
        } else if (this.drop && this.to.rank === 1) {
          // 角を1段目に打たない
          score -= 50;
        } else if (this.isTo(4, 6) && !this.at(5, 5) && !this.at(6, 4) && !this.at(7, 3)) {
          // 55から73が空いていたら斜めのラインを狙う
          score += 100;
        }
        break;
      case PieceType.ROOK:
        if (this.to.rank === 7) {
          // 7段目に飛車を引かない
          score -= 20;
        }
        break;
    }

    if (
      this.from &&
      (this.move.pieceType === PieceType.PAWN ||
        this.move.pieceType === PieceType.SILVER ||
        this.move.pieceType === PieceType.GOLD ||
        this.move.pieceType === PieceType.PROM_PAWN ||
        this.move.pieceType === PieceType.PROM_LANCE ||
        this.move.pieceType === PieceType.PROM_KNIGHT ||
        this.move.pieceType === PieceType.PROM_SILVER)
    ) {
      if (this.to.rank < this.from.rank) {
        // 前進する
        score += this.to.rank - 3;
      } else if (this.to.rank > this.from.rank) {
        // 後退する
        score += 3 - this.to.rank;
      }
    }

    // 敵陣へ打ち込む
    if (this.to.rank <= 4 && this.drop) {
      switch (this.move.pieceType) {
        case PieceType.PAWN:
          score += this.to.rank * 3;
          break;
        case PieceType.LANCE:
        case PieceType.KNIGHT:
          score += this.to.rank * 2;
          break;
        case PieceType.SILVER:
        case PieceType.GOLD:
          score += this.to.rank + 40 - 40;
          break;
        case PieceType.BISHOP:
          score -= 100;
          break;
        case PieceType.ROOK:
          score += 500;
          break;
      }
    }

    switch (this.playerURI) {
      // 居飛車
      case uri.ES_BASIC_ENGINE_STATIC_ROOK_V1:
        score += this.evaluateStaticRook();
        break;
      // 振り飛車
      case uri.ES_BASIC_ENGINE_RANGING_ROOK_V1:
        score += this.evaluateRangingRook();
        break;
    }

    return score;
  }

  evaluateStaticRook(): number {
    let score = 0;
    switch (this.move.pieceType) {
      case PieceType.PAWN:
        if (!this.drop) {
          if (this.isTo(2, 6) || this.isTo(2, 5)) {
            // 飛車先の歩を伸ばす
            score += 50;
          } else if (this.isTo(7, 6)) {
            // 角道を開ける
            score += 100;
          } else if (this.isTo(6, 6)) {
            // 角道を止める
            score += 20;
          } else if (!this.drop && this.to.file === 3) {
            // 3筋の歩を伸ばす
            score += 20;
          }
        } else {
          if (this.isTo(8, 7)) {
            // 8筋を守る
            score += 200;
          } else if (this.isTo(8, 8)) {
            // 8筋を守る
            score += 50;
          }
        }
        break;
      case PieceType.LANCE:
      case PieceType.KNIGHT:
        // 香車と桂馬は基本的に動かさない
        score -= 50;
        break;
      case PieceType.SILVER:
        if (this.from && this.from.rank > this.to.rank) {
          if (this.isTo(8, 8) || this.isTo(7, 7)) {
            score += 100;
          } else if (this.isTo(6, 8) || this.isTo(6, 7)) {
            score += 20;
          } else if (this.isTo(3, 8) || this.isTo(3, 7) || this.isTo(3, 5) || this.isTo(4, 6)) {
            score += 20;
          } else if (this.isTo(2, 7) || this.isTo(2, 6)) {
            score += 10;
          }
        }
        break;
      case PieceType.GOLD:
        if (!this.drop) {
          if (this.isTo(7, 8)) {
            // 角頭を守る
            score += 80;
          } else if (this.isTo(5, 8)) {
            // 玉を守る
            score += 20;
          } else if (this.isTo(6, 7) && this.from && this.from.file <= 6) {
            // 厚みを作る
            score += 30;
          }
        }
        break;
      case PieceType.BISHOP:
        if (this.at(this.to)?.type === PieceType.BISHOP) {
          // 角を交換する
          score += 200;
        }
        break;
      case PieceType.KING:
        if (this.to.file === 6 && this.from && this.from.file === 5) {
          // 居玉を避ける
          score += 30;
        } else if (this.to.file === 7 && this.from && this.from.file === 6) {
          // 玉を囲う
          score += 100;
        } else if (this.to.file <= 4) {
          // 右辺に行かない
          score -= 1000;
        }
        break;
    }
    return score;
  }

  evaluateRangingRook(): number {
    let score = 0;
    switch (this.move.pieceType) {
      case PieceType.PAWN:
        if (!this.drop) {
          if (this.isTo(7, 6)) {
            // 角道を開ける
            score += 100;
          } else if (this.isTo(6, 6) && this.whiteHand.count(PieceType.BISHOP) === 0) {
            // 角道を止める
            score += 90;
          } else if (this.isTo(6, 5) && this.at(7, 8)) {
            // 角をぶつける
            score += 20;
            if (this.at(7, 5)) {
              score += 200;
            }
          } else if (this.isTo(7, 5)) {
            // 自分から7筋の歩を取らない
            score -= 150;
          } else if (this.to.file === 1) {
            // 1筋の歩を付く
            score += 40;
            if (this.at(1, 4)) {
              score += 50;
            }
          } else if (this.to.file === 9 && this.at(9, 4)) {
            score += 50;
          }
        } else {
          if (this.isTo(8, 7)) {
            // 8筋を守る
            score += 200;
          } else if (this.isTo(8, 8)) {
            // 8筋を守る
            score += 50;
          }
        }
        break;
      case PieceType.LANCE:
      case PieceType.KNIGHT:
        // 香車と桂馬は基本的に動かさない
        score -= 50;
        break;
      case PieceType.SILVER:
        if (this.from instanceof Square && this.from.rank > this.to.rank && this.at(7, 6)) {
          if (this.isTo(7, 8)) {
            score += 40;
          } else if (this.isTo(6, 7)) {
            score += 30;
          } else if (this.isTo(5, 6)) {
            score += 10;
          } else if (this.isTo(6, 5)) {
            score += this.at(6, 6)?.type === PieceType.PAWN ? -10 : 20;
          } else if (this.isTo(4, 5)) {
            score += 10;
          } else if (this.isTo(3, 8)) {
            score += 10;
          }
        }
        break;
      case PieceType.GOLD:
        if (!this.drop && this.isTo(7, 8)) {
          score += 20;
        }
        break;
      case PieceType.BISHOP:
        if (!this.drop && this.isTo(7, 7)) {
          score += 70;
          if (this.at(8, 5)) {
            score += 50;
          }
        }
        break;
      case PieceType.ROOK:
        if (!this.drop && this.isTo(6, 8)) {
          score += 80;
        }
        break;
      case PieceType.KING:
        if (this.to.file >= 5) {
          // 左辺に行かない
          score -= 1000;
        } else if (this.from && this.from.file > this.to.file && this.to.file >= 2) {
          score += 60 + 5 * (4 - this.to.file);
        }
        break;
    }
    return score;
  }
}
