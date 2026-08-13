// 局面の評価。駒割 (材料) と落とし穴法による位置評価の和で表す。
#pragma once

#include "core/position.h"
#include "core/types.h"
#include "style.h"

namespace shogi {
namespace basic {

// 駒の価値。盤上・持ち駒のどちらにも同じ値を用いる。
extern const int PIECE_VALUES[PIECE_TYPE_COUNT];

// 手番側から見た局面の評価値を返す。末端局面で呼ぶ。
int evaluatePosition(Style style, const Position& position);

// 指し手による駒の損得 (手番側から見た増分)。指し手の並べ替えにのみ使う。
// 位置評価は末端局面でまとめて行うため、ここには含めない。
int materialDelta(const Move& move);

}  // namespace basic
}  // namespace shogi
