// エントリポイント。
// WebAssembly ビルドでは usi_command / usi_poll をエクスポートする。
// core/shim.js が postMessage からこれらを呼ぶ。
// 探索は専用のスレッドで走るため usi_poll に進めるものは無く、常に 0 を返す。
// ネイティブビルドでは標準入出力で動作する。
#include <memory>
#include <string>

#include "core/usi.h"
#include "engine.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#include <iostream>
#endif

namespace {

std::unique_ptr<shogi::basic::BasicEngine> g_engine;
std::unique_ptr<shogi::UsiDriver> g_driver;

void ensureInitialized() {
  if (!g_driver) {
    g_engine = std::make_unique<shogi::basic::BasicEngine>();
    g_driver = std::make_unique<shogi::UsiDriver>(*g_engine);
  }
}

}  // namespace

#ifdef __EMSCRIPTEN__

extern "C" {

EMSCRIPTEN_KEEPALIVE void usi_command(const char* line) {
  ensureInitialized();
  g_driver->command(line != nullptr ? std::string(line) : std::string());
}

// 戻り値は「まだ呼ばれる必要があるか」。0 を返すとシムが呼び出しを止める。
EMSCRIPTEN_KEEPALIVE int usi_poll() {
  return g_driver && g_driver->poll() ? 1 : 0;
}

}  // extern "C"

#else

int main() {
  ensureInitialized();
  // 探索はエンジンが自前のスレッドで進めるので、ここは入力を読むだけでよい。
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    if (g_driver->command(line)) {
      break;
    }
  }
  // 標準入力が閉じた場合も、探索スレッドを残さず畳んでから終わる。
  g_engine.reset();
  return 0;
}

#endif
