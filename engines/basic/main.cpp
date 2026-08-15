// エントリポイント。
// WebAssembly ビルドでは usi_command / usi_poll をエクスポートし、
// core/shim.js が postMessage / poll としてこれらを呼び出す。
// ネイティブビルドでは標準入出力で動作する。
#include <memory>
#include <string>

#include "core/usi.h"
#include "engine.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#include <atomic>
#include <chrono>
#include <iostream>
#include <mutex>
#include <thread>
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

EMSCRIPTEN_KEEPALIVE void usi_poll() {
  if (g_driver) {
    g_driver->poll();
  }
}

}  // extern "C"

#else

int main() {
  ensureInitialized();
  std::mutex mutex;
  std::atomic<bool> running{true};
  std::thread poller([&running, &mutex]() {
    while (running.load()) {
      {
        const std::lock_guard<std::mutex> lock(mutex);
        g_driver->poll();
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
  });

  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }
    const std::lock_guard<std::mutex> lock(mutex);
    if (g_driver->command(line)) {
      break;
    }
  }

  running.store(false);
  poller.join();
  return 0;
}

#endif
