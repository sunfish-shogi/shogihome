#include "tt.h"

#include <algorithm>

#include "search.h"

namespace shogi {
namespace basic {

void TranspositionTable::resize(std::size_t megabytes) {
  const std::size_t bytes = std::max<std::size_t>(megabytes, 1) * 1024 * 1024;
  std::size_t count = 1;
  while (count * 2 * sizeof(TTEntry) <= bytes) {
    count *= 2;
  }
  if (count == entries_.size()) {
    return;
  }
  entries_.assign(count, TTEntry());
  mask_ = count - 1;
}

void TranspositionTable::clear() {
  std::fill(entries_.begin(), entries_.end(), TTEntry());
  generation_ = 0;
}

const TTEntry* TranspositionTable::probe(HashKey key) const {
  if (entries_.empty()) {
    return nullptr;
  }
  const TTEntry& entry = entries_[key & mask_];
  if (entry.bound == BOUND_NONE || entry.key != key) {
    return nullptr;
  }
  return &entry;
}

void TranspositionTable::store(HashKey key, const Move& move, int score, int depth, Bound bound) {
  if (entries_.empty()) {
    return;
  }
  TTEntry& entry = entries_[key & mask_];
  // 別の局面が入っている場合は、古い世代か浅い結果のときだけ置き換える。
  // 同じ局面なら、より深い結果で上書きする。
  const bool sameKey = entry.key == key;
  const bool replaceable =
      entry.bound == BOUND_NONE || entry.generation != generation_ || depth >= entry.depth;
  if (!sameKey && !replaceable) {
    return;
  }
  if (sameKey && entry.bound != BOUND_NONE && depth < entry.depth &&
      entry.generation == generation_) {
    // 既により深い結果があるなら、指し手だけは新しい方を残す価値がないので何もしない。
    return;
  }
  entry.key = key;
  entry.score = score;
  entry.depth = depth;
  entry.bound = bound;
  entry.generation = generation_;
  // 指し手が空の場合 (α を一度も更新できなかった場合) は、以前の指し手を残す。
  if (move.to != SQ_NONE || !sameKey) {
    entry.move = move;
  }
}

int scoreToTT(int score, int ply) {
  if (score >= MATE_THRESHOLD) {
    return score + ply;
  }
  if (score <= -MATE_THRESHOLD) {
    return score - ply;
  }
  return score;
}

int scoreFromTT(int score, int ply) {
  if (score >= MATE_THRESHOLD) {
    return score - ply;
  }
  if (score <= -MATE_THRESHOLD) {
    return score + ply;
  }
  return score;
}

}  // namespace basic
}  // namespace shogi
