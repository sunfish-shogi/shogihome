#include "evaluate.h"

#include "pst.h"

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

int evaluatePosition(Style style, const Position& position) {
  int score = 0;

  // 盤上の駒: 駒割 + 位置評価。
  for (Square square = 0; square < SQUARE_COUNT; square++) {
    const Piece piece = position.at(square);
    if (isEmpty(piece)) {
      continue;
    }
    const PieceType type = typeOf(piece);
    const bool black = colorOf(piece) == BLACK;
    // 後手の駒は盤を 180 度回転した位置で評価する。
    const Square normalized = black ? square : oppositeSquare(square);
    const int value = PIECE_VALUES[type] + pieceSquareValue(style, type, normalized);
    score += black ? value : -value;
  }

  // 持ち駒: 駒割のみ。位置が無い代わりに HAND_BONUS を上乗せする。
  for (int i = 0; i < HAND_PIECE_TYPE_COUNT; i++) {
    const PieceType type = HAND_PIECE_TYPES[i];
    score += position.handCount(BLACK, type) * handValue(type);
    score -= position.handCount(WHITE, type) * handValue(type);
  }

  return position.color() == BLACK ? score : -score;
}

int materialDelta(const Move& move) {
  int delta = 0;
  if (move.capturedPieceType != NO_PIECE_TYPE) {
    // 相手の盤上の駒が減り、自分の持ち駒が増えるので 2 倍の差が生じる。
    // 持ち駒になる側は成りが戻るので、元の駒種で数える。
    const PieceType captured = move.capturedPieceType;
    delta += PIECE_VALUES[captured] + handValue(unpromotedPieceType(captured));
  }
  if (move.promote) {
    delta += PIECE_VALUES[promotedPieceType(move.pieceType)] - PIECE_VALUES[move.pieceType];
  }
  return delta;
}

}  // namespace basic
}  // namespace shogi
