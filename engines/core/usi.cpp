#include "usi.h"

#include <charconv>
#include <cstdio>
#include <sstream>

namespace shogi {

void usiOutput(const std::string& line) {
  std::fputs(line.c_str(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
}

bool parseInteger(const std::string& text, long long* value) {
  const char* begin = text.data();
  const char* end = begin + text.size();
  // 符号付きの 10 進数のみを受け付ける。前後に余分な文字があれば失敗とする。
  const std::from_chars_result result = std::from_chars(begin, end, *value);
  return result.ec == std::errc() && result.ptr == end;
}

namespace {

std::vector<std::string> split(const std::string& text) {
  std::vector<std::string> tokens;
  std::istringstream stream(text);
  std::string token;
  while (stream >> token) {
    tokens.push_back(token);
  }
  return tokens;
}

// "btime 300000 wtime 300000 ..." のような時間の指定を読み取る。
// tokens[i] が既知のキーで、続くトークンが整数のときだけ params を更新して true を返す。
// 変換はキーを判定した後にのみ行う (未知のキーに非数値が続いても落とさないため)。
bool parseTimeToken(const std::vector<std::string>& tokens, size_t i, GoParams* params) {
  if (i + 1 >= tokens.size()) {
    return false;
  }
  long long* target = nullptr;
  if (tokens[i] == "btime") {
    target = &params->btime;
  } else if (tokens[i] == "wtime") {
    target = &params->wtime;
  } else if (tokens[i] == "byoyomi") {
    target = &params->byoyomi;
  } else if (tokens[i] == "binc") {
    target = &params->binc;
  } else if (tokens[i] == "winc") {
    target = &params->winc;
  } else {
    return false;
  }
  return parseInteger(tokens[i + 1], target);
}

// "position" 以降の引数から局面部分と moves 以降を切り分ける。
bool splitPositionArgs(const std::vector<std::string>& tokens, std::string* sfen,
                       std::vector<std::string>* moves) {
  size_t index = 0;
  if (index >= tokens.size()) {
    return false;
  }
  if (tokens[index] == "startpos") {
    *sfen = Position::STARTPOS_SFEN;
    index++;
  } else if (tokens[index] == "sfen") {
    index++;
    std::string text;
    while (index < tokens.size() && tokens[index] != "moves") {
      if (!text.empty()) {
        text += ' ';
      }
      text += tokens[index];
      index++;
    }
    *sfen = text;
  } else {
    return false;
  }
  if (index < tokens.size() && tokens[index] == "moves") {
    index++;
    while (index < tokens.size()) {
      moves->push_back(tokens[index]);
      index++;
    }
  }
  return true;
}

}  // namespace

void UsiDriver::onPosition(const std::string& args) {
  const std::vector<std::string> tokens = split(args);
  std::string sfen;
  std::vector<std::string> moves;
  if (!splitPositionArgs(tokens, &sfen, &moves)) {
    return;
  }
  Position position;
  if (!position.setSFEN(sfen)) {
    return;
  }
  historyKeys_.clear();
  historyKeys_.push_back(position.key());
  for (const std::string& text : moves) {
    Move move;
    if (!position.parseUSIMove(text, &move) || !position.doMove(move)) {
      break;
    }
    historyKeys_.push_back(position.key());
  }
  position_ = position;
}

void UsiDriver::onGo(const std::string& args) {
  const std::vector<std::string> tokens = split(args);
  GoParams params;
  for (size_t i = 0; i < tokens.size(); i++) {
    const std::string& token = tokens[i];
    if (token == "infinite") {
      params.infinite = true;
    } else if (token == "ponder") {
      params.ponder = true;
    } else if (token == "mate") {
      params.mate = true;
      if (i + 1 < tokens.size()) {
        if (tokens[i + 1] == "infinite") {
          params.mateMaxMs = -1;
          i++;
        } else if (parseInteger(tokens[i + 1], &params.mateMaxMs)) {
          i++;
        }
      }
    } else if (parseTimeToken(tokens, i, &params)) {
      // 値のトークンも消費する。
      i++;
    }
  }
  engine_.go(position_, historyKeys_, params);
}

bool UsiDriver::command(const std::string& line) {
  const size_t space = line.find(' ');
  const std::string name = space == std::string::npos ? line : line.substr(0, space);
  const std::string args = space == std::string::npos ? "" : line.substr(space + 1);

  if (name == "usi") {
    usiOutput("id name " + engine_.name());
    usiOutput("id author " + engine_.author());
    for (const std::string& definition : engine_.optionDefinitions()) {
      usiOutput(definition);
    }
    usiOutput("usiok");
  } else if (name == "isready") {
    engine_.prepare();
    usiOutput("readyok");
  } else if (name == "setoption") {
    // setoption name <name> [value <value>]
    const std::vector<std::string> tokens = split(args);
    std::string optionName;
    std::string optionValue;
    size_t i = 0;
    if (i < tokens.size() && tokens[i] == "name") {
      i++;
      while (i < tokens.size() && tokens[i] != "value") {
        if (!optionName.empty()) {
          optionName += ' ';
        }
        optionName += tokens[i];
        i++;
      }
    }
    if (i < tokens.size() && tokens[i] == "value") {
      i++;
      while (i < tokens.size()) {
        if (!optionValue.empty()) {
          optionValue += ' ';
        }
        optionValue += tokens[i];
        i++;
      }
    }
    if (!optionName.empty()) {
      engine_.setOption(optionName, optionValue);
    }
  } else if (name == "usinewgame") {
    engine_.newGame();
  } else if (name == "position") {
    onPosition(args);
  } else if (name == "go") {
    onGo(args);
  } else if (name == "stop") {
    engine_.stop();
  } else if (name == "ponderhit") {
    GoParams params;
    const std::vector<std::string> tokens = split(args);
    for (size_t i = 0; i < tokens.size(); i++) {
      if (parseTimeToken(tokens, i, &params)) {
        // 値のトークンも消費する。
        i++;
      }
    }
    engine_.ponderHit(params);
  } else if (name == "gameover") {
    engine_.gameover(args);
  } else if (name == "quit") {
    // 終了時に bestmove を返すと GUI 側の状態が壊れるため、思考中でも何も出力しない。
    engine_.quit();
    return true;
  }
  return false;
}

void UsiDriver::poll() {
  engine_.poll();
}

}  // namespace shogi
