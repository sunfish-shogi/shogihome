// ShogiHome の組み込みエンジン。駒割 + 落とし穴法の評価で反復深化 + 静止探索を行う。
// 読む深さは USI オプション Depth (1〜5) で決まる。
//
// **探索は専用のスレッドで走る。** go で起こし、停止フラグが立つか目標深さに
// 到達するまで独立して進む。stop / ponderhit はメインスレッドがフラグと
// 条件変数で伝える。呼び出し側から探索を駆動する必要はない。
#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <random>
#include <string>
#include <thread>
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
  ~BasicEngine() override;

  std::string name() const override;
  std::string author() const override;
  std::vector<std::string> optionDefinitions() const override;
  void setOption(const std::string& name, const std::string& value) override;
  void prepare() override;
  void newGame() override;
  void go(const Position& position, const std::vector<std::string>& historyKeys,
          const GoParams& params) override;
  void stop() override;
  void ponderHit(const GoParams& params) override;
  void quit() override;

 private:
  // 探索スレッドの本体。反復深化を進め、最後に bestmove を出力する。
  void searchLoop();
  // 走っている探索を止めて合流する。stop を立ててから join する。
  void joinSearch();
  // ignoreDeadline は深さ 1 でのみ使う。理由は searchLoop() のコメントを参照。
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

  // --- 探索スレッドとの共有 ---------------------------------------------
  std::thread searchThread_;
  std::mutex mutex_;
  std::condition_variable cv_;
  // 探索を打ち切る。stop / quit / 新しい go で立てる。
  std::atomic<bool> stopFlag_{false};
  // quit または デストラクタ以降は一切出力しない。
  std::atomic<bool> quitFlag_{false};
  // 探索スレッドが走っているか。go の二重起動を防ぐ。
  bool searching_ = false;
  // go infinite / go ponder。mutex_ で保護する (ponderhit が下ろす)。
  bool infinite_ = false;

  // --- 探索スレッドだけが触る状態 ---------------------------------------
  Position position_;
  std::vector<std::string> historyKeys_;
  int completedDepth_ = 0;
  bool finishedDeepening_ = false;
  std::string pendingBestMove_;
  std::vector<Move> pv_;
  int score_ = 0;
  long long nodes_ = 0;
  std::chrono::steady_clock::time_point startedAt_;
  std::chrono::steady_clock::time_point hardDeadline_;
  // 最低思考時間。ponderhit が更新するため mutex_ で保護する。
  std::chrono::steady_clock::time_point minDeadline_;
};

}  // namespace basic
}  // namespace shogi
