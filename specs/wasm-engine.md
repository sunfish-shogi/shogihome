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
- 早期 ponder (`enableEarlyPonder`)。`ponderhit` は常に引数無しで送る
- ファイルシステム上のエンジンの追加 (`showSelectUSIEngineDialog` は従来通りエラーを返す)

## go コマンドの予約

思考中に次の `go` の要求が来ることがある。検討で局面を切り替えたときと、
ponder が外れたときである。この場合 `go` をすぐには送らず、次の手順を踏む
(Electron 版の `src/background/usi/engine.ts` と同じ)。

1. `go` を予約して `stop` を送る
2. `bestmove` を受け取る
3. 予約しておいた `position` と `go` を送る

`go ponder` を `stop` した場合の `bestmove` は本譜の指し手ではないので、
`USIPlayer` には報告せずに捨てる (状態 `waitingForPonderBestMove`)。
これを怠ると、外れた ponder の結果を次の局面に対する着手として採用してしまう。

`isready` の応答を待っている間に来た `go` も同様に予約し、`readyok` の後に送る。

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
組み込みエンジンは「Lv. 2」「Lv. 3」として別の名前で表示されるため、両者は区別できる。

## モバイル表示の対局メニュー

`src/renderer/view/menu/MobileGameMenu.vue` は画面が狭く名前を並べきれないため、
強さをレベルで表す (`Lv. 1 居飛車` のような表記)。

| レベル | 実体                                         |
| ------ | -------------------------------------------- |
| Lv. 1  | TypeScript 実装の簡易エンジン (「初心者」)   |
| Lv. 2  | 組み込みエンジンの Lv. 2 プリセット (深さ 3) |
| Lv. 3  | 組み込みエンジンの Lv. 3 プリセット (深さ 5) |

ボタンの表記とプリセットのレベルは揃えてある。棋譜に残る対局者名には
`ShogiHome Lv. 2 (居飛車)` のような正式な名前を使う。

Lv. 1 は `es://basic-engine/*` なので `PlayerSettings.usi` を持たない。
Lv. 2 以降は USI エンジンとして扱うので設定の実体が要る。
`buildOpponentSettings()` がこの違いを吸収する。

## キャッシュ

`vite.config-pwa.mts` で次のように扱う。

- `engines/**/*.{wasm,json}` は事前キャッシュする (オフラインでも対局できるように)
- 評価パラメータなどの大きなファイル (`.data` / `.bin` / `.nnue`) は事前キャッシュせず、
  `runtimeCaching` の `CacheFirst` で実際に使われたものだけを保持する

**データファイルの名前には内容のハッシュを含めること** (`eval-a1b2c3.bin` のように)。
`engine.json` からはその名前で参照する。

事前キャッシュされる `.wasm` と `.json` は Workbox が内容ごとに revision を持つので
更新版で必ず入れ替わるが、`CacheFirst` のデータファイルにはそれが無い。同じ URL のまま
中身を差し替えると、既に取得済みの利用者には最大 90 日間 古いファイルが返り続け、
**新しいエンジンが古い評価パラメータを読む**状態になる。名前を変えれば URL が変わるので
この不一致は起きない。

`StaleWhileRevalidate` に変えるのは避ける。数 MB のファイルを起動のたびに取り直すことになり、
事前キャッシュを避けた意味が無くなる。名前にハッシュを入れてあれば `CacheFirst` と
90 日の保持期間がむしろ最適な設定になる。

## 参照実装: basic エンジン

ShogiHome 自身が持つエンジン。仕様の参照実装と適合性テストの被検体を兼ねる。
`src/renderer/players/basic.ts` (`BasicPlayer`) より強く、TypeScript 実装とは別物として
「Lv. 2」「Lv. 3」の名前で一覧に並ぶ。

**評価関数・探索・時間制御の中身と、改良の候補・動作確認の手順は
[`basic-engine.md`](./basic-engine.md) にまとめてある。** ここでは
ShogiHome との接点になる部分だけを説明する。

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
(Lv. 2 は数十ミリ秒で終わる) ため、既定では無効にしている。

`go ponder` に渡される局面は、予想した 1 手を指した後のもの
(`USIPlayer.startPonder` が `bestmove` の `ponder` を局面に追加する) なので、
予想が当たった場合は読んでいた局面がそのまま本譜になる。

### プリセット

`Style` (居飛車・振り飛車) と `Depth` (3・5) の組み合わせを 4 つのプリセットとして公開する。

| プリセット ID                  | 表示名           | `Style`        | `Depth` |
| ------------------------------ | ---------------- | -------------- | ------- |
| `basic-level2-static-rook-v1`  | Lv. 2 (居飛車)   | `static_rook`  | 3       |
| `basic-level2-ranging-rook-v1` | Lv. 2 (振り飛車) | `ranging_rook` | 3       |
| `basic-level3-static-rook-v1`  | Lv. 3 (居飛車)   | `static_rook`  | 5       |
| `basic-level3-ranging-rook-v1` | Lv. 3 (振り飛車) | `ranging_rook` | 5       |

**名前と ID は深さではなくレベルで表す。** `Depth` はオプションとして 1〜5 の範囲で
変更できてしまい、変更するとモバイル表示のレベルとも一覧の名前とも食い違うため、
深さを名前に含めない。エンジン自身の名前 (`id name`) も同じ理由で
`ShogiHome Basic Engine` とし、強さを含めない。

深さ違いを `Depth` オプションの変更ではなく別のプリセットにしているのは、

- 一覧に並ぶ名前と実際の強さが (既定値のままなら) 一致する
- モバイル表示は URI を選ぶだけで済み、オプション値を上書きしなくてよい
- Lv. 2 対 Lv. 3 の対局や連続対局をそのまま組める

ため。

`Style` の `random` は TypeScript 実装のランダムプレイヤーと重複するため、
プリセットには含めていない。

深さ 5 は序盤なら 150ms 程度で読み切るが、中盤以降は 1 手あたりの上限
(3000ms) に達して深さ 4 で打ち切られることが多い。

### ビルド

```bash
npm run engines:build
```

Emscripten を次の順で探す。

1. Docker (`emscripten/emsdk` イメージ。バージョンは `scripts/build-engines.mjs` で固定)
2. 環境変数 `EMSDK` (`emsdk_env.sh` を読み込んだ状態)
3. `PATH` 上の `emcmake`

**Docker を優先するのは生成物を commit する運用だから。** バージョンを固定したイメージなら
誰がビルドしても同じ結果になるが、ローカルの Emscripten はバージョンがまちまちで、
無関係な差分が commit に混ざる。ローカルを使いたい場合は `ENGINES_NO_DOCKER=1` を指定する
(Docker のデーモンが動いていない場合も自動でローカルへ切り替わる)。

生成物はリポジトリに commit する。`docs/webapp` を commit している既存の運用と同じ考え方で、
Emscripten の無い環境でも `npm run build` と `npm test` が通り、commit 済みの wasm に対する
回帰テストを CI で実行できる。

ネイティブビルド (デバッグとテスト用) は Emscripten を必要とせず、
CMake と C++20 のコンパイラだけで動く。

```bash
npm run engines:test      # ビルドして C++ のテスト (CTest) を実行する
npm run engines:native    # ビルドのみ。engines/build-native/basic を対話実行できる
```

エンジンを改良したときの確認手順 (ベンチマーク・自己対局) は
[`basic-engine.md`](./basic-engine.md) の「動作確認の方法」を参照。

commit 済みの wasm に対するテストは `npm test` に含まれている (`src/tests/engines/`)。
手順の詳細は [`engines/README.md`](../engines/README.md) を参照。
