#include "engine.h"

#include <algorithm>

#include "search.h"

namespace shogi {
namespace basic {

namespace {

const char* styleName(Style style) {
  switch (style) {
    case STYLE_RANGING_ROOK:
      return "ranging_rook";
    case STYLE_RANDOM:
      return "random";
    default:
      return "static_rook";
  }
}

bool parseStyle(const std::string& value, Style* style) {
  if (value == "static_rook") {
    *style = STYLE_STATIC_ROOK;
  } else if (value == "ranging_rook") {
    *style = STYLE_RANGING_ROOK;
  } else if (value == "random") {
    *style = STYLE_RANDOM;
  } else {
    return false;
  }
  return true;
}

long long elapsedMs(std::chrono::steady_clock::time_point since) {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now() - since)
      .count();
}

}  // namespace

BasicEngine::BasicEngine() : rng_(std::random_device{}()) {}

std::string BasicEngine::name() const {
  return "ShogiHome Basic Engine";
}

std::string BasicEngine::author() const {
  return "Kubo, Ryosuke";
}

std::vector<std::string> BasicEngine::optionDefinitions() const {
  return {
      std::string("option name Style type combo default ") + styleName(STYLE_STATIC_ROOK) +
          " var static_rook var ranging_rook var random",
      "option name MinimumThinkingTime type spin default 500 min 0 max 60000",
      // 本エンジンは先読みに対応しない。
      "option name USI_Ponder type check default false",
  };
}

void BasicEngine::setOption(const std::string& name, const std::string& value) {
  if (name == "Style") {
    parseStyle(value, &style_);
  } else if (name == "MinimumThinkingTime") {
    try {
      minimumThinkingTimeMs_ = std::max(0LL, std::stoll(value));
    } catch (...) {
      // 不正な値は無視する。
    }
  }
}

void BasicEngine::newGame() {
  state_ = State::IDLE;
  pendingBestMove_.clear();
}

void BasicEngine::go(const Position& position, const std::vector<std::string>& historyKeys,
                     const GoParams& params) {
  if (params.mate) {
    // 詰み探索には対応しない。
    usiOutput("checkmate notimplemented");
    return;
  }

  const auto startedAt = std::chrono::steady_clock::now();
  const SearchResult result = style_ == STYLE_RANDOM ? searchRandom(position, rng_)
                                                     : search(style_, position, historyKeys, rng_);
  const long long thinkingTimeMs = elapsedMs(startedAt);

  if (!result.found) {
    pendingBestMove_ = "resign";
  } else {
    pendingBestMove_ = moveToUSI(result.move);
    std::string info = "info depth " + std::string(style_ == STYLE_RANDOM ? "1" : "2") +
                       " nodes " + std::to_string(result.nodes) + " time " +
                       std::to_string(thinkingTimeMs);
    if (style_ != STYLE_RANDOM) {
      info += " score cp " + std::to_string(result.score);
    }
    info += " pv " + pendingBestMove_;
    usiOutput(info);
  }

  if (params.infinite || params.ponder) {
    // stop または ponderhit を受け取るまで bestmove を返さない。
    state_ = State::WAITING;
    return;
  }
  state_ = State::THINKING;
  deadline_ = startedAt + std::chrono::milliseconds(minimumThinkingTimeMs_);
  // 既に締切を過ぎている場合は次の poll で出力される。
}

void BasicEngine::poll() {
  if (state_ != State::THINKING) {
    return;
  }
  if (std::chrono::steady_clock::now() < deadline_) {
    return;
  }
  flushBestMove();
}

void BasicEngine::stop() {
  if (state_ == State::IDLE) {
    return;
  }
  flushBestMove();
}

void BasicEngine::ponderHit(const GoParams& /* params */) {
  if (state_ != State::WAITING) {
    return;
  }
  state_ = State::THINKING;
  deadline_ = std::chrono::steady_clock::now() + std::chrono::milliseconds(minimumThinkingTimeMs_);
}

void BasicEngine::flushBestMove() {
  state_ = State::IDLE;
  const std::string move = pendingBestMove_.empty() ? "resign" : pendingBestMove_;
  pendingBestMove_.clear();
  usiOutput("bestmove " + move);
}

}  // namespace basic
}  // namespace shogi
