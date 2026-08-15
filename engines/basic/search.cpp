#include "search.h"

#include <algorithm>
#include <limits>

namespace shogi {
namespace basic {

namespace {

constexpr int INFINITE_SCORE = MATE_SCORE * 2;
// 静止探索の最大深さ。取り合いが続く局面で無限に深くならないようにする。
constexpr int MAX_QUIESCENCE_PLY = 8;
// 探索木の最大深さ。PV の保持に使う。
// PV テーブルは MAX_PLY^2 の配列になるため、WebAssembly の既定スタックに収まる大きさにする。
constexpr int MAX_PLY = 24;
// 根で最善手を選ぶときに加える乱数の上限。同じ対局が続くのを避けるため。
// 落とし穴法の 1 マスあたりの差 (3〜17) を埋めてしまわない大きさにする。
constexpr int JITTER_RANGE = 3;
// 千日手になる手に与える罰点。
constexpr int REPETITION_PENALTY = 1000;

struct Context {
  Style style = STYLE_STATIC_ROOK;
  long long nodes = 0;
  SearchLimits limits;
  bool aborted = false;
  // 時刻の確認は頻繁に行うと重いので、一定ノード数ごとに行う。
  int checkCounter = 0;
  // 三角配列による PV の保持。
  Move pv[MAX_PLY][MAX_PLY];
  int pvLength[MAX_PLY] = {};

  bool checkLimits() {
    if (aborted) {
      return true;
    }
    if (nodes >= limits.nodeLimit) {
      aborted = true;
      return true;
    }
    if (--checkCounter <= 0) {
      checkCounter = 2048;
      if (std::chrono::steady_clock::now() >= limits.deadline) {
        aborted = true;
        return true;
      }
    }
    return false;
  }
};

// 駒を取る手・成る手を先に調べることで α-β の枝刈りが効きやすくなる。
void orderMoves(std::vector<Move>& moves) {
  std::stable_sort(moves.begin(), moves.end(), [](const Move& a, const Move& b) {
    return materialDelta(a) > materialDelta(b);
  });
}

// ply は根からの手数 (PV の添字)、qply は静止探索に入ってからの手数。
int quiescence(Context& context, Position& position, int alpha, int beta, int ply, int qply) {
  if (context.checkLimits()) {
    return 0;
  }
  context.pvLength[ply] = 0;
  if (ply >= MAX_PLY - 1) {
    return evaluatePosition(context.style, position);
  }

  const bool inCheck = position.inCheck(position.color());
  if (!inCheck) {
    // 何もしない場合の評価値 (stand pat) を下限とする。
    const int standPat = evaluatePosition(context.style, position);
    if (standPat >= beta) {
      return beta;
    }
    if (standPat > alpha) {
      alpha = standPat;
    }
  }
  if (qply >= MAX_QUIESCENCE_PLY) {
    return evaluatePosition(context.style, position);
  }

  // 王手されている場合は取る手に限らず全ての手を調べる。
  std::vector<Move> moves = inCheck ? position.listMoves() : position.listCaptures();
  orderMoves(moves);

  bool hasLegalMove = false;
  for (const Move& move : moves) {
    if (!position.doMove(move)) {
      continue;
    }
    context.nodes++;
    hasLegalMove = true;
    const int score = -quiescence(context, position, -beta, -alpha, ply + 1, qply + 1);
    position.undoMove(move);
    if (context.aborted) {
      return 0;
    }
    if (score >= beta) {
      return beta;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  if (inCheck && !hasLegalMove) {
    // 詰み。
    return -MATE_SCORE + ply;
  }
  return alpha;
}

int negamax(Context& context, Position& position, int depth, int alpha, int beta, int ply) {
  if (context.checkLimits()) {
    return 0;
  }
  context.pvLength[ply] = 0;
  if (depth <= 0 || ply >= MAX_PLY - 1) {
    return quiescence(context, position, alpha, beta, ply, 0);
  }

  std::vector<Move> moves = position.listMoves();
  orderMoves(moves);

  bool hasLegalMove = false;
  for (const Move& move : moves) {
    if (!position.doMove(move)) {
      continue;
    }
    context.nodes++;
    hasLegalMove = true;
    const int score = -negamax(context, position, depth - 1, -beta, -alpha, ply + 1);
    position.undoMove(move);
    if (context.aborted) {
      return 0;
    }
    if (score >= beta) {
      return beta;
    }
    if (score > alpha) {
      alpha = score;
      // この手を先頭に、子の PV を連結する。
      context.pv[ply][0] = move;
      for (int i = 0; i < context.pvLength[ply + 1]; i++) {
        context.pv[ply][i + 1] = context.pv[ply + 1][i];
      }
      context.pvLength[ply] = context.pvLength[ply + 1] + 1;
    }
  }

  if (!hasLegalMove) {
    // 合法手が無い局面は負け。手数が短いほど大きな絶対値にする。
    return -MATE_SCORE + ply;
  }
  return alpha;
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

}  // namespace

SearchResult search(Style style, const Position& position,
                    const std::vector<std::string>& historyKeys, int depth,
                    const SearchLimits& limits, std::mt19937& rng) {
  SearchResult result;
  result.depth = depth;

  Position working = position;
  Context context;
  context.style = style;
  context.limits = limits;

  std::vector<Move> moves = working.listMoves();
  orderMoves(moves);

  std::uniform_int_distribution<int> jitter(0, JITTER_RANGE);
  int bestScore = -INFINITE_SCORE;
  int bestJittered = -INFINITE_SCORE;

  for (const Move& move : moves) {
    if (!working.doMove(move)) {
      continue;
    }
    context.nodes++;

    int score;
    if (countKey(historyKeys, working.key()) >= 1) {
      // 相手番かつ迂回経路で千日手になる可能性があるので1回でも出現してたら回避する。
      score = -REPETITION_PENALTY;
      context.pvLength[1] = 0;
    } else {
      // 乱数の分だけ余裕を持たせた窓で探索する。これを下回る手は選ばれ得ない。
      const int alpha = bestScore == -INFINITE_SCORE ? -INFINITE_SCORE : bestScore - JITTER_RANGE;
      score = -negamax(context, working, depth - 1, -INFINITE_SCORE, -alpha, 1);
    }
    working.undoMove(move);
    if (context.aborted) {
      result.aborted = true;
      break;
    }

    // 詰みの評価値は 1 手あたり 1 しか差が無いため、乱数を加えると手数の短い詰みを
    // 取り逃がす。詰みが絡む手はそのまま比較する。
    const bool mateScore = score >= MATE_THRESHOLD || score <= -MATE_THRESHOLD;
    const int jittered = mateScore ? score : score + jitter(rng);
    if (!result.found || jittered > bestJittered) {
      result.found = true;
      result.move = move;
      result.score = score;
      bestJittered = jittered;
      bestScore = std::max(bestScore, score);
      result.pv.clear();
      result.pv.push_back(move);
      for (int i = 0; i < context.pvLength[1]; i++) {
        result.pv.push_back(context.pv[1][i]);
      }
    }
  }

  result.nodes = context.nodes;
  return result;
}

SearchResult searchRandom(const Position& position, std::mt19937& rng) {
  SearchResult result;
  std::vector<Move> moves = position.listMoves();
  result.nodes = static_cast<long long>(moves.size());
  std::uniform_real_distribution<double> unit(0.0, 1.0);
  for (size_t range = moves.size(); range > 0; range--) {
    size_t index = static_cast<size_t>(unit(rng) * static_cast<double>(range));
    if (index >= range) {
      index = range - 1;
    }
    const Move move = moves[index];
    if (position.isValidMove(move)) {
      result.found = true;
      result.move = move;
      result.pv.push_back(move);
      return result;
    }
    moves[index] = moves[range - 1];
  }
  return result;
}

}  // namespace basic
}  // namespace shogi
