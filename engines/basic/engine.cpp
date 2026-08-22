#include "engine.h"

#include <algorithm>

namespace shogi {
namespace basic {

namespace {

long long elapsedMs(std::chrono::steady_clock::time_point since) {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now() - since)
      .count();
}

// 持ち時間から 1 手に使う時間の上限を決める。
constexpr long long MIN_BUDGET_MS = 100;
constexpr long long MAX_BUDGET_MS = 3000;
constexpr long long INFINITE_BUDGET_MS = 10000;

}  // namespace

BasicEngine::BasicEngine() : rng_(std::random_device{}()) {}

BasicEngine::~BasicEngine() {
  // 探索スレッドを残したまま壊すと未定義動作になる。
  quitFlag_.store(true);
  joinSearch();
}

std::string BasicEngine::name() const {
  // 1 つのバイナリで Depth 1〜5 を賄うため、名前に強さを含めない。
  // 強さの区別はマニフェストのプリセット (Level 2 / Level 3) が持つ。
  return "ShogiHome Basic Engine";
}

std::string BasicEngine::author() const {
  return "Kubo, Ryosuke";
}

std::vector<std::string> BasicEngine::optionDefinitions() const {
  return {
      "option name Style type combo default static_rook"
      " var static_rook var ranging_rook var random",
      "option name Depth type spin default 3 min 1 max 5",
      "option name MinimumThinkingTime type spin default 500 min 0 max 60000",
      // 置換表の大きさ (MB)。ブラウザで動かすので上限は控えめにする。
      "option name USI_Hash type spin default 16 min 1 max 256",
      // 無効にすると探索が決定的になる。ベンチマークで改良の効果を測るときに使う。
      "option name Randomize type check default true",
      // 本エンジンは先読みに対応しない。
      "option name USI_Ponder type check default false",
  };
}

void BasicEngine::setOption(const std::string& name, const std::string& value) {
  if (name == "Style") {
    parseStyle(value, &style_);
  } else if (name == "Depth") {
    // 不正な値は無視する。try/catch を使ってはならない (usi.h の parseInteger を参照)。
    long long parsed = 0;
    if (parseInteger(value, &parsed)) {
      maxDepth_ = static_cast<int>(std::clamp(parsed, 1LL, 5LL));
    }
  } else if (name == "MinimumThinkingTime") {
    long long parsed = 0;
    if (parseInteger(value, &parsed)) {
      minimumThinkingTimeMs_ = std::max(0LL, parsed);
    }
  } else if (name == "Randomize") {
    randomize_ = value == "true";
  } else if (name == "USI_Hash") {
    long long parsed = 0;
    if (parseInteger(value, &parsed)) {
      hashSizeMB_ = static_cast<std::size_t>(std::clamp(parsed, 1LL, 256LL));
    }
  }
}

void BasicEngine::prepare() {
  // isready への応答前に確保する。オプションの変更を反映させるため毎回呼ぶ。
  tt_.resize(hashSizeMB_);
}

void BasicEngine::newGame() {
  // 対局をまたいで探索が残らないようにする。
  joinSearch();
  pendingBestMove_.clear();
  // 前の対局の結果を引きずらないようにする。
  tt_.clear();
}

long long BasicEngine::computeBudgetMs(const GoParams& params) const {
  if (params.infinite || params.ponder) {
    return INFINITE_BUDGET_MS;
  }
  const bool black = position_.color() == BLACK;
  const long long remain = black ? params.btime : params.wtime;
  const long long increment = black ? params.binc : params.winc;
  long long budget;
  if (params.byoyomi > 0) {
    budget = params.byoyomi * 4 / 5;
  } else if (increment > 0) {
    budget = increment * 4 / 5;
  } else {
    budget = remain / 40;
  }
  budget = std::clamp(budget, MIN_BUDGET_MS, MAX_BUDGET_MS);
  // MIN_BUDGET_MS の下限が持ち時間を超えることがあるので、実際に使える時間で頭打ちにする。
  // 秒読みと加算は持ち時間を使い切った後も使えるため、残り時間に足して考える
  // (ShogiHome は加算ぶんを引いた btime を送ってくるので、ここで足し戻す)。
  // 両方が同時に指定されることは無い。
  const long long available =
      std::max(0LL, remain) + std::max(0LL, params.byoyomi) + std::max(0LL, increment);
  return std::min(budget, available);
}

void BasicEngine::go(const Position& position, const std::vector<std::string>& historyKeys,
                     const GoParams& params) {
  if (params.mate) {
    // 詰み探索には対応しない。
    usiOutput("checkmate notimplemented");
    return;
  }
  // 前の探索が残っていれば畳んでから始める。通常は起こらない。
  joinSearch();
  if (quitFlag_.load()) {
    return;
  }

  position_ = position;
  historyKeys_ = historyKeys;
  completedDepth_ = 0;
  finishedDeepening_ = false;
  pendingBestMove_.clear();
  pv_.clear();
  score_ = 0;
  nodes_ = 0;
  startedAt_ = std::chrono::steady_clock::now();
  // 前の手のエントリは指し手順序付けに使えるので残しつつ、置き換えの対象にする。
  tt_.newSearch();
  hardDeadline_ = startedAt_ + std::chrono::milliseconds(computeBudgetMs(params));

  {
    const std::lock_guard<std::mutex> lock(mutex_);
    infinite_ = params.infinite || params.ponder;
    // 最低思考時間は持ち時間の範囲に収める。
    // 切れ負け (秒読みも加算も無い設定) で残りが少なくなると
    // computeBudgetMs() が最低思考時間を下回り、探索を終えた後もただ待つことになる。
    // それでは USI で与えられた持ち時間を超えて時間切れ負けになってしまう。
    minDeadline_ =
        std::min(startedAt_ + std::chrono::milliseconds(minimumThinkingTimeMs_), hardDeadline_);
    searching_ = true;
  }
  stopFlag_.store(false);
  searchThread_ = std::thread([this]() { searchLoop(); });
}

// 探索スレッドの本体。停止フラグが立つか目標深さに到達するまで独立して走る。
void BasicEngine::searchLoop() {
  if (style_ == STYLE_RANDOM) {
    const SearchResult result = searchRandom(position_, rng_);
    nodes_ = result.nodes;
    pendingBestMove_ = result.found ? moveToUSI(result.move) : "resign";
    pv_ = result.pv;
    if (result.found) {
      outputInfo();
    }
  } else {
    // 深さ 1 は締切を無視して必ず最後まで探索する。持ち時間を使い切っていても
    // 指し手を返せるようにするため。ここで打ち切られると指し手が 1 つも無いまま
    // bestmove を出すことになり、flushBestMove() が resign を出してしまう。
    // 深さ 1 は静止探索を含めても数ミリ秒で終わるので、超過は無視できる。
    runIteration(1, /* ignoreDeadline = */ true);
    for (int depth = 2; depth <= maxDepth_ && !finishedDeepening_; depth++) {
      if (stopFlag_.load() || std::chrono::steady_clock::now() >= hardDeadline_) {
        break;
      }
      runIteration(depth);
    }
  }

  std::unique_lock<std::mutex> lock(mutex_);
  // go infinite / go ponder は stop か ponderhit が来るまで結果を出さない。
  cv_.wait(lock, [this]() { return stopFlag_.load() || !infinite_; });
  if (!stopFlag_.load()) {
    // 最低思考時間まで待つ。ponderhit で minDeadline_ が更新されている場合がある。
    cv_.wait_until(lock, minDeadline_, [this]() { return stopFlag_.load(); });
  }
  searching_ = false;
  lock.unlock();

  flushBestMove();
}

// 走っている探索を止めて合流する。メインスレッドからのみ呼ぶ。
void BasicEngine::joinSearch() {
  if (!searchThread_.joinable()) {
    return;
  }
  stopFlag_.store(true);
  cv_.notify_all();
  searchThread_.join();
}

void BasicEngine::runIteration(int depth, bool ignoreDeadline) {
  SearchLimits limits;
  limits.deadline = ignoreDeadline ? std::chrono::steady_clock::time_point::max() : hardDeadline_;
  limits.nodeLimit = nodeLimit_;
  // 深さ 1 も stop では打ち切る。締切だけを無視する。
  limits.stop = &stopFlag_;
  const SearchResult result =
      search(style_, position_, historyKeys_, depth, limits, rng_, randomize_, &tt_);
  nodes_ += result.nodes;

  // 打ち切られた反復の結果は信頼できないので、前の深さの結果を残す。
  // ただし 1 手も確保できていない場合は暫定値として採用する。
  if (result.found && (!result.aborted || pendingBestMove_.empty())) {
    pendingBestMove_ = moveToUSI(result.move);
    pv_ = result.pv;
    score_ = result.score;
  }
  if (result.aborted) {
    finishedDeepening_ = true;
    return;
  }
  if (!result.found) {
    pendingBestMove_ = "resign";
    finishedDeepening_ = true;
    return;
  }

  completedDepth_ = depth;
  outputInfo();
  if (depth >= maxDepth_) {
    finishedDeepening_ = true;
  }
  // 詰みを見つけたらそれ以上深くしても意味が無い。
  if (score_ >= MATE_THRESHOLD || score_ <= -MATE_THRESHOLD) {
    finishedDeepening_ = true;
  }
}

void BasicEngine::outputInfo() const {
  // quit / terminate の後は info も出さない。
  if (quitFlag_.load()) {
    return;
  }
  std::string info = "info depth " + std::to_string(std::max(completedDepth_, 1)) + " nodes " +
                     std::to_string(nodes_) + " time " + std::to_string(elapsedMs(startedAt_));
  if (style_ != STYLE_RANDOM) {
    if (score_ >= MATE_THRESHOLD) {
      info += " score mate " + std::to_string(MATE_SCORE - score_);
    } else if (score_ <= -MATE_THRESHOLD) {
      info += " score mate -" + std::to_string(MATE_SCORE + score_);
    } else {
      info += " score cp " + std::to_string(score_);
    }
  }
  if (!pv_.empty()) {
    info += " pv";
    for (const Move& move : pv_) {
      info += " " + moveToUSI(move);
    }
  }
  usiOutput(info);
}

// 停止フラグを立てるだけ。bestmove は探索スレッドが出す。
// 探索は毎ノード停止フラグを見ているので、ここで待たなくてもすぐに応答する。
void BasicEngine::stop() {
  stopFlag_.store(true);
  cv_.notify_all();
}

void BasicEngine::ponderHit(const GoParams& /* params */) {
  const std::lock_guard<std::mutex> lock(mutex_);
  if (!searching_) {
    return;
  }
  infinite_ = false;
  minDeadline_ =
      std::chrono::steady_clock::now() + std::chrono::milliseconds(minimumThinkingTimeMs_);
  cv_.notify_all();
}

void BasicEngine::quit() {
  // 以降は一切出力しない。探索スレッドが bestmove を出す前に止める必要があるので、
  // フラグを立ててから合流する。
  quitFlag_.store(true);
  joinSearch();
  pendingBestMove_.clear();
}

void BasicEngine::flushBestMove() {
  const std::string move = pendingBestMove_.empty() ? "resign" : pendingBestMove_;
  pendingBestMove_.clear();
  // quit / terminate の後は思考中であっても bestmove を出してはならない。
  if (quitFlag_.load()) {
    return;
  }
  usiOutput("bestmove " + move);
}

}  // namespace basic
}  // namespace shogi
