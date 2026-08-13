#include "usi.h"

#include <cstdio>
#include <sstream>

namespace shogi {

void usiOutput(const std::string& line) {
  std::fputs(line.c_str(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
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
        params.mateMaxMs = tokens[i + 1] == "infinite" ? -1 : std::stoll(tokens[i + 1]);
        i++;
      }
    } else if (i + 1 < tokens.size()) {
      const long long value = std::stoll(tokens[i + 1]);
      if (token == "btime") {
        params.btime = value;
      } else if (token == "wtime") {
        params.wtime = value;
      } else if (token == "byoyomi") {
        params.byoyomi = value;
      } else if (token == "binc") {
        params.binc = value;
      } else if (token == "winc") {
        params.winc = value;
      } else {
        continue;
      }
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
    for (size_t i = 0; i + 1 < tokens.size(); i++) {
      const long long value = std::stoll(tokens[i + 1]);
      if (tokens[i] == "btime") {
        params.btime = value;
      } else if (tokens[i] == "wtime") {
        params.wtime = value;
      } else if (tokens[i] == "byoyomi") {
        params.byoyomi = value;
      } else if (tokens[i] == "binc") {
        params.binc = value;
      } else if (tokens[i] == "winc") {
        params.winc = value;
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
