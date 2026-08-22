// α-β 探索と静止探索。
//
// 反復深化の 1 反復ぶんを 1 回の呼び出しで行う。エンジンはこれを専用のスレッドから
// 繰り返し呼ぶ。探索の外から打ち切るには SearchLimits::stop を立てる。
#pragma once

#include <atomic>
#include <chrono>
#include <random>
#include <string>
#include <vector>

#include "core/position.h"
#include "evaluate.h"
#include "style.h"
#include "tt.h"

namespace shogi {
namespace basic {

// 詰みの評価値。手数が浅いほど大きくなるように ply を引いて使う。
constexpr int MATE_SCORE = 30000;
// 詰みとみなす評価値の閾値。
constexpr int MATE_THRESHOLD = MATE_SCORE - 1000;

struct SearchResult {
  bool found = false;
  Move move;
  int score = 0;
  int depth = 0;
  long long nodes = 0;
  std::vector<Move> pv;
  // 打ち切りにより結果が信頼できない場合に true。
  bool aborted = false;
};

struct SearchLimits {
  // 探索を打ち切る時刻。
  std::chrono::steady_clock::time_point deadline;
  // 探索を打ち切るノード数。
  long long nodeLimit = 3000000;
  // 探索スレッドの外から探索を打ち切るためのフラグ。
  // stop コマンドを受け取ったときに立てる。nullptr なら打ち切りを見ない。
  const std::atomic<bool>* stop = nullptr;
};

// 指定した深さで探索する。historyKeys は初期局面から現局面までの局面キー (千日手回避に使う)。
//
// randomize が true のとき、根の評価値に乱数を加えて同じ対局が続くのを避ける。
// false にすると探索が決定的になり、ノード数が局面と深さだけで決まる。
// 乱数は根の窓 (alpha) にも影響するため、探索するノード数そのものが変わる。
// 改良の効果をノード数で測るときは false にすること。
SearchResult search(Style style, const Position& position,
                    const std::vector<std::string>& historyKeys, int depth,
                    const SearchLimits& limits, std::mt19937& rng, bool randomize = true,
                    TranspositionTable* tt = nullptr);

// 合法手の中から一様ランダムに 1 手選ぶ。
SearchResult searchRandom(const Position& position, std::mt19937& rng);

}  // namespace basic
}  // namespace shogi
