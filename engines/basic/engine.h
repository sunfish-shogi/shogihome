// BasicPlayer 相当のエンジン実装。
#pragma once

#include <chrono>
#include <random>
#include <string>
#include <vector>

#include "core/usi.h"
#include "evaluate.h"

namespace shogi {
namespace basic {

class BasicEngine : public Engine {
 public:
  BasicEngine();

  std::string name() const override;
  std::string author() const override;
  std::vector<std::string> optionDefinitions() const override;
  void setOption(const std::string& name, const std::string& value) override;
  void newGame() override;
  void go(const Position& position, const std::vector<std::string>& historyKeys,
          const GoParams& params) override;
  void poll() override;
  void stop() override;
  void ponderHit(const GoParams& params) override;

 private:
  enum class State {
    IDLE,
    // 締切まで待ってから bestmove を返す。
    THINKING,
    // stop または ponderhit を受け取るまで bestmove を返さない。
    WAITING,
  };

  void flushBestMove();

  Style style_ = STYLE_STATIC_ROOK;
  long long minimumThinkingTimeMs_ = 500;
  std::mt19937 rng_;
  State state_ = State::IDLE;
  std::string pendingBestMove_;
  std::chrono::steady_clock::time_point deadline_;
};

}  // namespace basic
}  // namespace shogi
