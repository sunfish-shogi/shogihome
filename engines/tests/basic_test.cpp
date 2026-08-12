// src/tests/renderer/players/basic.spec.ts と同じ局面で、移植版が同じ手を選ぶことを確認する。
#include <cstdio>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "basic/evaluate.h"
#include "basic/search.h"
#include "core/position.h"

namespace {

int g_failures = 0;

void expect(bool condition, const std::string& message) {
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", message.c_str());
    g_failures++;
  }
}

struct Game {
  shogi::Position position;
  std::vector<std::string> historyKeys;
};

Game buildGame(const std::string& sfen, const std::vector<std::string>& usiMoves) {
  Game game;
  expect(game.position.setSFEN(sfen), "setSFEN: " + sfen);
  game.historyKeys.push_back(game.position.key());
  for (const std::string& text : usiMoves) {
    shogi::Move move;
    expect(game.position.parseUSIMove(text, &move), "parseUSIMove: " + text);
    expect(game.position.doMove(move), "doMove: " + text);
    game.historyKeys.push_back(game.position.key());
  }
  return game;
}

std::vector<std::string> split(const std::string& text) {
  std::vector<std::string> tokens;
  std::istringstream stream(text);
  std::string token;
  while (stream >> token) {
    tokens.push_back(token);
  }
  return tokens;
}

void testSpecificMoves() {
  struct TestCase {
    shogi::basic::Style style;
    std::string moves;
    std::string want;
  };
  const TestCase testCases[] = {
      {shogi::basic::STYLE_STATIC_ROOK, "2g2f 3c3d 7g7f 2b8h+ 7i8h 4a3b 2f2e", "3a2b"},
      {shogi::basic::STYLE_STATIC_ROOK, "2g2f 8c8d 2f2e 8d8e", "7g7f"},
      {shogi::basic::STYLE_RANGING_ROOK, "7g7f 3c3d 2g2f 4c4d 2f2e", "2b3c"},
      {shogi::basic::STYLE_RANGING_ROOK, "7g7f 8c8d 2h6h 8d8e", "8h7g"},
  };
  std::mt19937 rng(12345);
  for (int i = 0; i < 10; i++) {
    for (const TestCase& testCase : testCases) {
      const Game game = buildGame(shogi::Position::STARTPOS_SFEN, split(testCase.moves));
      const shogi::basic::SearchResult result =
          shogi::basic::search(testCase.style, game.position, game.historyKeys, rng);
      expect(result.found, "specificMoves: no move for [" + testCase.moves + "]");
      if (result.found) {
        const std::string got = shogi::moveToUSI(result.move);
        expect(got == testCase.want,
               "specificMoves: [" + testCase.moves + "] want=" + testCase.want + " got=" + got);
      }
    }
  }
}

void testResign() {
  const std::string sfen =
      "5+S2l/1+R7/2p1p+Bsp1/1p1p4p/8k/L3P1p1L/6PPP/1PGB3R1/3K2SNL w 3GS3N6P 1";
  std::mt19937 rng(2345);
  const Game game = buildGame(sfen, {});
  for (const shogi::basic::Style style :
       {shogi::basic::STYLE_STATIC_ROOK, shogi::basic::STYLE_RANGING_ROOK}) {
    const shogi::basic::SearchResult result =
        shogi::basic::search(style, game.position, game.historyKeys, rng);
    expect(!result.found, "resign: unexpected move " + shogi::moveToUSI(result.move));
  }
  const shogi::basic::SearchResult random = shogi::basic::searchRandom(game.position, rng);
  expect(!random.found, "resign(random): unexpected move " + shogi::moveToUSI(random.move));
}

void testRandomPlayerLegality() {
  std::mt19937 rng(777);
  shogi::Position position;
  for (int ply = 0; ply < 200; ply++) {
    const shogi::basic::SearchResult result = shogi::basic::searchRandom(position, rng);
    if (!result.found) {
      break;
    }
    expect(position.isValidMove(result.move),
           "randomPlayer: invalid move " + shogi::moveToUSI(result.move));
    if (!position.doMove(result.move)) {
      expect(false, "randomPlayer: doMove failed");
      break;
    }
  }
}

void testSFENRoundTrip() {
  const std::string sfen =
      "5+S2l/1+R7/2p1p+Bsp1/1p1p4p/8k/L3P1p1L/6PPP/1PGB3R1/3K2SNL w 3GS3N6P 1";
  shogi::Position position;
  expect(position.setSFEN(sfen), "setSFEN");
  expect(position.sfen(1) == sfen, "sfen round trip: got " + position.sfen(1));

  shogi::Position startpos;
  expect(startpos.sfen(1) == shogi::Position::STARTPOS_SFEN,
         "startpos round trip: got " + startpos.sfen(1));
}

void testRepetitionKey() {
  // 同一局面に戻る手順でキーが一致することを確認する。
  const Game game = buildGame(shogi::Position::STARTPOS_SFEN, split("7i6h 3a4b 6h7i 4b3a"));
  expect(game.historyKeys.size() == 5, "repetition: history size");
  expect(game.historyKeys.front() == game.historyKeys.back(), "repetition: key mismatch");
}

}  // namespace

int main() {
  testSFENRoundTrip();
  testRepetitionKey();
  testSpecificMoves();
  testResign();
  testRandomPlayerLegality();
  if (g_failures > 0) {
    std::fprintf(stderr, "%d test(s) failed\n", g_failures);
    return 1;
  }
  std::printf("all tests passed\n");
  return 0;
}
