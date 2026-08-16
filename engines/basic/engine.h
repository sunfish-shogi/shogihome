// ShogiHome の組み込みエンジン。駒割 + 落とし穴法の評価で反復深化 + 静止探索を行う。
// 読む深さは USI オプション Depth (1〜5) で決まる。
//
// 反復深化の 1 反復を usi_poll() 1 回に対応させることで、探索を中断可能にしている
// (specs/wasm-engine-abi.md の「分割実行」)。
#pragma once

#include <chrono>
#include <cstddef>
#include <random>
#include <string>
#include <vector>

#include "core/usi.h"
#include "search.h"
#include "style.h"
#include "tt.h"

namespace shogi {
namespace basic {

class BasicEngine : public Engine {
 public:
  BasicEngine();

  std::string name() const override;
  std::string author() const override;
  std::vector<std::string> optionDefinitions() const override;
  void setOption(const std::string& name, const std::string& value) override;
  void prepare() override;
  void newGame() override;
  void go(const Position& position, const std::vector<std::string>& historyKeys,
          const GoParams& params) override;
  void poll() override;
  void stop() override;
  void ponderHit(const GoParams& params) override;
  void quit() override;

 private:
  enum class State {
    IDLE,
    // 反復深化を進めつつ、最低思考時間の経過を待つ。
    THINKING,
    // 深さを掘り終えた後、stop または ponderhit を待つ (go infinite / go ponder)。
    WAITING,
  };

  // ignoreDeadline は深さ 1 でのみ使う。理由は go() のコメントを参照。
  void runIteration(int depth, bool ignoreDeadline = false);
  void outputInfo() const;
  void flushBestMove();
  long long computeBudgetMs(const GoParams& params) const;

  Style style_ = STYLE_STATIC_ROOK;
  int maxDepth_ = 3;
  long long minimumThinkingTimeMs_ = 500;
  bool randomize_ = true;
  std::size_t hashSizeMB_ = 16;
  TranspositionTable tt_;
  long long nodeLimit_ = 3000000;
  std::mt19937 rng_;

  State state_ = State::IDLE;
  Position position_;
  std::vector<std::string> historyKeys_;
  bool infinite_ = false;
  int completedDepth_ = 0;
  bool finishedDeepening_ = false;
  std::string pendingBestMove_;
  std::vector<Move> pv_;
  int score_ = 0;
  long long nodes_ = 0;
  std::chrono::steady_clock::time_point startedAt_;
  std::chrono::steady_clock::time_point minDeadline_;
  std::chrono::steady_clock::time_point hardDeadline_;
};

}  // namespace basic
}  // namespace shogi
