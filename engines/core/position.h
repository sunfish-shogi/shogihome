// 局面と指し手生成。tsshogi (Position / Board / direction) の判定規則をそのまま移植している。
#pragma once

#include <array>
#include <string>
#include <vector>

#include "types.h"

namespace shogi {

// 方向。tsshogi の Direction と同じ 12 方向。デルタは (筋, 段) で表す。
// 筋は右から 1..9、段は上から 1..9 なので、先手から見た前進は段が減る方向。
enum DirectionIndex : int {
  DIR_UP = 0,
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_LEFT_UP,
  DIR_RIGHT_UP,
  DIR_LEFT_DOWN,
  DIR_RIGHT_DOWN,
  DIR_LEFT_UP_KNIGHT,
  DIR_RIGHT_UP_KNIGHT,
  DIR_LEFT_DOWN_KNIGHT,
  DIR_RIGHT_DOWN_KNIGHT,
  DIRECTION_COUNT,
};

enum MoveType : int {
  MOVE_TYPE_NONE = 0,
  MOVE_TYPE_SHORT,
  MOVE_TYPE_LONG,
};

struct Delta {
  int file;
  int rank;
};

extern const Delta DIRECTION_DELTAS[DIRECTION_COUNT];

int reverseDirection(int direction);
MoveType resolveMoveType(Piece piece, int direction);
bool isKnightDirection(int direction);

// 局面。undoMove のために取った駒と成りの情報を Move に持たせている。
class Position {
 public:
  Position();

  static const char* STARTPOS_SFEN;

  // SFEN 形式 (手数の有無は問わない) から局面を設定する。
  bool setSFEN(const std::string& sfen);
  // 手数を除いた SFEN 形式 (盤面 + 手番 + 持ち駒) を返す。千日手判定のキーとして使う。
  std::string key() const;
  // 手数付きの SFEN 形式を返す。
  std::string sfen(int ply) const;

  Color color() const {
    return color_;
  }
  Piece at(Square square) const {
    return board_[square];
  }
  int handCount(Color color, PieceType type) const {
    return hands_[color][type];
  }

  // 指定したマスに利いている駒のマス目を列挙する。tsshogi の Position#listAttackers と同じ。
  std::vector<Square> listAttackers(Square to) const;

  // 指定した駒が from から to へ動けるかどうか (利きの有無)。駒の色は問わない。
  bool isMovable(Square from, Square to) const;

  // 合法手かどうか。tsshogi の Position#isValidMove と同じ判定を行う。
  bool isValidMove(const Move& move) const;

  // 合法手であれば指して true を返す。非合法手の場合は何もせず false を返す。
  bool doMove(const Move& move);
  // doMove で指した手を戻す。
  void undoMove(const Move& move);

  // USI 形式の指し手文字列から Move を生成する。非合法な表記の場合は false を返す。
  bool parseUSIMove(const std::string& text, Move* move) const;

  // 疑似合法手を列挙する。
  std::vector<Move> listMoves() const;
  // 駒を取る手だけを列挙する。静止探索で使う。
  std::vector<Move> listCaptures() const;

  // 指定した手番の玉に王手がかかっているかどうか。
  bool inCheck(Color color) const;

  Square findKing(Color color) const;

 private:
  std::vector<Move> generateMoves(bool capturesOnly) const;
  bool hasPower(Square target, Color color, Square filled, Square ignore) const;
  bool isChecked(Color kingColor, Square filled, Square ignore) const;
  bool isPawnDropMate(const Move& move) const;
  bool pawnExists(Color color, int file) const;

  std::array<Piece, SQUARE_COUNT> board_;
  std::array<std::array<int, PIECE_TYPE_COUNT>, 2> hands_;
  Color color_;
};

}  // namespace shogi
