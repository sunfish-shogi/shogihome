// エンジンの評価と探索の基本的な性質を確認する。
#include <cstdio>
#include <map>
#include <random>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "basic/evaluate.h"
#include "basic/search.h"
#include "basic/style.h"
#include "core/position.h"
#include "core/usi.h"

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

// go / ponderhit に渡されたパラメータを記録するだけのエンジン。
class RecordingEngine : public shogi::Engine {
 public:
  std::string name() const override { return "recorder"; }
  std::string author() const override { return "test"; }
  std::vector<std::string> optionDefinitions() const override { return {}; }
  void setOption(const std::string&, const std::string&) override {}
  void go(const shogi::Position&, const std::vector<std::string>&,
          const shogi::GoParams& params) override {
    goParams = params;
  }
  void poll() override {}
  void stop() override {}
  void ponderHit(const shogi::GoParams& params) override { ponderHitParams = params; }

  shogi::GoParams goParams;
  shogi::GoParams ponderHitParams;
};

void testParseInteger() {
  long long value = -1;
  expect(shogi::parseInteger("300000", &value) && value == 300000, "parseInteger: 正の数");
  expect(shogi::parseInteger("-5", &value) && value == -5, "parseInteger: 負の数");
  // 例外を投げずに false を返すこと。
  for (const std::string& text : {"", "wtime", "12x", "1 2", " 3", "+4", "1.5"}) {
    expect(!shogi::parseInteger(text, &value), "parseInteger: 拒否すべき値: " + text);
  }
}

// 時間の指定を読み取れること。不正なトークンでも落ちないこと。
void testCommandParsing() {
  RecordingEngine engine;
  shogi::UsiDriver driver(engine);
  driver.command("position startpos");

  driver.command("go btime 300000 wtime 290000 byoyomi 30000 binc 1000 winc 2000");
  expect(engine.goParams.btime == 300000, "go: btime");
  expect(engine.goParams.wtime == 290000, "go: wtime");
  expect(engine.goParams.byoyomi == 30000, "go: byoyomi");
  expect(engine.goParams.binc == 1000, "go: binc");
  expect(engine.goParams.winc == 2000, "go: winc");

  // ponderhit も go と同じ形式で時間を受け取る。
  // キーと値を 2 つずつ進めないと、値のトークンをキーとして解釈してしまう。
  engine.ponderHitParams = shogi::GoParams();
  driver.command("ponderhit btime 123000 wtime 456000 byoyomi 30000");
  expect(engine.ponderHitParams.btime == 123000, "ponderhit: btime");
  expect(engine.ponderHitParams.wtime == 456000, "ponderhit: wtime");
  expect(engine.ponderHitParams.byoyomi == 30000, "ponderhit: byoyomi");

  // 未知のキーに非数値が続いても落とさず、後続の指定は読めること。
  engine.goParams = shogi::GoParams();
  driver.command("go searchmoves 7g7f 3c3d btime 1000 wtime 2000");
  expect(engine.goParams.btime == 1000, "go: 未知のキーの後の btime");
  expect(engine.goParams.wtime == 2000, "go: 未知のキーの後の wtime");

  // 値が数値でない場合は既定値のままにする。
  engine.goParams = shogi::GoParams();
  driver.command("go btime abc wtime 5000");
  expect(engine.goParams.btime == 0, "go: 不正な btime は無視する");
  expect(engine.goParams.wtime == 5000, "go: 不正な値の後の wtime");

  engine.goParams = shogi::GoParams();
  driver.command("go ponder btime 1000");
  expect(engine.goParams.ponder && engine.goParams.btime == 1000, "go ponder");

  engine.goParams = shogi::GoParams();
  driver.command("go mate infinite");
  expect(engine.goParams.mate && engine.goParams.mateMaxMs == -1, "go mate infinite");

  engine.goParams = shogi::GoParams();
  driver.command("go mate 5000");
  expect(engine.goParams.mate && engine.goParams.mateMaxMs == 5000, "go mate 5000");
}

// Zobrist キーが SFEN のキーと一対一に対応し、doMove / undoMove の差分更新でも
// 崩れないことを確認する。置換表はこのキーの正しさに全面的に依存する。
void testHashKey() {
  std::mt19937 rng(4649);
  // SFEN キー -> ハッシュキーの対応表。食い違いがあれば差分更新が壊れている。
  std::map<std::string, shogi::HashKey> keys;
  int positions = 0;

  for (int game = 0; game < 30; game++) {
    shogi::Position position;
    for (int ply = 0; ply < 60; ply++) {
      // 別経路で同じ局面に来たら、同じキーになっていること。
      const std::string sfenKey = position.key();
      const shogi::HashKey hashKey = position.hashKey();
      const auto found = keys.find(sfenKey);
      if (found == keys.end()) {
        keys.emplace(sfenKey, hashKey);
      } else {
        expect(found->second == hashKey, "同じ局面のキーが一致すること: " + sfenKey);
      }
      positions++;

      // 局面を作り直したときのキーと、差分更新で得たキーが一致すること。
      shogi::Position rebuilt;
      expect(rebuilt.setSFEN(sfenKey), "setSFEN: " + sfenKey);
      expect(rebuilt.hashKey() == hashKey, "作り直したキーと一致すること: " + sfenKey);

      std::vector<shogi::Move> moves = position.listMoves();
      if (moves.empty()) {
        break;
      }
      // 合法手をひとつ選んで進める。
      bool moved = false;
      for (size_t i = 0; i < moves.size() && !moved; i++) {
        const shogi::Move& move = moves[rng() % moves.size()];
        if (position.doMove(move)) {
          // undo で元のキーに戻ること。
          const shogi::HashKey afterKey = position.hashKey();
          position.undoMove(move);
          expect(position.hashKey() == hashKey, "undoMove でキーが戻ること");
          expect(position.doMove(move), "doMove の再実行");
          expect(position.hashKey() == afterKey, "doMove の再実行でキーが一致すること");
          moved = true;
        }
      }
      if (!moved) {
        break;
      }
    }
  }
  expect(positions > 500, "十分な数の局面を確認すること: " + std::to_string(positions));
  // 異なる局面が同じキーになっていないこと (衝突の検出)。
  std::set<shogi::HashKey> unique;
  for (const auto& entry : keys) {
    expect(unique.insert(entry.second).second, "キーが衝突しないこと: " + entry.first);
  }
}

// 持ち駒の枚数がキーに反映されること。盤面が同じでも持ち駒が違えば別局面になる。
void testHashKeyIncludesHand() {
  shogi::Position a;
  shogi::Position b;
  expect(a.setSFEN("4k4/9/9/9/9/9/9/9/4K4 b P 1"), "setSFEN(a)");
  expect(b.setSFEN("4k4/9/9/9/9/9/9/9/4K4 b 2P 1"), "setSFEN(b)");
  expect(a.hashKey() != b.hashKey(), "持ち駒の枚数がキーに反映されること");

  shogi::Position black;
  shogi::Position white;
  expect(black.setSFEN("4k4/9/9/9/9/9/9/9/4K4 b P 1"), "setSFEN(black)");
  expect(white.setSFEN("4k4/9/9/9/9/9/9/9/4K4 b p 1"), "setSFEN(white)");
  expect(black.hashKey() != white.hashKey(), "持ち駒の持ち主がキーに反映されること");

  shogi::Position turn;
  expect(turn.setSFEN("4k4/9/9/9/9/9/9/9/4K4 w P 1"), "setSFEN(turn)");
  expect(black.hashKey() != turn.hashKey(), "手番がキーに反映されること");
}

}  // namespace

int main() {
  testHashKey();
  testHashKeyIncludesHand();
  testParseInteger();
  testCommandParsing();
  testSFENRoundTrip();
  testRepetitionKey();
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
