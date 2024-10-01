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
} from "tsshogi";
import { Player, SearchHandler } from "./player";
import { TimeStates } from "@/common/game/time";
import * as uri from "@/common/uri";

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
      let move: Move | null;
      if (this.uri === uri.ES_BASIC_ENGINE_RANDOM) {
        move = this.searchRandom(position);
      } else {
        const p = position.clone();
        const depth = 3;
        move = this.search(p, depth)[0];
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

  private search(position: Position, depth: number): [Move | null, number] {
    const moves = listMoves(position);
    const moveScores = moves
      .map((move) => {
        const score = evaluate(this.uri, position, move);
        if (!position.doMove(move)) {
          return { move, score: -Infinity, see: -Infinity };
        }
        const see = -this.see(position, move.to);
        position.undoMove(move);
        return { move, score, see };
      })
      .filter(({ score }) => score > -Infinity);
    moveScores.sort((a, b) => b.score + b.see - a.score - a.see);
    let bestMove: Move | null = null;
    let bestScore = -Infinity;
    for (const { move, score, see } of moveScores) {
      if (bestMove && score + see < bestScore) {
        continue;
      }
      let deepScore: number;
      if (depth > 1) {
        position.doMove(move, { ignoreValidation: true });
        deepScore = score - this.search(position, depth - 1)[1];
        position.undoMove(move);
      } else {
        deepScore = score + see;
      }
      deepScore += Math.random() * 10;
      if (deepScore > bestScore) {
        bestScore = deepScore;
        bestMove = move;
      }
    }
    return [bestMove ? bestMove : null, bestScore];
  }

  private see(position: Position, to: Square): number {
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

function evaluate(playerURI: string, position: ImmutablePosition, move: Move): number {
  let score = 0;

  if (move.capturedPieceType) {
    const t = move.capturedPieceType;
    score += pieceValues[t] + pieceValues[unpromotedPieceType(t)];
  }
  if (move.promote) {
    const t = move.pieceType;
    score += pieceValues[promotedPieceType(t)] - pieceValues[t];
  }

  let table: { [key in PieceType]: number[] };
  switch (playerURI) {
    // 居飛車
    case uri.ES_BASIC_ENGINE_STATIC_ROOK_V1:
      table = staticRookEvalTable;
      break;
    // 振り飛車
    case uri.ES_BASIC_ENGINE_RANGING_ROOK_V1:
      table = rangingRookEvalTable;
      break;
    default:
      throw new Error(`Unknown player URI: ${playerURI}`);
  }

  const from =
    move.from instanceof Square
      ? position.color === Color.BLACK
        ? move.from
        : move.from.opposite
      : null;
  const to = position.color === Color.BLACK ? move.to : move.to.opposite;

  if (from) {
    score -= table[move.pieceType][from.index];
  } else {
    score -= handEvalTable[move.pieceType];
  }
  if (move.promote) {
    score += table[promotedPieceType(move.pieceType)][to.index];
  } else {
    score += table[move.pieceType][to.index];
  }
  if (move.capturedPieceType) {
    score += table[move.capturedPieceType][to.opposite.index];
    score += handEvalTable[move.capturedPieceType];
  }

  return score;
}

const pieceValues: { [key in PieceType]: number } = {
  [PieceType.PAWN]: 100,
  [PieceType.LANCE]: 300,
  [PieceType.KNIGHT]: 400,
  [PieceType.SILVER]: 500,
  [PieceType.GOLD]: 600,
  [PieceType.BISHOP]: 900,
  [PieceType.ROOK]: 1200,
  [PieceType.KING]: 0,
  [PieceType.PROM_PAWN]: 800,
  [PieceType.PROM_LANCE]: 700,
  [PieceType.PROM_KNIGHT]: 700,
  [PieceType.PROM_SILVER]: 700,
  [PieceType.HORSE]: 1500,
  [PieceType.DRAGON]: 1800,
};

const handEvalTable = {
  [PieceType.PAWN]: 20,
  [PieceType.LANCE]: 30,
  [PieceType.KNIGHT]: 30,
  [PieceType.SILVER]: 40,
  [PieceType.GOLD]: 40,
  [PieceType.BISHOP]: 30,
  [PieceType.ROOK]: 30,
  [PieceType.KING]: 0,
  [PieceType.PROM_PAWN]: 20,
  [PieceType.PROM_LANCE]: 30,
  [PieceType.PROM_KNIGHT]: 30,
  [PieceType.PROM_SILVER]: 40,
  [PieceType.HORSE]: 30,
  [PieceType.DRAGON]: 30,
};

const staticRookEvalTable =
  // prettier-ignore
  {
    [PieceType.PAWN]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  5,  0,  0,  0,  0, 30,  0, // 4
       3,  0, -5,  0,  0,  0,  0, 20,  3, // 5
       3,  0, 10,  5,  5,  3,  3, 10,  3, // 6
       0, 30,-20,  5,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
    [PieceType.LANCE]: [
     -10,-10,-10,-10,-10,-10,-10,-10,-10, // 1
     -10,-10,-10,-10,-10,-10,-10,-10,-10, // 2
     -10,-10,-10,-10,-10,-10,-10,-10,-10, // 3
     -10,-10,-10,-10,-10,-10,-10,-10,-10, // 4
     -10,-10,-10,-10,-10,-10,-10,-10,-10, // 5
     -20,-20,-20,-20,-20,-20,-20,-20,-20, // 6
     -20,-20,-20,-20,-20,-20,-20,-20,-20, // 7
     -20,-20,-20,-20,-20,-20,-20,-20,-20, // 8
      20, 20, 20, 20, 20, 20, 20, 20, 20, // 9
    ],
    [PieceType.KNIGHT]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  1,  0,  1,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
     -10,  0, -5,  0,  0,  0,  2,  0,-10, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  2,  0, // 9
    ],
    [PieceType.SILVER]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0, 10, 10, 20, 20,  0, // 4
       0,  0,  0,  0, 10, 10, 20, 20, 17, // 5
     -20,  0,  0, -5, 10, 15, 10, 15,-20, // 6
     -20,  0, 30, 10, 10, 10, 10, 10,-20, // 7
     -20,  5,  0,  5,  0,  5,  5,  0,-20, // 8
     -20,-20,  0,-10,-20,-20, -5,-20,-20, // 9
    ],
    [PieceType.GOLD]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
     -20,-10,-10,-10,-10,-10,-20,-20,-20, // 6
     -20,  0, -5,  5, -5,  0,-10,-10,-20, // 7
     -20,-10, 80,  0,  5,  0,-10,-20,-20, // 8
     -20,  0, -5,-10,  0,  0,  0,-20,-20, // 9
    ],
    [PieceType.BISHOP]: [
       0,-30,-30,-30,-30,-30,-30,-30,  0, // 1
       0, 20, 20, 20, 20, 20, 20, 20,  0, // 2
       0, 20, 20, 20, 20, 20, 20, 20,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
     -10,  0,  0,  0,  0,  0,  0,  0,-10, // 5
     -20,-10,  0,-10,-10,  5,-10,  0,-20, // 6
     -20,-20,  0,-20,  0,-20, 10,-20,-20, // 7
     -20,  0,-20, 15,-20,-10,-20,-10,-20, // 8
     -20,-20, 10,-20, 10,-20,-20,-20,-20, // 9
    ],
    [PieceType.ROOK]: [
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 1
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 2
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  5,  5,  5, 10,  0, // 8
       0,  0,  0,  0,  0,  0,  0, 10,  0, // 9
    ],
    [PieceType.KING]: [
     200,200,200,200,200,200,200,200,200, // 1
     200,200,200,200,200,200,200,200,200, // 2
     200,200,200,200,200,200,200,200,200, // 3
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 4
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 5
     -10,  0,  0,  0,  0,  0,  0,  0,-10, // 6
     -10,-10,-10,-10,-10,-10,-10,-10,-10, // 7
     -10,  0,  0,  0,  0,-10,-10,-10,-10, // 8
     -10,  0,  0,  5,  0,-10,-10,-10,-10, // 9
    ],
    [PieceType.PROM_PAWN]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
    [PieceType.PROM_LANCE]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
    [PieceType.PROM_KNIGHT]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
    [PieceType.PROM_SILVER]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
    [PieceType.HORSE]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0, 10, 10, 10, 10, 10, 10, 10,  0, // 2
       0, 20, 20, 20, 20, 20, 20, 20,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
    [PieceType.DRAGON]: [
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 1
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 2
      30, 30, 30, 30, 30, 30, 30, 30, 30, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
  };

const rangingRookEvalTable =
  // prettier-ignore
  {
    [PieceType.PAWN]: [
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.LANCE]: [                 
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.KNIGHT]: [                
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.SILVER]: [                
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.GOLD]: [                  
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.BISHOP]: [                
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.ROOK]: [                  
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.KING]: [                  
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.PROM_PAWN]: [             
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.PROM_LANCE]: [            
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.PROM_KNIGHT]: [           
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.PROM_SILVER]: [           
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.HORSE]: [                 
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],                                   
    [PieceType.DRAGON]: [                
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 1
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 2
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 3
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 4
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 5
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 6
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 7
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 8
       0,  0,  0,  0,  0,  0,  0,  0,  0, // 9
    ],
  };
