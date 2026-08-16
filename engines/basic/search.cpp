#include "search.h"

#include <algorithm>
#include <limits>
#include <utility>

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
// null move pruning で減らす深さ。
constexpr int NULL_MOVE_REDUCTION = 2;
// 各深さで覚えておく killer move の数。
constexpr int KILLER_COUNT = 2;

// 指し手の並べ替えに使う点数。駒の価値 (最大 1500、取ると 2 倍で 3000) より
// 十分大きな間隔を空けて、種別の順序が駒割で逆転しないようにする。
constexpr int ORDER_HINT = 1000000;
constexpr int ORDER_CAPTURE = 100000;
constexpr int ORDER_KILLER = 10000;

struct Context {
  Style style = STYLE_STATIC_ROOK;
  long long nodes = 0;
  SearchLimits limits;
  bool aborted = false;
  TranspositionTable* tt = nullptr;
  // 時刻の確認は頻繁に行うと重いので、一定ノード数ごとに行う。
  int checkCounter = 0;
  // 三角配列による PV の保持。
  Move pv[MAX_PLY][MAX_PLY];
  int pvLength[MAX_PLY] = {};
  // killer move。同じ深さで β 遮断を起こした「駒を取らない手」を覚えておく。
  // 兄弟ノードでも同じ手が有効なことが多いので、次に調べるときは先に試す。
  Move killers[MAX_PLY][KILLER_COUNT];

  // β 遮断を起こした手を記録する。駒を取る手は元々先に調べるので対象外。
  void recordKiller(const Move& move, int ply) {
    if (move.capturedPieceType != NO_PIECE_TYPE || ply >= MAX_PLY) {
      return;
    }
    if (killers[ply][0] == move) {
      return;
    }
    for (int i = KILLER_COUNT - 1; i > 0; i--) {
      killers[ply][i] = killers[ply][i - 1];
    }
    killers[ply][0] = move;
  }

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

// 指し手の優先度。大きいほど先に調べる。
//   1. 置換表の手 (前回の探索で最善だった手)
//   2. 駒を取る手・成る手 (駒割の大きい順)
//   3. killer move (同じ深さで β 遮断を起こした手)
//   4. それ以外
int moveOrderScore(const Move& move, const Move& hint, const Move* killers) {
  if (hint.to != SQ_NONE && move == hint) {
    return ORDER_HINT;
  }
  const int delta = materialDelta(move);
  if (delta > 0) {
    return ORDER_CAPTURE + delta;
  }
  if (killers != nullptr) {
    for (int i = 0; i < KILLER_COUNT; i++) {
      if (killers[i].to != SQ_NONE && move == killers[i]) {
        // 先に覚えた方をより優先する。
        return ORDER_KILLER - i;
      }
    }
  }
  return delta;
}

// 優先度の降順に並べ替える。安定ソートなので同じ点数の手の順序は変わらない。
// 点数は比較のたびに計算すると O(n log n) 回になるので、先に求めておく。
void orderMoves(std::vector<Move>& moves, const Move& hint = Move(),
                const Move* killers = nullptr) {
  std::vector<std::pair<int, Move>> scored;
  scored.reserve(moves.size());
  for (const Move& move : moves) {
    scored.emplace_back(moveOrderScore(move, hint, killers), move);
  }
  std::stable_sort(scored.begin(), scored.end(),
                   [](const auto& a, const auto& b) { return a.first > b.first; });
  for (size_t i = 0; i < scored.size(); i++) {
    moves[i] = scored[i].second;
  }
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

  // 置換表を引く。深さが足りていれば探索そのものを省ける。
  const HashKey key = position.hashKey();
  Move hint;
  if (context.tt != nullptr) {
    const TTEntry* entry = context.tt->probe(key);
    if (entry != nullptr) {
      hint = entry->move;
      if (entry->depth >= depth) {
        const int score = scoreFromTT(entry->score, ply);
        // fail-hard に合わせて窓の内側へ丸めて返す。
        if (entry->bound == BOUND_EXACT) {
          return std::clamp(score, alpha, beta);
        }
        if (entry->bound == BOUND_LOWER && score >= beta) {
          return beta;
        }
        if (entry->bound == BOUND_UPPER && score <= alpha) {
          return alpha;
        }
      }
    }
  }

  const bool inCheck = position.inCheck(position.color());

  // null move pruning。
  // 「1 手パスしても β 以上」なら、実際に指せばもっと良くなるはずなので枝を捨てる。
  // 将棋は手番を渡すこと自体が損になる局面 (Zugzwang) が稀なので比較的安全だが、
  // 次の場合は使えない。
  //   - 王手されている: パスすると玉を取られる手順を読んでしまう
  //   - β が詰みの評価値: 詰みの有無をパスで判定してはいけない
  //   - 深さが足りない: 減らした後に残りが無いと意味が無い
  if (depth >= NULL_MOVE_REDUCTION + 1 && !inCheck && beta < MATE_THRESHOLD) {
    position.doNullMove();
    context.nodes++;
    // β 周りの幅 1 の窓で十分 (β 以上かどうかだけが知りたい)。
    const int score =
        -negamax(context, position, depth - 1 - NULL_MOVE_REDUCTION, -beta, -beta + 1, ply + 1);
    position.undoNullMove();
    if (context.aborted) {
      return 0;
    }
    if (score >= beta) {
      return beta;
    }
  }

  std::vector<Move> moves = position.listMoves();
  orderMoves(moves, hint, context.killers[ply]);

  bool hasLegalMove = false;
  Move bestMove;
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
      // 駒を取らない手で遮断できたなら、兄弟ノードでも有効な可能性が高い。
      context.recordKiller(move, ply);
      // β 以上であることしか分からない (真の値はもっと大きいかもしれない)。
      if (context.tt != nullptr) {
        context.tt->store(key, move, scoreToTT(beta, ply), depth, BOUND_LOWER);
      }
      return beta;
    }
    if (score > alpha) {
      alpha = score;
      bestMove = move;
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
  if (context.tt != nullptr) {
    // α を更新できた場合は正確な値、できなかった場合は上界。
    const Bound bound = bestMove.to != SQ_NONE ? BOUND_EXACT : BOUND_UPPER;
    context.tt->store(key, bestMove, scoreToTT(alpha, ply), depth, bound);
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
                    const SearchLimits& limits, std::mt19937& rng, bool randomize,
                    TranspositionTable* tt) {
  SearchResult result;
  result.depth = depth;

  Position working = position;
  Context context;
  context.style = style;
  context.limits = limits;
  context.tt = tt;

  const HashKey rootKey = working.hashKey();
  std::vector<Move> moves = working.listMoves();
  // 反復深化では前の深さの最善手が置換表に入っている。それを先に調べる。
  const TTEntry* rootEntry = tt != nullptr ? tt->probe(rootKey) : nullptr;
  orderMoves(moves, rootEntry != nullptr ? rootEntry->move : Move());

  const int jitterRange = randomize ? JITTER_RANGE : 0;
  std::uniform_int_distribution<int> jitter(0, jitterRange);
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
      const int alpha = bestScore == -INFINITE_SCORE ? -INFINITE_SCORE : bestScore - jitterRange;
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

  // 置換表で枝刈りした枝は三角配列に読み筋が残らないため、読み筋が途中で切れる。
  // 足りないぶんを置換表から辿って補い、表示される読み筋が短くならないようにする。
  if (tt != nullptr && result.found) {
    Position walk = position;
    bool ok = true;
    for (const Move& move : result.pv) {
      if (!walk.doMove(move)) {
        ok = false;
        break;
      }
    }
    // 深さのぶんまで伸ばす。千日手で無限に辿らないよう回数で打ち切る。
    while (ok && static_cast<int>(result.pv.size()) < depth) {
      const TTEntry* entry = tt->probe(walk.hashKey());
      if (entry == nullptr || entry->move.to == SQ_NONE || !walk.doMove(entry->move)) {
        break;
      }
      result.pv.push_back(entry->move);
    }
  }

  // 次の反復のために根の最善手を記録する。
  // 打ち切られた場合の結果は信頼できないので入れない。
  //
  // 深さは -1 で記録する。根の評価値は正確とは限らないためで、
  // 窓を bestScore で絞って探索した手は「これ以下」としか分かっていないし、
  // 乱数を加えて選んだ場合はその手が最善だとも限らない。
  // negamax が引くのは depth >= 1 のときだけなので、-1 なら枝刈りには使われず、
  // 指し手順序付けのヒントとしてだけ働く。
  if (tt != nullptr && result.found && !result.aborted) {
    tt->store(rootKey, result.move, scoreToTT(result.score, 0), -1, BOUND_EXACT);
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
