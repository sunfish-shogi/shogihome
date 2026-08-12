// src/renderer/players/basic.ts の Evaluator を移植したもの。
#pragma once

#include "core/position.h"
#include "core/types.h"

namespace shogi {
namespace basic {

enum Style : int {
  STYLE_STATIC_ROOK = 0,
  STYLE_RANGING_ROOK,
  STYLE_RANDOM,
};

// 駒の価値。basic.ts の pieceValues と同じ。
extern const int PIECE_VALUES[PIECE_TYPE_COUNT];

// 指し手 1 手分の評価値を返す。局面ではなく「指し手の差分」を評価する点に注意。
int evaluateMove(Style style, const Position& position, const Move& move);

}  // namespace basic
}  // namespace shogi
