/* eslint-disable no-console */
// 組み込みエンジンの自己対局。設定を変えた二者を戦わせて勝率を測る。
// ベンチマークは速さしか測れないので、強くなったかどうかはこちらで確認する。
//
//   npm run engines:selfplay -- --a Depth=5 --b Depth=3 --games 20
//   npm run engines:selfplay -- --a Style=static_rook --b Style=ranging_rook --games 10
//   npm run engines:selfplay -- --a Depth=3 --b Depth=3 --games 4 --verbose
//
// --a-dir / --b-dir で成果物のディレクトリを指定できる。改良の前後を
// ビルドごと比較する場合に使う (古い wasm を別の場所へ取り出して指定する)。
//
//   npm run engines:selfplay -- --a-dir /tmp/old --a Depth=5 --b Depth=5 --games 20
//
// 先後は 1 局ごとに入れ替える (--games は偶数にすること)。
// 千日手と手数上限は引き分けとして扱う。
//
// 注意: ルートの評価値に乱数が入るため、同じ設定同士でも結果はばらつく。
// 少数の対局で強さを判断しないこと。目安として、勝率の差が 10% 程度あることを
// 主張するには 100 局以上が要る。

import { Position } from "tsshogi";
import { launchEngine, parseArgs, parseOptions } from "./lib/wasm-engine.mjs";

const args = parseArgs(process.argv.slice(2));
const optionsA = parseOptions(args.a || "Depth=5");
const optionsB = parseOptions(args.b || "Depth=3");
const games = Number(args.games || 10);
const maxMoves = Number(args.maxMoves || 200);
const verbose = args.verbose !== undefined;
// 対局ごとの持ち時間。既定では探索の上限 (1 手 3 秒) に収まる範囲で回す。
const goCommand = args.go || "go btime 600000 wtime 600000 byoyomi 5000";

function label(options) {
  const entries = Object.entries(options);
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(",") : "既定";
}

// 1 局指す。black / white はエンジンのハンドル。
async function playGame(black, white) {
  const position = new Position();
  const moves = [];
  // 千日手の判定に使う。局面のキーは SFEN (手数を除く)。
  const seen = new Map();
  for (let ply = 0; ply < maxMoves; ply++) {
    const engine = ply % 2 === 0 ? black : white;
    const command = `position startpos moves ${moves.join(" ")}`.trimEnd();
    const result = await engine.search(command, goCommand);
    if (result.errors.length) {
      throw new Error(`エンジンが異常終了しました: ${result.errors.join(" / ")}`);
    }
    if (result.bestMove === "resign") {
      return { result: ply % 2 === 0 ? "white" : "black", reason: "投了", moves };
    }
    const move = position.createMoveByUSI(result.bestMove);
    if (!move || !position.doMove(move)) {
      return {
        result: ply % 2 === 0 ? "white" : "black",
        reason: `非合法手 ${result.bestMove}`,
        moves,
      };
    }
    moves.push(result.bestMove);
    const key = position.sfen.split(" ").slice(0, 3).join(" ");
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count >= 4) {
      return { result: "draw", reason: "千日手", moves };
    }
  }
  return { result: "draw", reason: "手数上限", moves };
}

const dirA = args["a-dir"] || "basic";
const dirB = args["b-dir"] || "basic";
const engineA = await launchEngine(dirA, { MinimumThinkingTime: 0, ...optionsA });
const engineB = await launchEngine(dirB, { MinimumThinkingTime: 0, ...optionsB });

const tally = { a: 0, b: 0, draw: 0 };
const started = Date.now();
for (let i = 0; i < games; i++) {
  // 先後を入れ替えて偏りを消す。
  const aIsBlack = i % 2 === 0;
  const black = aIsBlack ? engineA : engineB;
  const white = aIsBlack ? engineB : engineA;
  // 前局の状態を持ち越さない。
  black.send("usinewgame");
  white.send("usinewgame");
  const game = await playGame(black, white);
  let winner;
  if (game.result === "draw") {
    winner = "draw";
    tally.draw++;
  } else {
    const blackWon = game.result === "black";
    winner = blackWon === aIsBlack ? "a" : "b";
    tally[winner]++;
  }
  console.log(
    `${String(i + 1).padStart(3)}局目 ${aIsBlack ? "A先手" : "B先手"} ` +
      `${game.moves.length}手 ${game.reason} → ${winner.toUpperCase()}`,
  );
  if (verbose) {
    console.log(`     ${game.moves.join(" ")}`);
  }
}
engineA.terminate();
engineB.terminate();

const decided = tally.a + tally.b;
const rate = decided > 0 ? ((tally.a / decided) * 100).toFixed(1) : "-";
console.log("");
console.log(`A: ${dirA} ${label(optionsA)}`);
console.log(`B: ${dirB} ${label(optionsB)}`);
console.log(`結果  A ${tally.a} 勝 / B ${tally.b} 勝 / 引き分け ${tally.draw}`);
console.log(`A の勝率 (引き分けを除く): ${rate}%`);
console.log(`所要時間: ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
