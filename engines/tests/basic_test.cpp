// エンジンの評価と探索の基本的な性質を確認する。
#include <cstdio>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "basic/evaluate.h"
#include "basic/pst.h"
#include "basic/search.h"
#include "basic/style.h"
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

std::vector<std::string> split(const std::string& text) {
  std::vector<std::string> tokens;
  std::istringstream stream(text);
  std::string token;
  while (stream >> token) {
    tokens.push_back(token);
  }
  return tokens;
}

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

shogi::basic::SearchLimits testLimits() {
  shogi::basic::SearchLimits limits;
  limits.deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
  limits.nodeLimit = 3000000;
  return limits;
}

std::string bestMove(shogi::basic::Style style, const Game& game, int depth) {
  std::mt19937 rng(12345);
  const shogi::basic::SearchResult result =
      shogi::basic::search(style, game.position, game.historyKeys, depth, testLimits(), rng);
  return result.found ? shogi::moveToUSI(result.move) : "resign";
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

// 落とし穴法のテーブルが左右を正しく区別しているか確認する。
void testPieceSquareTableOrientation() {
  using namespace shogi;
  using namespace shogi::basic;
  const Square s88 = squareOf(8, 8);
  const Square s38 = squareOf(3, 8);
  expect(pieceSquareValue(STYLE_STATIC_ROOK, KING, s88) >
             pieceSquareValue(STYLE_STATIC_ROOK, KING, s38),
         "居飛車の玉は 8八 を好むこと");
  expect(pieceSquareValue(STYLE_RANGING_ROOK, KING, s38) >
             pieceSquareValue(STYLE_RANGING_ROOK, KING, s88),
         "振り飛車の玉は 3八 を好むこと");
  expect(pieceSquareValue(STYLE_STATIC_ROOK, ROOK, squareOf(2, 8)) >
             pieceSquareValue(STYLE_STATIC_ROOK, ROOK, squareOf(6, 8)),
         "居飛車の飛車は 2八 を好むこと");
  expect(pieceSquareValue(STYLE_RANGING_ROOK, ROOK, squareOf(6, 8)) >
             pieceSquareValue(STYLE_RANGING_ROOK, ROOK, squareOf(2, 8)),
         "振り飛車の飛車は 6八 を好むこと");
  expect(pieceSquareValue(STYLE_RANGING_ROOK, SILVER, squareOf(3, 9)) >
             pieceSquareValue(STYLE_RANGING_ROOK, SILVER, squareOf(3, 5)),
         "振り飛車の銀は 3九 を好むこと");
  // 玉が敵陣に出るのは常に悪い。
  expect(pieceSquareValue(STYLE_STATIC_ROOK, KING, squareOf(5, 2)) < 0, "玉の敵陣は減点");
  expect(pieceSquareValue(STYLE_RANGING_ROOK, KING, squareOf(5, 2)) < 0, "玉の敵陣は減点");
}

// 平手の初期局面は 180 度回転させると自分自身に一致するため、評価値は 0 になる。
void testEvaluationSymmetry() {
  using namespace shogi;
  using namespace shogi::basic;
  for (const Style style : {STYLE_STATIC_ROOK, STYLE_RANGING_ROOK}) {
    Position black;
    expect(evaluatePosition(style, black) == 0,
           "初期局面 (先手番) の評価値: " + std::to_string(evaluatePosition(style, black)));
    Position white;
    expect(white.setSFEN("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1"),
           "setSFEN (後手番)");
    expect(evaluatePosition(style, white) == 0,
           "初期局面 (後手番) の評価値: " + std::to_string(evaluatePosition(style, white)));
  }
}

// ただ取りできる駒があれば取ること。
void testCapturesFreePiece() {
  const Game game = buildGame("4k4/9/9/9/4r4/4P4/9/9/4K4 b - 1", {});
  for (const shogi::basic::Style style :
       {shogi::basic::STYLE_STATIC_ROOK, shogi::basic::STYLE_RANGING_ROOK}) {
    expect(bestMove(style, game, 3) == "5f5e",
           std::string("ただ取りできる飛車を取ること: got ") + bestMove(style, game, 3));
  }
}

// 1 手詰めを見つけること。
void testFindsMateInOne() {
  const Game game = buildGame("4k4/9/4G4/9/9/9/9/9/4K4 b G 1", {});
  std::mt19937 rng(999);
  const shogi::basic::SearchResult result = shogi::basic::search(
      shogi::basic::STYLE_STATIC_ROOK, game.position, game.historyKeys, 3, testLimits(), rng);
  expect(result.found, "詰みの局面で手が見つかること");
  expect(shogi::moveToUSI(result.move) == "G*5b",
         "1 手詰めを選ぶこと: got " + shogi::moveToUSI(result.move));
  expect(result.score >= shogi::basic::MATE_THRESHOLD,
         "詰みの評価値になること: got " + std::to_string(result.score));
}

// 合法手が無い局面では手が見つからないこと。
void testResign() {
  const std::string sfen =
      "5+S2l/1+R7/2p1p+Bsp1/1p1p4p/8k/L3P1p1L/6PPP/1PGB3R1/3K2SNL w 3GS3N6P 1";
  const Game game = buildGame(sfen, {});
  std::mt19937 rng(2345);
  for (const shogi::basic::Style style :
       {shogi::basic::STYLE_STATIC_ROOK, shogi::basic::STYLE_RANGING_ROOK}) {
    const shogi::basic::SearchResult result =
        shogi::basic::search(style, game.position, game.historyKeys, 3, testLimits(), rng);
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

// 自己対局で非合法手を指さないこと。PV の先頭も合法であること。
void testSelfPlay() {
  std::mt19937 rng(4649);
  shogi::Position position;
  std::vector<std::string> historyKeys;
  historyKeys.push_back(position.key());
  shogi::basic::Style style = shogi::basic::STYLE_STATIC_ROOK;
  for (int ply = 0; ply < 60; ply++) {
    const shogi::basic::SearchResult result =
        shogi::basic::search(style, position, historyKeys, 2, testLimits(), rng);
    if (!result.found) {
      break;
    }
    expect(!result.pv.empty(), "selfPlay: PV が空");
    if (!result.pv.empty()) {
      expect(result.pv[0] == result.move, "selfPlay: PV の先頭が最善手と一致しない");
    }
    expect(position.isValidMove(result.move),
           "selfPlay: invalid move " + shogi::moveToUSI(result.move));
    if (!position.doMove(result.move)) {
      expect(false, "selfPlay: doMove failed");
      break;
    }
    historyKeys.push_back(position.key());
    style = style == shogi::basic::STYLE_STATIC_ROOK ? shogi::basic::STYLE_RANGING_ROOK
                                                     : shogi::basic::STYLE_STATIC_ROOK;
  }
}

}  // namespace

int main() {
  testSFENRoundTrip();
  testRepetitionKey();
  testPieceSquareTableOrientation();
  testEvaluationSymmetry();
  testCapturesFreePiece();
  testFindsMateInOne();
  testResign();
  testRandomPlayerLegality();
  testSelfPlay();
  if (g_failures > 0) {
    std::fprintf(stderr, "%d test(s) failed\n", g_failures);
    return 1;
  }
  std::printf("all tests passed\n");
  return 0;
}
