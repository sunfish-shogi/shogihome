// 将棋の基本型。エンジン非依存で、engines/ 配下の全エンジンから利用する。
#pragma once

#include <string>

namespace shogi {

enum Color : int {
  BLACK = 0,
  WHITE = 1,
};

inline Color opposite(Color color) {
  return color == BLACK ? WHITE : BLACK;
}

enum PieceType : int {
  NO_PIECE_TYPE = 0,
  PAWN,
  LANCE,
  KNIGHT,
  SILVER,
  GOLD,
  BISHOP,
  ROOK,
  KING,
  PROM_PAWN,
  PROM_LANCE,
  PROM_KNIGHT,
  PROM_SILVER,
  HORSE,
  DRAGON,
  PIECE_TYPE_COUNT,
};

// 持ち駒になり得る駒種。tsshogi の handPieceTypes と同じ順序。
constexpr PieceType HAND_PIECE_TYPES[] = {PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK};
constexpr int HAND_PIECE_TYPE_COUNT = 7;

inline bool isPromoted(PieceType type) {
  return type >= PROM_PAWN;
}

// 成れる駒かどうか。玉と金と成り駒は成れない。
inline bool isPromotable(PieceType type) {
  switch (type) {
    case PAWN:
    case LANCE:
    case KNIGHT:
    case SILVER:
    case BISHOP:
    case ROOK:
      return true;
    default:
      return false;
  }
}

inline PieceType promotedPieceType(PieceType type) {
  switch (type) {
    case PAWN:
      return PROM_PAWN;
    case LANCE:
      return PROM_LANCE;
    case KNIGHT:
      return PROM_KNIGHT;
    case SILVER:
      return PROM_SILVER;
    case BISHOP:
      return HORSE;
    case ROOK:
      return DRAGON;
    default:
      return type;
  }
}

inline PieceType unpromotedPieceType(PieceType type) {
  switch (type) {
    case PROM_PAWN:
      return PAWN;
    case PROM_LANCE:
      return LANCE;
    case PROM_KNIGHT:
      return KNIGHT;
    case PROM_SILVER:
      return SILVER;
    case HORSE:
      return BISHOP;
    case DRAGON:
      return ROOK;
    default:
      return type;
  }
}

// 盤上の駒。空マスは NO_PIECE。
enum Piece : int {
  NO_PIECE = 0,
};

constexpr int WHITE_PIECE_OFFSET = 16;

// Piece を添字にする配列の要素数。後手の駒は WHITE_PIECE_OFFSET を足した値になる。
constexpr int PIECE_COUNT = WHITE_PIECE_OFFSET * 2;

inline Piece makePiece(Color color, PieceType type) {
  return static_cast<Piece>((color == WHITE ? WHITE_PIECE_OFFSET : 0) + type);
}

inline bool isEmpty(Piece piece) {
  return piece == NO_PIECE;
}

inline Color colorOf(Piece piece) {
  return piece >= WHITE_PIECE_OFFSET ? WHITE : BLACK;
}

inline PieceType typeOf(Piece piece) {
  return static_cast<PieceType>(piece & (WHITE_PIECE_OFFSET - 1));
}

// マス。筋 (file) は右から 1..9、段 (rank) は上から 1..9。
// 先手は段が小さくなる方向へ進む。tsshogi の Square と同じ座標系。
using Square = int;

constexpr Square SQ_NONE = -1;
constexpr int FILE_COUNT = 9;
constexpr int RANK_COUNT = 9;
constexpr int SQUARE_COUNT = FILE_COUNT * RANK_COUNT;

inline Square squareOf(int file, int rank) {
  return (rank - 1) * FILE_COUNT + (file - 1);
}

inline int fileOf(Square square) {
  return square % FILE_COUNT + 1;
}

inline int rankOf(Square square) {
  return square / FILE_COUNT + 1;
}

inline bool isValidFileRank(int file, int rank) {
  return file >= 1 && file <= FILE_COUNT && rank >= 1 && rank <= RANK_COUNT;
}

// 180 度回転したマス。tsshogi の Square#opposite と同じ。
inline Square oppositeSquare(Square square) {
  return squareOf(10 - fileOf(square), 10 - rankOf(square));
}

// 成れる段かどうか。
inline bool isPromotableRank(Color color, int rank) {
  return color == BLACK ? rank <= 3 : rank >= 7;
}

// 指し手。打ち駒の場合は from == SQ_NONE。
struct Move {
  Square from = SQ_NONE;
  Square to = SQ_NONE;
  PieceType pieceType = NO_PIECE_TYPE;  // 成る前の駒種 (打ち駒の場合は打つ駒種)
  PieceType capturedPieceType = NO_PIECE_TYPE;
  Color color = BLACK;
  bool promote = false;

  bool isDrop() const {
    return from == SQ_NONE;
  }

  bool operator==(const Move& other) const {
    return from == other.from && to == other.to && pieceType == other.pieceType &&
           promote == other.promote && color == other.color;
  }
};

// USI 形式の指し手表記 (例: "7g7f", "8h2b+", "P*5e")。
std::string moveToUSI(const Move& move);

}  // namespace shogi
