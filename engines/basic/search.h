// src/renderer/players/basic.ts の探索部を移植したもの。
// α-β 枝刈りも置換表も持たない深さ 2 の全幅探索で、評価は「指し手の差分」で行う。
#pragma once

#include <random>
#include <string>
#include <vector>

#include "core/position.h"
#include "evaluate.h"

namespace shogi {
namespace basic {

struct SearchResult {
  bool found = false;
  Move move;
  int score = 0;        // 乱数によるタイブレークを除いた評価値
  long long nodes = 0;  // doMove に成功した回数
};

// 深さ 2 の探索を行う。historyKeys は初期局面から現局面までの局面キー (千日手回避に使う)。
SearchResult search(Style style, const Position& position,
                    const std::vector<std::string>& historyKeys, std::mt19937& rng);

// 合法手の中から一様ランダムに 1 手選ぶ。
SearchResult searchRandom(const Position& position, std::mt19937& rng);

}  // namespace basic
}  // namespace shogi
