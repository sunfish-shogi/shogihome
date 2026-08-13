# WebAssembly エンジン

Web 版 (ブラウザ / PWA) で対局相手となる USI エンジンを WebAssembly として動かすための仕組み。

Electron 版はローカルの実行ファイルを子プロセスとして起動できるが、Web 版にはその手段が無い。
そこで C++ で書いたエンジンを Emscripten で WebAssembly にコンパイルし、Worker 上で動かして
`src/renderer/ipc/web.ts` の USI API に接続する。これにより `src/renderer/players/usi.ts` の
`USIPlayer` 以降の仕組み (対局・検討・エンジン設定・オプション編集・monitor) が Web 版でも
そのまま利用できる。

## 全体構成

```
engines/                              C++ エンジンのソース
  core/                                 エンジン非依存の将棋コアと USI 入出力
  basic/                                BasicPlayer を移植したエンジン
  tests/                                ネイティブビルド用のテスト
scripts/build-engines.mjs             Emscripten ビルドドライバ
public/engines/<name>/<name>.{js,wasm} ビルド済みの成果物 (リポジトリに commit する)

src/renderer/wasm-engine/          WebAssembly エンジンを動かす renderer 側のランタイム
  catalog.ts                          組み込みエンジンのカタログ
  protocol.ts                         USI の行の解析と組み立て
  session.ts                          セッション管理 (状態遷移・タイムアウト)
  transport.ts                        Worker との行単位 I/O
  engine.worker.ts                    Worker エントリ
```

`src/renderer/wasm-engine/` は USI の汎用実装ではなく、WebAssembly として提供される
エンジンを動かすための実装である。Electron 版が扱うプロセス起動型のエンジンは対象外。

Electron 版の USI 実装 (`src/background/usi/`) には手を加えていない。renderer から background を
参照できないため、`src/renderer/wasm-engine/` は独立した実装になっており、プロトコル解析の一部が重複する。
その代わり renderer 側は次の機能を持たない。

- エンジンの統計情報の収集 (`src/background/stats/`)
- prompt ウィンドウとの連携 (コマンド履歴の表示・手動送信)
- 早期 ponder のワークアラウンド
- ファイルシステム上のエンジンの追加 (`showSelectUSIEngineDialog` は従来通りエラーを返す)

## エンジンの追加方法

1. `engines/<name>/` に `shogi::Engine` を継承したエンジンと `main.cpp` を作り、
   `engines/CMakeLists.txt` にターゲットを追加する。
2. `scripts/build-engines.mjs` の `ENGINES` にエントリを追加する。
3. `npm run engines:build` を実行し、生成された `public/engines/<name>/` を commit する。
4. `src/renderer/wasm-engine/catalog.ts` の `BUILTIN_ENGINES` にエントリを追加する。

`engines/core/` は特定のエンジンに依存しない。局面 (`Position`)、指し手生成、合法手判定、
SFEN の入出力、USI コマンドの解釈 (`UsiDriver`) を提供する。

外部の既存エンジンを取り込む場合は `engines/core/` を使う必要は無く、
`usi_init` / `usi_command` / `usi_poll` の 3 関数だけを満たせばよい。
手順とライセンス・スレッド・評価関数ファイルの扱いは
[`specs/wasm-engine-integration.md`](./wasm-engine-integration.md) を参照。

## Worker と WebAssembly の間の契約

Emscripten の標準入力は同期的で扱いづらいため、エンジンは次の 3 つの関数をエクスポートする。

| 関数                            | 役割                                           |
| ------------------------------- | ---------------------------------------------- |
| `usi_init()`                    | エンジンを生成する。最初に 1 回だけ呼ぶ。      |
| `usi_command(const char* line)` | USI コマンドを 1 行渡す。                      |
| `usi_poll()`                    | 締切の確認などを行う。思考中に一定間隔で呼ぶ。 |

エンジンの出力は標準出力 (`Module.print`) に 1 行ずつ書き出され、Worker がメインスレッドへ中継する。

**`bestmove` と `checkmate` は `usi_command()` の中で出してはならない。** `go` を受け取った時点で
思考を終えていても、結果は `usi_poll()` (または `stop` の受信) で出力する。Worker は
`go` / `ponderhit` を送った後だけ `usi_poll()` を 10ms 間隔で呼び、`bestmove` または `checkmate` の
行を受け取った時点で停止する。

Worker とメインスレッドの間のメッセージは次の通り。

| 方向            | メッセージ                                                                       |
| --------------- | -------------------------------------------------------------------------------- |
| メイン → Worker | `{ type: "launch", moduleURL }` / `{ type: "send", line }`                       |
| Worker → メイン | `{ type: "receive", line }` / `{ type: "error", message }` / `{ type: "close" }` |

`moduleURL` はメインスレッドが `document.baseURI` を基準に解決した絶対 URL を渡す。
Vite の `base` が `"./"` であることと、モバイル表示の `?mobile` クエリの影響を避けるため。

## 組み込みエンジンの扱い

`web.ts` の `loadUSIEngines()` は localStorage に保存された一覧に組み込みエンジンをマージして返す。
ユーザーが編集したオプション値は `mergeUSIEngine()` によって引き継がれる。

- **URI** は `es://usi-engine/builtin/<id>` の固定値。`issueEngineURI()` の時刻ベースの値を使うと、
  リロードのたびに保存済みの対局設定と一致しなくなるため。
- **path** は `wasm:basic/v1?style=static_rook` のような合成値。実在のパスではないが、
  `validateUSIEngine()` が非空の path を要求するため必要で、
  `findBuiltinEngine()` がカタログを引くキーにもなる。
- `USI_Hash` と `USI_Ponder` は、エンジンが宣言していなくてもセッション側で補完する
  (Electron 版と同じ挙動)。

Web 版では TypeScript 実装の簡易エンジン (`es://basic-engine/*`) を選択肢に出さない
(`PlayerSelector.vue`)。同等のものが組み込みエンジンとして一覧に並ぶため。
保存済みの設定がこれらの URI を指している場合は従来通り `BasicPlayer` が使われる。

## basic エンジン

`src/renderer/players/basic.ts` (`BasicPlayer`) の移植版で、強さを追求していない。
移植にあたって次の挙動を維持している。

- 駒の価値表と、指し手の差分による評価
- 疑似合法手の生成規則 (成れる場合は必ず成りを積み、桂と銀だけ不成も積む。
  打ち手は二歩などを絞り込まず、合法性の判定に委ねる)
- α-β 枝刈りを持たない深さ 2 の探索、末端での静的交換評価
- 一様乱数 (0 以上 10 未満) によるタイブレーク
- ルート局面でのみ、指した後の局面が棋譜中に 1 回以上出現していれば -1000
- 合法手が無い場合は `bestmove resign`

`BasicPlayer` の 3 種類 (居飛車 / 振り飛車 / ランダム) は USI オプション `Style` で切り替える。
擬似思考時間の 500ms は `MinimumThinkingTime` オプションになっている。
移植版は `BasicPlayer` が出していなかった `info` (深さ・ノード数・評価値・読み筋) も出力する。

## ビルド

```bash
npm run engines:build
```

Emscripten を次の順で探す。

1. 環境変数 `EMSDK` (`emsdk_env.sh` を読み込んだ状態)
2. `PATH` 上の `emcmake`
3. Docker (`emscripten/emsdk` イメージ。バージョンは `scripts/build-engines.mjs` で固定)

生成物はリポジトリに commit する。`docs/webapp` を commit している既存の運用と同じ考え方で、
Emscripten の無い環境でも `npm run build` と `npm test` が通り、commit 済みの wasm に対する
回帰テスト (`src/tests/engines/basic-wasm.spec.ts`) を CI で実行できる。

ネイティブビルド (デバッグとテスト用) は次の通り。

```bash
cmake -S engines -B engines/build-native && cmake --build engines/build-native
engines/build-native/basic_test     # 移植の同等性を確認するテスト
engines/build-native/basic          # 標準入出力で対話できる USI エンジン
```

## 制約

- **単一スレッドのみ。** マルチスレッドの WebAssembly は `SharedArrayBuffer` を必要とし、
  そのためには `Cross-Origin-Opener-Policy` と `Cross-Origin-Embedder-Policy` のヘッダが要る。
  GitHub Pages ではレスポンスヘッダを設定できないため、より強いエンジンを載せる際は
  Service Worker による cross-origin isolation を別途検討する必要がある。
- 詰み探索 (`go mate`) には対応しない。`checkmate notimplemented` を返す。
- ponder には対応しない。`USI_Ponder` の既定値は `false`。
  セッション側は `go ponder` と `ponderhit` を実装しているため、対応するエンジンを追加すれば動作する。
