/* eslint-disable no-console */
// 組み込みエンジンのベンチマーク。探索の改良の効果を測るために使う。
//
//   npm run engines:bench                          既定の局面を深さ 3 と 5 で測る
//   npm run engines:bench -- --depth 5             深さを指定する
//   npm run engines:bench -- --options Style=ranging_rook
//   npm run engines:bench -- --json                機械可読な出力 (差分を取る場合)
//
// Randomize を無効にして探索を決定的にしているので、局面・深さ・戦型が同じなら
// ノード数は毎回同じになる (根の乱数は窓にも影響するため、有効なままだと数 % ぶれる)。
// したがって改良の前後で
//   npm run engines:bench -- --json > before.json
// のように保存しておけば、そのまま比較できる。
//
// 時間は環境に左右されるので、ノード数を主な指標とし、時間は目安として見ること。

import { launchEngine, parseArgs, parseOptions } from "./lib/wasm-engine.mjs";

// 探索の性質が異なる局面を並べる。増やす場合は名前を変えないこと (比較できなくなる)。
const POSITIONS = [
  { name: "初期局面", command: "position startpos" },
  { name: "序盤", command: "position startpos moves 7g7f 3c3d 2g2f" },
  {
    name: "中盤",
    command:
      "position sfen ln1g3nl/1r2k1gs1/p1ps1p1pp/2pp2p2/1p5P1/2PPP1P2/PPSG1PN1P/2G1K1SR1/LN5BL b Bb 1",
  },
  {
    name: "終盤",
    command: "position sfen 3sks3/9/4pp3/p8/9/9/PP2PP3/2G1K4/LN3G3 b RBGSNLP2r2b2g2s2n2l14p 1",
  },
  {
    name: "詰み絡み",
    command: "position sfen 4k4/9/4G4/9/9/9/9/9/4K4 b G 1",
  },
];

const args = parseArgs(process.argv.slice(2));
const depths = (args.depth || "3,5").split(",").map((value) => Number(value.trim()));
const options = parseOptions(args.options);
const asJSON = args.json !== undefined;
// 思考時間の下限で待たされないようにし、探索そのものを測る。
// 打ち切りが起きると比較にならないので、持ち時間の上限も十分に大きくする。
const goCommand = "go btime 3600000 wtime 3600000 byoyomi 3600000";

const results = [];
for (const depth of depths) {
  const engine = await launchEngine("basic", {
    MinimumThinkingTime: 0,
    // 探索を決定的にする。ノード数を比較できるようにするため。
    Randomize: false,
    Depth: depth,
    ...options,
  });
  for (const position of POSITIONS) {
    const result = await engine.search(position.command, goCommand);
    // 詰みを見つけると指定より浅い深さで打ち切るので、それは truncated ではない。
    const truncated = result.depth < depth && result.scoreMate === undefined;
    results.push({
      position: position.name,
      requestedDepth: depth,
      reachedDepth: result.depth,
      // 時間切れで打ち切られた場合、ノード数は最後に完了した反復までの累計で、
      // 時間は打ち切られた反復も含む。両者の対応が取れないので比較に使わない。
      truncated,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
      nps:
        !truncated && result.elapsedMs > 0
          ? Math.round((result.nodes / result.elapsedMs) * 1000)
          : undefined,
      score: result.score,
      bestMove: result.bestMove,
    });
    if (result.errors.length) {
      console.error(`エンジンが標準エラー出力に書き込みました: ${result.errors.join(" / ")}`);
      process.exitCode = 1;
    }
  }
  engine.terminate();
}

if (asJSON) {
  console.log(JSON.stringify({ options, results }, null, 2));
} else {
  const columns = [
    ["局面", (r) => r.position, 12],
    ["指定深さ", (r) => r.requestedDepth, 8],
    ["到達深さ", (r) => r.reachedDepth, 8],
    ["ノード数", (r) => r.nodes, 12],
    ["時間(ms)", (r) => r.elapsedMs, 9],
    ["NPS", (r) => r.nps, 10],
    ["評価値", (r) => r.score, 9],
    ["最善手", (r) => r.bestMove, 8],
    ["打切", (r) => (r.truncated ? "*" : ""), 4],
  ];
  const pad = (value, width) => String(value ?? "-").padStart(width);
  console.log(columns.map(([label, , width]) => pad(label, width)).join(" "));
  for (const result of results) {
    console.log(columns.map(([, get, width]) => pad(get(result), width)).join(" "));
  }
  const comparable = results.filter((r) => !r.truncated);
  const total = comparable.reduce((sum, r) => sum + (r.nodes || 0), 0);
  console.log(`\n合計ノード数 (打切を除く ${comparable.length}/${results.length} 件): ${total}`);
  if (comparable.length < results.length) {
    console.log(
      "* 1 手あたりの上限 (3000ms) で打ち切られた行。ノード数と時間の対応が取れないため" +
        "比較には使えない。深さを下げるか、探索を速くしてから測り直すこと。",
    );
  }
}
