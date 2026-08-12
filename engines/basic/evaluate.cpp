#include "evaluate.h"

namespace shogi {
namespace basic {

const int PIECE_VALUES[PIECE_TYPE_COUNT] = {
    0,     // NO_PIECE_TYPE
    100,   // PAWN
    300,   // LANCE
    400,   // KNIGHT
    500,   // SILVER
    600,   // GOLD
    700,   // BISHOP
    800,   // ROOK
    0,     // KING
    400,   // PROM_PAWN
    500,   // PROM_LANCE
    500,   // PROM_KNIGHT
    600,   // PROM_SILVER
    1200,  // HORSE
    1500,  // DRAGON
};

namespace {

// basic.ts の Evaluator と同じく、後手番の場合は盤を 180 度回転した座標で評価する。
class Evaluator {
 public:
  Evaluator(Style style, const Position& position, const Move& move)
      : style_(style), position_(position), move_(move) {
    drop_ = move.isDrop();
    if (!drop_) {
      from_ = position.color() == BLACK ? move.from : oppositeSquare(move.from);
    }
    to_ = position.color() == BLACK ? move.to : oppositeSquare(move.to);
    opponent_ = opposite(position.color());
  }

  int evaluate() const;

 private:
  bool isTo(int file, int rank) const {
    return to_ == squareOf(file, rank);
  }

  // 先手視点の座標で盤上の駒を参照する。
  Piece at(int file, int rank) const {
    return atSquare(squareOf(file, rank));
  }

  Piece atSquare(Square square) const {
    return position_.at(position_.color() == BLACK ? square : oppositeSquare(square));
  }

  int toFile() const {
    return fileOf(to_);
  }

  int toRank() const {
    return rankOf(to_);
  }

  int evaluateStaticRook() const;
  int evaluateRangingRook() const;

  Style style_;
  const Position& position_;
  const Move& move_;
  bool drop_ = false;
  Square from_ = SQ_NONE;
  Square to_ = SQ_NONE;
  Color opponent_ = WHITE;
};

int Evaluator::evaluate() const {
  int score = 0;

  if (move_.capturedPieceType != NO_PIECE_TYPE) {
    const PieceType t = move_.capturedPieceType;
    score += PIECE_VALUES[t] + PIECE_VALUES[unpromotedPieceType(t)];
  }
  if (move_.promote) {
    const PieceType t = move_.pieceType;
    score += PIECE_VALUES[promotedPieceType(t)] - PIECE_VALUES[t];
  }

  switch (move_.pieceType) {
    case PAWN:
      if (toRank() == 4) {
        // 歩をぶつける
        score += drop_ ? 10 : 20;
      } else if (!drop_ && (toFile() == 1 || toFile() == 9)) {
        // 端歩を突く
        score += 10;
      } else if (!drop_ && isTo(3, 6) && !isEmpty(at(4, 6))) {
        score += 30;
      } else if (!drop_ && isTo(5, 6) && typeOf(at(4, 6)) == BISHOP && !isEmpty(at(4, 6))) {
        score += 50;
      }
      break;
    case SILVER:
      if (from_ != SQ_NONE && toRank() < rankOf(from_) && toRank() >= 7 && toFile() >= 2 &&
          toFile() <= 8) {
        // 銀を押し上げる
        score += 20;
      }
      break;
    case BISHOP:
      if (drop_ && toRank() >= 4 && (toFile() + toRank()) % 2 != 0) {
        // 筋違いの角を避ける
        score -= 200;
      } else if (toFile() == 1 || toFile() == 9) {
        // 角を端に打たない(出ない)
        score -= 500;
      } else if (drop_ && toRank() == 1) {
        // 角を1段目に打たない
        score -= 50;
      } else if (isTo(4, 6) && isEmpty(at(5, 5)) && isEmpty(at(6, 4)) && isEmpty(at(7, 3))) {
        // 55から73が空いていたら斜めのラインを狙う
        score += 100;
      }
      break;
    case ROOK:
      if (toRank() == 7) {
        // 7段目に飛車を引かない
        score -= 20;
      }
      break;
    default:
      break;
  }

  if (from_ != SQ_NONE &&
      (move_.pieceType == PAWN || move_.pieceType == SILVER || move_.pieceType == GOLD ||
       move_.pieceType == PROM_PAWN || move_.pieceType == PROM_LANCE ||
       move_.pieceType == PROM_KNIGHT || move_.pieceType == PROM_SILVER)) {
    if (toRank() < rankOf(from_)) {
      // 前進する
      score += toRank() - 3;
    } else if (toRank() > rankOf(from_)) {
      // 後退する
      score += 3 - toRank();
    }
  }

  // 敵陣へ打ち込む
  if (toRank() <= 4 && drop_) {
    switch (move_.pieceType) {
      case PAWN:
        score += toRank() * 3;
        break;
      case LANCE:
      case KNIGHT:
        score += toRank() * 2;
        break;
      case SILVER:
      case GOLD:
        score += toRank();
        break;
      case BISHOP:
        score -= 100;
        break;
      case ROOK:
        score += 500;
        break;
      default:
        break;
    }
  }

  switch (style_) {
    case STYLE_STATIC_ROOK:
      score += evaluateStaticRook();
      break;
    case STYLE_RANGING_ROOK:
      score += evaluateRangingRook();
      break;
    default:
      break;
  }

  return score;
}

int Evaluator::evaluateStaticRook() const {
  int score = 0;
  switch (move_.pieceType) {
    case PAWN:
      if (!drop_) {
        if (isTo(2, 6) || isTo(2, 5)) {
          // 飛車先の歩を伸ばす
          score += 50;
        } else if (isTo(7, 6)) {
          // 角道を開ける
          score += 100;
        } else if (isTo(6, 6)) {
          // 角道を止める
          score += 20;
        } else if (toFile() == 3) {
          // 3筋の歩を伸ばす
          score += 20;
        }
      } else {
        if (isTo(8, 7)) {
          // 8筋を守る
          score += 200;
        } else if (isTo(8, 8)) {
          // 8筋を守る
          score += 50;
        }
      }
      break;
    case LANCE:
    case KNIGHT:
      // 香車と桂馬は基本的に動かさない
      score -= 50;
      break;
    case SILVER:
      if (from_ != SQ_NONE && rankOf(from_) > toRank()) {
        if (isTo(8, 8) || isTo(7, 7)) {
          score += 100;
        } else if (isTo(6, 8) || isTo(6, 7)) {
          score += 20;
        } else if (isTo(3, 8) || isTo(3, 7) || isTo(3, 5) || isTo(4, 6)) {
          score += 20;
        } else if (isTo(2, 7) || isTo(2, 6)) {
          score += 10;
        }
      }
      break;
    case GOLD:
      if (!drop_) {
        if (isTo(7, 8)) {
          // 角頭を守る
          score += 80;
        } else if (isTo(5, 8)) {
          // 玉を守る
          score += 20;
        } else if (isTo(6, 7) && from_ != SQ_NONE && fileOf(from_) <= 6) {
          // 厚みを作る
          score += 30;
        }
      }
      break;
    case BISHOP:
      if (!isEmpty(atSquare(to_)) && typeOf(atSquare(to_)) == BISHOP) {
        // 角を交換する
        score += 200;
      }
      break;
    case KING:
      if (toFile() == 6 && from_ != SQ_NONE && fileOf(from_) == 5) {
        // 居玉を避ける
        score += 30;
      } else if (toFile() == 7 && from_ != SQ_NONE && fileOf(from_) == 6) {
        // 玉を囲う
        score += 100;
      } else if (toFile() <= 4) {
        // 右辺に行かない
        score -= 1000;
      }
      break;
    default:
      break;
  }
  return score;
}

int Evaluator::evaluateRangingRook() const {
  int score = 0;
  switch (move_.pieceType) {
    case PAWN:
      if (!drop_) {
        if (isTo(7, 6)) {
          // 角道を開ける
          score += 100;
        } else if (isTo(6, 6) && position_.handCount(opponent_, BISHOP) == 0) {
          // 角道を止める
          score += 90;
        } else if (isTo(6, 5) && !isEmpty(at(7, 8))) {
          // 角をぶつける
          score += 20;
          if (!isEmpty(at(7, 5))) {
            score += 200;
          }
        } else if (isTo(7, 5)) {
          // 自分から7筋の歩を取らない
          score -= 150;
        } else if (toFile() == 1) {
          // 1筋の歩を付く
          score += 40;
          if (!isEmpty(at(1, 4))) {
            score += 50;
          }
        } else if (toFile() == 9 && !isEmpty(at(9, 4))) {
          score += 50;
        }
      } else {
        if (isTo(8, 7)) {
          // 8筋を守る
          score += 200;
        } else if (isTo(8, 8)) {
          // 8筋を守る
          score += 50;
        }
      }
      break;
    case LANCE:
    case KNIGHT:
      // 香車と桂馬は基本的に動かさない
      score -= 50;
      break;
    case SILVER:
      if (from_ != SQ_NONE && rankOf(from_) > toRank() && !isEmpty(at(7, 6))) {
        if (isTo(7, 8)) {
          score += 40;
        } else if (isTo(6, 7)) {
          score += 30;
        } else if (isTo(5, 6)) {
          score += 10;
        } else if (isTo(6, 5)) {
          score += (!isEmpty(at(6, 6)) && typeOf(at(6, 6)) == PAWN) ? -10 : 20;
        } else if (isTo(4, 5)) {
          score += 10;
        } else if (isTo(3, 8)) {
          score += 10;
        }
      }
      break;
    case GOLD:
      if (!drop_ && isTo(7, 8)) {
        score += 20;
      }
      break;
    case BISHOP:
      if (!drop_ && isTo(7, 7)) {
        score += 70;
        if (!isEmpty(at(8, 5))) {
          score += 50;
        }
      }
      break;
    case ROOK:
      if (!drop_ && isTo(6, 8)) {
        score += 80;
      }
      break;
    case KING:
      if (toFile() >= 5) {
        // 左辺に行かない
        score -= 1000;
      } else if (from_ != SQ_NONE && fileOf(from_) > toFile() && toFile() >= 2) {
        score += 60 + 5 * (4 - toFile());
      }
      break;
    default:
      break;
  }
  return score;
}

}  // namespace

int evaluateMove(Style style, const Position& position, const Move& move) {
  return Evaluator(style, position, move).evaluate();
}

}  // namespace basic
}  // namespace shogi
