# WebAssembly エンジン

Web 版 (ブラウザ / PWA) で対局相手となる USI エンジンを WebAssembly として動かすための仕組み。

Electron 版はローカルの実行ファイルを子プロセスとして起動できるが、Web 版にはその手段が無い。
そこで WebAssembly にコンパイルしたエンジンを Worker 上で動かし、
`src/renderer/ipc/web.ts` の USI API に接続する。これにより `src/renderer/players/usi.ts` の
`USIPlayer` 以降の仕組み (対局・検討・エンジン設定・オプション編集・monitor) が Web 版でも
そのまま利用できる。

エンジン側が満たすべき仕様は [`wasm-engine-abi.md`](./wasm-engine-abi.md) にある。
本文書は ShogiHome 側の作りを説明する。

## 全体構成

```
public/engines/<dir>/               ビルド済みの成果物 (リポジトリに commit する)
  engine.json                         エンジンのマニフェスト
  <module>.js / <module>.wasm

src/renderer/wasm-engine/           WebAssembly エンジンを動かす renderer 側のランタイム
  catalog.ts                          組み込みエンジンのカタログ
  manifest.ts                         engine.json の型と検証
  loader.ts                           エンジンモジュールのインターフェースと読み込み補助
  protocol.ts                         USI の行の解析と組み立て
  session.ts                          セッション管理 (状態遷移・タイムアウト)
  transport.ts                        Worker との行単位 I/O
  engine.worker.ts                    Worker エントリ

engines/                            ShogiHome 自身のエンジン (参照実装) のソース
  core/                               エンジン非依存の将棋コアと USI 入出力
    shim.js                             ABI のインターフェースを Module に生やす --pre-js
  basic/                              BasicPlayer を移植したエンジン
  tests/                              ネイティブビルド用のテスト
scripts/build-engines.mjs           参照実装の Emscripten ビルドドライバ
```

`src/renderer/wasm-engine/` は USI の汎用実装ではなく、WebAssembly として提供される
エンジンを動かすための実装である。Electron 版が扱うプロセス起動型のエンジンは対象外。

Electron 版の USI 実装 (`src/background/usi/`) には手を加えていない。renderer から background を
参照できないため独立した実装になっており、プロトコル解析の一部が重複する。
その代わり renderer 側は次の機能を持たない。

- エンジンの統計情報の収集 (`src/background/stats/`)
- prompt ウィンドウとの連携 (コマンド履歴の表示・手動送信)
- 早期 ponder のワークアラウンド
- ファイルシステム上のエンジンの追加 (`showSelectUSIEngineDialog` は従来通りエラーを返す)

## エンジンの追加

エンジンはそれぞれのリポジトリでビルドし、成果物を `public/engines/<dir>/` に配置する。
ShogiHome 側の作業は次の 2 つだけ。

1. 成果物 (`engine.json`・`<module>.js`・`<module>.wasm`・データファイル) を配置する
2. `src/renderer/wasm-engine/catalog.ts` の `BUILTIN_ENGINE_DIRS` に `<dir>` を追加する

名前・作者・オプション定義・プリセットは `engine.json` から読み取るため、
ShogiHome 側に写しを持つ必要は無い。配置したエンジンは
`src/tests/engines/conformance.spec.ts` が自動的に検証対象にする。

`engines/` にソースを置く必要があるのは ShogiHome 自身の参照実装 (`basic`) だけで、
外部のエンジンはここを通らない。

## Worker と WebAssembly の間の契約

エンジンのモジュールが公開する `postMessage` / `addMessageListener` /
`removeMessageListener` / `terminate` と、任意の `poll` については
[`wasm-engine-abi.md`](./wasm-engine-abi.md) を参照。
これらの名前は YaneuraOu の wasm ビルドに合わせてある。

Worker とメインスレッドの間のメッセージは次の通り。

| 方向            | メッセージ                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| メイン → Worker | `{ type: "launch", baseURL }` / `{ type: "send", line }` / `{ type: "terminate" }`                            |
| Worker → メイン | `{ type: "receive", line }` / `{ type: "log", message }` / `{ type: "error", message }` / `{ type: "close" }` |

`baseURL` はエンジンのディレクトリの絶対 URL で、メインスレッドが `document.baseURI` を
基準に解決して渡す (Vite の `base` が `"./"` であることと、モバイル表示の `?mobile` クエリの
影響を避けるため)。Worker はそこから `engine.json` を読み、モジュールとデータファイルを
取得してからコマンドの処理を始める。

`log` は評価パラメータの読み込み状況など、USI のやり取りに含まれない情報を伝える。
USI の行として扱われないため、セッションの状態遷移には影響しない。

Worker を止めるときは、まず `terminate` を送ってエンジン自身に後始末をさせる。
これはスレッドを持つエンジンが自前の Worker を畳めるようにするためで、
探索から制御が戻らず応答が無い場合は 1 秒後に `Worker.terminate()` で強制的に止める。

`poll` を公開しないエンジン (マルチスレッドを前提としたもの) に対しては、
Worker は何も駆動せずに出力を待つだけになる。

## 組み込みエンジンの扱い

`web.ts` の `loadUSIEngines()` は localStorage に保存された一覧に組み込みエンジンを
マージして返す。ユーザーが編集したオプション値は `mergeUSIEngine()` によって引き継がれる。
マニフェストの読み込みに失敗したエンジンは一覧から除外し、他のエンジンには影響させない。

- **URI** は `es://usi-engine/builtin/<プリセット ID>` の固定値。`issueEngineURI()` の
  時刻ベースの値を使うと、リロードのたびに保存済みの対局設定と一致しなくなるため。
- **path** は `engines/<dir>/` という public からの相対パス。
  `validateUSIEngine()` が非空の path を要求するため必要で、Worker が読み込む
  ディレクトリの指定も兼ねる。任意の URL を読み込ませないよう、この形式に合うことを
  `isBuiltinEnginePath()` で検証してから解決する。
- `USI_Hash` と `USI_Ponder` は、エンジンが宣言していなくても補完する
  (Electron 版と同じ挙動)。

TypeScript 実装の簡易エンジン (`es://basic-engine/*`、「初心者」) も従来通り一覧に並ぶ。
組み込みエンジンは「3 手読み」として別の名前で表示されるため、両者は区別できる。

## キャッシュ

`vite.config-pwa.mts` で次のように扱う。

- `engines/**/*.{wasm,json}` は事前キャッシュする (オフラインでも対局できるように)
- 評価パラメータなどの大きなファイル (`.data` / `.bin` / `.nnue`) は事前キャッシュせず、
  `runtimeCaching` の `CacheFirst` で実際に使われたものだけを保持する

## 参照実装: basic エンジン

ShogiHome 自身が持つエンジン。仕様の参照実装と適合性テストの被検体を兼ねる。
`src/renderer/players/basic.ts` (`BasicPlayer`) より強く、TypeScript 実装とは別物として
「3 手読み」の名前で一覧に並ぶ。

- **評価**: 駒割 (盤上・持ち駒とも同じ価値) と落とし穴法 (piece square table) の和。
  差分計算は駒の損得だけに使い、位置評価は末端局面でまとめて行う。
- **探索**: 反復深化 + α-β 探索 (既定 3 手読み) + 静止探索。
  静止探索は駒を取る手のみを調べ、王手されている場合は全ての手を調べる。
  指し手は駒の損得の大きい順に並べ替える。
- **千日手**: ルート局面でのみ、指した後の局面が棋譜中に 1 回以上出現していれば減点する。
- **乱数**: 同じ対局が続かないよう、ルートの評価値に 0〜3 の乱数を加える。
  ただし詰みの評価値には加えない (1 手あたり 1 しか差が無く、短い詰みを取り逃がすため)。

落とし穴法の値は駒割に対する味付けに留め、1 マスあたり最大 30 (歩 100 の 3 割) にしている。
駒組の手が駒の損得を上回らないようにするためで、乱数の幅もこれに合わせてある。

落とし穴法のテーブルは `engines/basic/pst.cpp` にある。駒の種類ごとに 9x9 の表を持ち、
先手視点で定義して後手の駒は 180 度回転したマスで参照する。玉・飛・角・金・銀は
居飛車と振り飛車で左右の使い分けが逆になるため、戦型ごとに別のテーブルを持つ。
既定値は居飛車が矢倉 (玉8八・金7八・金6七・銀7七・飛2八)、
振り飛車が美濃囲い (玉3八・金4九・金5八・銀3九) に組むように調整してある。

### 反復深化と poll

深さ 1 の探索は `go` の中で終わらせ、いつ `stop` されても指し手を返せるようにしている。
深さ 2 以降は `poll()` 1 回につき 1 反復ずつ進めるので、反復の切れ目で `stop` を
受け付けられる。これは `specs/wasm-engine-abi.md` が推奨する「分割実行」の実装例でもある。

C++ 側がエクスポートするのは `usi_command` と `usi_poll` の 2 つだけで、
ABI が定めるインターフェースは `engines/core/shim.js` (`--pre-js`) が組み立てる。
このシムはエンジンに依存しないので、他のエンジンでもそのまま流用できる。

持ち時間から 1 手あたりの上限 (100ms〜3000ms) を決め、ノード数の上限と合わせて
探索を打ち切る。打ち切られた反復の結果は破棄し、1 つ前の深さの結果を採用する。

### ponder

`USI_Ponder` の既定値は `false` で、**先読みは実装していない。**

そもそも `bestmove` に `ponder <指し手>` を付けていないため、
利用者がオプションで `USI_Ponder` を有効にしても、`USIPlayer.startPonder` は
予想手を取り出せずに何もしない。つまり**対局中に `go ponder` が送られることはない。**
以下は手動でコマンドを送った場合や、将来 `ponder` を出すようにした場合の挙動である。

- `go ponder` は `go infinite` と同じ扱いで、相手の指し手を仮定せずに
  **`position` で渡された局面をそのまま読む。** 深さを掘り終えると `WAITING` に入り、
  `stop` か `ponderhit` を待つ。この間 `bestmove` は返さない。
- `ponderhit` を受け取ると `THINKING` に戻り、最低思考時間を計り直して `bestmove` を返す。
  読んでいた局面は本譜と一致しているので、結果はそのまま使える。
- `stop` を受け取った場合はその時点の最善手を返す。

つまり「相手の手番の間に自分の手番の局面を読む」という本来の ponder ではなく、
**ponder の手順に付き合うだけ**である。相手の思考中に CPU を回す価値が薄い
(3 手読みは数十ミリ秒で終わる) ため、既定では無効にしている。

`go ponder` に渡される局面は、予想した 1 手を指した後のもの
(`USIPlayer.startPonder` が `bestmove` の `ponder` を局面に追加する) なので、
予想が当たった場合は読んでいた局面がそのまま本譜になる。

予想が外れた場合、`USIPlayer` は `stop` を送らずに次の `go` を送る
(`session.ts` の `go()` は Electron 版と違って暗黙の `stop` を送らない)。
basic エンジンは `go` を受け取った時点で状態を作り直すので問題にならないが、
`go ponder` の後に `stop` か `ponderhit` 以外を受け取ることを想定していない
エンジンでは問題になり得る。検討モードで `go infinite` を続けて送る場合も同じ。

### オプション

| 名前                  | 内容                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `Style`               | `static_rook` (居飛車) / `ranging_rook` (振り飛車) / `random` (合法手からランダム) |
| `Depth`               | 探索の深さ。既定 3                                                                 |
| `MinimumThinkingTime` | 最低思考時間 (ミリ秒)。既定 500                                                    |

`Style` の 3 種類のうち居飛車と振り飛車をマニフェストのプリセットとして公開している。
`random` は TypeScript 実装のランダムプレイヤーと重複するため、プリセットには含めていない。

### ビルド

```bash
npm run engines:build
```

Emscripten を次の順で探す。

1. 環境変数 `EMSDK` (`emsdk_env.sh` を読み込んだ状態)
2. `PATH` 上の `emcmake`
3. Docker (`emscripten/emsdk` イメージ。バージョンは `scripts/build-engines.mjs` で固定)

生成物はリポジトリに commit する。`docs/webapp` を commit している既存の運用と同じ考え方で、
Emscripten の無い環境でも `npm run build` と `npm test` が通り、commit 済みの wasm に対する
回帰テストを CI で実行できる。

ネイティブビルド (デバッグとテスト用) は次の通り。

```bash
cmake -S engines -B engines/build-native && cmake --build engines/build-native
engines/build-native/basic_test     # 移植の同等性を確認するテスト
engines/build-native/basic          # 標準入出力で対話できる USI エンジン
```
