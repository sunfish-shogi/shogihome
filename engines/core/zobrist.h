// 局面を 64bit のキーに落とす Zobrist ハッシュ。
//
// 置換表のキーと千日手の判定に使う。doMove / undoMove の中で差分更新するので、
// 局面ごとにキーを作り直す必要が無い (XOR は自己逆元なので undo も同じ操作でよい)。
//
// 乱数表は固定シードで初期化する。実行のたびにキーが変わると、
// 同じ入力に対する探索が再現しなくなりベンチマークの比較ができなくなるため。
#pragma once

#include <cstdint>

#include "types.h"

namespace shogi {

using HashKey = std::uint64_t;

// 持ち駒の最大数 (歩の 18 枚)。
constexpr int MAX_HAND_COUNT = 18;

namespace zobrist {

// 盤上の駒。piece は makePiece() が返す値をそのまま添字にする。
extern HashKey PIECE[PIECE_COUNT][SQUARE_COUNT];
// 持ち駒。枚数ごとに別の値を持たせ、増減のたびに前後の値を XOR して差し替える。
extern HashKey HAND[2][PIECE_TYPE_COUNT][MAX_HAND_COUNT + 1];
// 手番。後手番のときに XOR する。
extern HashKey SIDE;

// 乱数表を初期化する。プロセス内で 1 回だけ行えばよい (2 回目以降は何もしない)。
void initialize();

}  // namespace zobrist
}  // namespace shogi
