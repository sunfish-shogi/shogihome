// 局面の評価。駒割 (材料) と落とし穴法による位置評価の和で表す。
#pragma once

#include "core/position.h"
#include "core/types.h"
#include "style.h"

namespace shogi {
namespace basic {

// 駒の価値。盤上の駒に用いる。
extern const int PIECE_VALUES[PIECE_TYPE_COUNT];

// 持ち駒に上乗せする点数。持ち駒はどのマスにも打てるぶん盤上の駒より働きが広いので、
// 同じ駒でも少しだけ高く見積もる。これが無いと、打っても打たなくても評価値が変わらず、
// 取ったばかりの駒を目先の位置評価のために無駄打ちしてしまう。
// 位置評価 (1 マスあたり最大 30) の半分に留め、駒の損得を覆さない大きさにする。
constexpr int HAND_BONUS = 15;

// 持ち駒 1 枚の価値。
inline int handValue(PieceType type) {
  return PIECE_VALUES[type] + HAND_BONUS;
}

// 手番側から見た局面の評価値を返す。末端局面で呼ぶ。
int evaluatePosition(Style style, const Position& position);

// 指し手による駒の損得 (手番側から見た増分)。指し手の並べ替えにのみ使う。
// 位置評価は末端局面でまとめて行うため、ここには含めない。
int materialDelta(const Move& move);

}  // namespace basic
}  // namespace shogi
