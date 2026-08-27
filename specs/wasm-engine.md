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

## Worker と WebAssembly の間の契約

エンジンのモジュールが公開する `postMessage` / `addMessageListener` /
`removeMessageListener` / `terminate` については
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

Worker はエンジンの思考の進行には関与しない。コマンドを渡して出力を受け取るだけで、
探索を分割実行するための駆動はエンジンのモジュールの内側で完結する。

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
URI 体系が異なるため、組み込みの WebAssembly エンジンとは区別できる。

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
