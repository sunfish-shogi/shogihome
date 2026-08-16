#include "zobrist.h"

#include <random>

namespace shogi {
namespace zobrist {

HashKey PIECE[PIECE_COUNT][SQUARE_COUNT];
HashKey HAND[2][PIECE_TYPE_COUNT][MAX_HAND_COUNT + 1];
HashKey SIDE;

void initialize() {
  static bool initialized = false;
  if (initialized) {
    return;
  }
  initialized = true;

  // 固定シード。実行のたびに変わると探索が再現しなくなる。
  std::mt19937_64 rng(20260815);
  std::uniform_int_distribution<HashKey> dist;

  for (int piece = 0; piece < PIECE_COUNT; piece++) {
    for (Square square = 0; square < SQUARE_COUNT; square++) {
      // 空マスは XOR しないので値を持たせない。
      PIECE[piece][square] = piece == NO_PIECE ? 0 : dist(rng);
    }
  }
  for (int color = 0; color < 2; color++) {
    for (int type = 0; type < PIECE_TYPE_COUNT; type++) {
      for (int count = 0; count <= MAX_HAND_COUNT; count++) {
        // 0 枚は「持っていない」状態なので XOR しない。
        HAND[color][type][count] = count == 0 ? 0 : dist(rng);
      }
    }
  }
  SIDE = dist(rng);
}

}  // namespace zobrist
}  // namespace shogi
