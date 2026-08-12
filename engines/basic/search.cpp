#include "search.h"

#include <algorithm>
#include <limits>

namespace shogi {
namespace basic {

namespace {

int seeSearch(int baseScore, const std::vector<PieceType>& myPieces, size_t myIndex,
              const std::vector<PieceType>& enemyPieces, size_t enemyIndex) {
  if (myIndex >= myPieces.size()) {
    return 0;
  }
  const PieceType target = enemyPieces[enemyIndex];
  int score = baseScore + PIECE_VALUES[target] + PIECE_VALUES[unpromotedPieceType(target)];
  if (score <= 0) {
    return 0;
  }
  score -= seeSearch(-score, enemyPieces, enemyIndex + 1, myPieces, myIndex);
  return std::max(score, 0);
}

// 指定したマスにおける駒の取り合いを評価する。手番側から見た利得を返す。
int staticExchangeEvaluation(const Position& position, Square to) {
  const Piece targetPiece = position.at(to);
  if (isEmpty(targetPiece)) {
    return 0;
  }
  std::vector<PieceType> myPieces;
  std::vector<PieceType> enemyPieces;
  enemyPieces.push_back(typeOf(targetPiece));
  for (const Square from : position.listAttackers(to)) {
    const Piece piece = position.at(from);
    if (colorOf(piece) == position.color()) {
      myPieces.push_back(typeOf(piece));
    } else {
      enemyPieces.push_back(typeOf(piece));
    }
  }
  const auto byValue = [](PieceType a, PieceType b) {
    return PIECE_VALUES[a] < PIECE_VALUES[b];
  };
  std::stable_sort(myPieces.begin(), myPieces.end(), byValue);
  std::stable_sort(enemyPieces.begin(), enemyPieces.end(), byValue);
  return seeSearch(0, myPieces, 0, enemyPieces, 0);
}

size_t countKey(const std::vector<std::string>& keys, const std::string& key) {
  size_t count = 0;
  for (const std::string& k : keys) {
    if (k == key) {
      count++;
    }
  }
  return count;
}

struct SearchContext {
  Style style;
  std::mt19937* rng;
  long long nodes = 0;
};

// basic.ts の BasicPlayer#search と同じ手順。
// historyKeys は根でのみ参照し、再帰では千日手判定を行わない。
bool searchImpl(SearchContext& context, Position& position, int depth,
                const std::vector<std::string>* historyKeys, Move* bestMove, double* bestScore,
                int* bestRawScore) {
  const std::vector<Move> moves = position.listMoves();
  std::uniform_real_distribution<double> jitter(0.0, 10.0);
  bool found = false;
  double best = -std::numeric_limits<double>::infinity();
  for (const Move& move : moves) {
    double score = evaluateMove(context.style, position, move);
    if (!position.doMove(move)) {
      continue;
    }
    context.nodes++;
    if (historyKeys != nullptr && countKey(*historyKeys, position.key()) >= 1) {
      // 相手番かつ迂回経路で千日手になる可能性があるので1回でも出現してたら回避する。
      score -= 1000;
    } else if (depth > 1) {
      Move childMove;
      double childScore = 0;
      int childRawScore = 0;
      if (searchImpl(context, position, depth - 1, nullptr, &childMove, &childScore,
                     &childRawScore)) {
        score -= childScore;
      }
    } else {
      score -= staticExchangeEvaluation(position, move.to);
    }
    position.undoMove(move);
    const double raw = score;
    score += jitter(*context.rng);
    if (score > best) {
      best = score;
      *bestMove = move;
      *bestRawScore = static_cast<int>(raw);
      found = true;
    }
  }
  *bestScore = found ? best : 0;
  return found;
}

}  // namespace

SearchResult search(Style style, const Position& position,
                    const std::vector<std::string>& historyKeys, std::mt19937& rng) {
  SearchResult result;
  Position working = position;
  SearchContext context;
  context.style = style;
  context.rng = &rng;
  double bestScore = 0;
  result.found = searchImpl(context, working, 2, &historyKeys, &result.move, &bestScore,
                            &result.score);
  result.nodes = context.nodes;
  if (!result.found) {
    result.score = 0;
  }
  return result;
}

SearchResult searchRandom(const Position& position, std::mt19937& rng) {
  SearchResult result;
  std::vector<Move> moves = position.listMoves();
  result.nodes = static_cast<long long>(moves.size());
  std::uniform_real_distribution<double> unit(0.0, 1.0);
  for (size_t range = moves.size(); range > 0; range--) {
    const size_t index = static_cast<size_t>(unit(rng) * static_cast<double>(range));
    const Move move = moves[index < range ? index : range - 1];
    if (position.isValidMove(move)) {
      result.found = true;
      result.move = move;
      return result;
    }
    moves[index < range ? index : range - 1] = moves[range - 1];
  }
  return result;
}

}  // namespace basic
}  // namespace shogi
