// USI プロトコルの入出力。エンジン固有の思考処理は Engine の実装に委ねる。
#pragma once

#include <string>
#include <vector>

#include "position.h"

namespace shogi {

// go コマンドのパラメータ。
struct GoParams {
  bool infinite = false;
  bool ponder = false;
  bool mate = false;
  long long mateMaxMs = -1;  // -1 は無制限 (go mate infinite)
  long long btime = 0;
  long long wtime = 0;
  long long byoyomi = 0;
  long long binc = 0;
  long long winc = 0;
};

// 1 行出力する。WebAssembly ビルドでは Module.print 経由で Worker に渡る。
void usiOutput(const std::string& line);

// 10 進数として解釈できた場合だけ *value に書き込み、true を返す。
//
// std::stoll / std::stoi は使ってはならない。Emscripten は既定で例外の捕捉を無効にする
// (-sDISABLE_EXCEPTION_CATCHING=1) ため、throw が catch されずに abort となり、
// GUI から不正な値を渡されただけでランタイムごと落ちる。try/catch で囲んでも無意味。
bool parseInteger(const std::string& text, long long* value);

// エンジンの実装が備えるべきインターフェース。
// 新しいエンジンを追加する場合はこのクラスを継承し、main.cpp で UsiDriver に渡す。
class Engine {
 public:
  virtual ~Engine() = default;

  virtual std::string name() const = 0;
  virtual std::string author() const = 0;

  // "option name ... type ..." の行を返す。usi コマンドへの応答に使う。
  virtual std::vector<std::string> optionDefinitions() const = 0;
  virtual void setOption(const std::string& name, const std::string& value) = 0;

  // isready への応答前に呼ばれる。時間のかかる初期化はここで行う。
  virtual void prepare() {}
  virtual void newGame() {}

  // 思考を開始する。bestmove はこの中で出さず、poll() で出すこと。
  // historyKeys には初期局面から現局面までの各局面のキーが順に入る (千日手判定用)。
  virtual void go(const Position& position, const std::vector<std::string>& historyKeys,
                  const GoParams& params) = 0;
  // 一定間隔で呼ばれる。締切に達していれば bestmove を出力する。
  virtual void poll() = 0;
  virtual void stop() = 0;
  virtual void ponderHit(const GoParams& params) = 0;
  virtual void gameover(const std::string& /* result */) {}
  // quit を受け取ったときに呼ばれる。以降は一切出力してはならない。
  virtual void quit() {}
};

// USI コマンドを解釈して Engine を駆動する。
class UsiDriver {
 public:
  explicit UsiDriver(Engine& engine) : engine_(engine) {}

  // 1 行のコマンドを処理する。quit を受け取った場合は true を返す。
  bool command(const std::string& line);
  // Engine::poll を呼ぶ。
  void poll();

 private:
  void onPosition(const std::string& args);
  void onGo(const std::string& args);

  Engine& engine_;
  Position position_;
  std::vector<std::string> historyKeys_;
};

}  // namespace shogi
