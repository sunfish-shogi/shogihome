// 置換表。同じ局面に別の経路で到達したときに、探索結果を再利用する。
//
// 得られるものは 2 つある。
//   1. 深さが足りていれば探索そのものを省ける
//   2. 省けない場合でも、前回の最善手を先に調べられる (指し手順序付けの改善)
// 実際の効きは 2 の方が大きいことも多い。
#pragma once

#include <cstddef>
#include <vector>

#include "core/types.h"
#include "core/zobrist.h"

namespace shogi {
namespace basic {

// 記録した評価値がどういう意味を持つか。
enum Bound : int {
  // 未使用のエントリ。
  BOUND_NONE = 0,
  // 上界。真の評価値はこれ以下 (α を超えられなかった)。
  BOUND_UPPER,
  // 下界。真の評価値はこれ以上 (β 以上で打ち切った)。
  BOUND_LOWER,
  // 正確な値。
  BOUND_EXACT,
};

struct TTEntry {
  HashKey key = 0;
  // この局面で最善だった手。深さが足りなくても指し手順序付けに使える。
  Move move;
  int score = 0;
  // この評価値を得たときの残り深さ。
  int depth = -1;
  Bound bound = BOUND_NONE;
  // 何回目の探索で書き込まれたか。古い世代のエントリを優先的に潰すために使う。
  int generation = 0;
};

class TranspositionTable {
 public:
  // 表の大きさを設定する (メガバイト単位)。エントリ数は 2 の冪に丸める。
  // 大きさが変わらない場合は中身を保持する。
  void resize(std::size_t megabytes);
  // 全てのエントリを捨てる。対局の開始時に呼ぶ。
  void clear();
  // 世代を進める。以前の探索のエントリは残しつつ、置き換えの対象になりやすくする。
  void newSearch() {
    generation_++;
  }

  // 該当するエントリを返す。見つからない場合は nullptr。
  const TTEntry* probe(HashKey key) const;
  void store(HashKey key, const Move& move, int score, int depth, Bound bound);

  std::size_t entryCount() const {
    return entries_.size();
  }

 private:
  std::vector<TTEntry> entries_;
  std::size_t mask_ = 0;
  int generation_ = 0;
};

// 詰みの評価値は「根から何手で詰むか」で表しているため、そのまま記録すると
// 別の深さで引いたときに手数がずれる。記録時は「この局面から何手で詰むか」に直し、
// 取り出すときに根からの手数へ戻す。
int scoreToTT(int score, int ply);
int scoreFromTT(int score, int ply);

}  // namespace basic
}  // namespace shogi
