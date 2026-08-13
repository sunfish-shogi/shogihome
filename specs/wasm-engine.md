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
  protocol.ts                         USI の行の解析と組み立て
  session.ts                          セッション管理 (状態遷移・タイムアウト)
  transport.ts                        Worker との行単位 I/O
  engine.worker.ts                    Worker エントリ

engines/                            ShogiHome 自身のエンジン (参照実装) のソース
  core/                               エンジン非依存の将棋コアと USI 入出力
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

エンジンがエクスポートする `usi_init` / `usi_command` / `usi_poll` の 3 関数と、
`bestmove` を `usi_command()` の中で出さない規約については
[`wasm-engine-abi.md`](./wasm-engine-abi.md) を参照。

Worker とメインスレッドの間のメッセージは次の通り。

| 方向            | メッセージ                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| メイン → Worker | `{ type: "launch", baseURL }` / `{ type: "send", line }`                                                      |
| Worker → メイン | `{ type: "receive", line }` / `{ type: "log", message }` / `{ type: "error", message }` / `{ type: "close" }` |

`baseURL` はエンジンのディレクトリの絶対 URL で、メインスレッドが `document.baseURI` を
基準に解決して渡す (Vite の `base` が `"./"` であることと、モバイル表示の `?mobile` クエリの
影響を避けるため)。Worker はそこから `engine.json` を読み、モジュールとデータファイルを
取得してからコマンドの処理を始める。

`log` は評価パラメータの読み込み状況など、USI のやり取りに含まれない情報を伝える。
USI の行として扱われないため、セッションの状態遷移には影響しない。

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

Web 版では TypeScript 実装の簡易エンジン (`es://basic-engine/*`) を選択肢に出さない
(`PlayerSelector.vue`)。同等のものが組み込みエンジンとして一覧に並ぶため。
保存済みの設定がこれらの URI を指している場合は従来通り `BasicPlayer` が使われる。

## キャッシュ

`vite.config-pwa.mts` で次のように扱う。

- `engines/**/*.{wasm,json}` は事前キャッシュする (オフラインでも対局できるように)
- 評価パラメータなどの大きなファイル (`.data` / `.bin` / `.nnue`) は事前キャッシュせず、
  `runtimeCaching` の `CacheFirst` で実際に使われたものだけを保持する

## 参照実装: basic エンジン

`src/renderer/players/basic.ts` (`BasicPlayer`) の移植版で、強さを追求していない。
仕様の参照実装と適合性テストの被検体を兼ねる。移植にあたって次の挙動を維持している。

- 駒の価値表と、指し手の差分による評価
- 疑似合法手の生成規則 (成れる場合は必ず成りを積み、桂と銀だけ不成も積む。
  打ち手は二歩などを絞り込まず、合法性の判定に委ねる)
- α-β 枝刈りを持たない深さ 2 の探索、末端での静的交換評価
- 一様乱数 (0 以上 10 未満) によるタイブレーク
- ルート局面でのみ、指した後の局面が棋譜中に 1 回以上出現していれば -1000
- 合法手が無い場合は `bestmove resign`

`BasicPlayer` の 3 種類 (居飛車 / 振り飛車 / ランダム) は USI オプション `Style` で切り替え、
マニフェストのプリセットとして 3 つのエンジンに見せている。
擬似思考時間の 500ms は `MinimumThinkingTime` オプションになっている。
移植版は `BasicPlayer` が出していなかった `info` (深さ・ノード数・評価値・読み筋) も出力する。

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
