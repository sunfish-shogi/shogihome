// 落とし穴法 (piece square table) による位置評価。
//
// 駒の種類ごとに 9x9 のテーブルを持ち、理想位置に近いほど高い値を与えることで駒組を誘導する。
// テーブルは全て先手視点で定義しており、後手の駒は 180 度回転したマスで参照する。
// 居飛車と振り飛車で左右の使い分けが逆になるため、玉・飛・角・金・銀は戦型ごとに別のテーブルを持つ。
#pragma once

#include "core/types.h"
#include "style.h"

namespace shogi {
namespace basic {

// 先手視点のマスに対する位置評価値を返す。後手の駒は呼び出し側で oppositeSquare() を適用すること。
int pieceSquareValue(Style style, PieceType type, Square square);

}  // namespace basic
}  // namespace shogi
