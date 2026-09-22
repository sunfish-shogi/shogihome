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
  LICENSE.txt                         ライセンス全文

plugins/builtin_engines.ts          エンジンの置き場所を走査して一覧を作るビルド時のプラグイン

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

エンジンはそれぞれのリポジトリでビルドし、**成果物 (`engine.json`・`<module>.js`・
`<module>.wasm`・データファイル・ライセンス全文) を `public/engines/<dir>/` に置くだけでよい。**

`engine.json` を持つディレクトリはビルド時に自動で列挙され
([`plugins/builtin_engines.ts`](../plugins/builtin_engines.ts))、`catalog.ts` の
`BUILTIN_ENGINE_DIRS` になる。**ShogiHome のソースを編集する必要は無い。**
別のリポジトリのビルドスクリプトから成果物を配置してビルドすれば、
エンジンを足した版を作れる。

別のリポジトリでは `public/engines/` へコピーせず、ビルドプロファイルの `engines.dirs` で
置き場所を指すこともできる ([`build-profile.md`](./build-profile.md))。この場合も
実行時のパスは `engines/<dir>/` で変わらず、ビルドの出力と開発サーバーの配信は
同じプラグインが受け持つ。

名前・作者・オプション定義・プリセット・ライセンスは `engine.json` から読み取るため、
ShogiHome 側に写しを持つ必要も無い。配置したエンジンは
`src/tests/engines/conformance.spec.ts` が自動的に検証対象にする。

一覧はビルド時に確定するため、開発サーバーの起動中にエンジンを追加した場合は
サーバーを再起動する。

別のリポジトリからエンジンを組み込んだ版をビルドする手順は
[`build-profile.md`](./build-profile.md) を参照。

## ライセンス表示

**Web 版はエンジンを配布物に含むため、そのライセンスを表示する義務を負う。**
(Electron 版は `.electron-builder.config.mjs` の `files` に `engines/` を含めないため、
エンジンを配布しない。)

エンジンのライセンスはマニフェストの `licenses` が持ち、全文はエンジンのディレクトリに
同梱される ([`wasm-engine-abi.md`](./wasm-engine-abi.md) の「9. ライセンス」)。
`catalog.ts` の `loadBuiltinEngineLicenses()` が `BUILTIN_ENGINE_DIRS` の
マニフェストからこれを集め、`renderer/helpers/copyright.ts` が
ライセンス表示 (メニューの「ライセンス」) の項目に変換する。

```
Copyright and License
├ ShogiHome                      MIT (リポジトリの LICENSE)
├ Third Party Libraries          third-party-licenses.html (npm の依存)
├ Material Icons
├ Sunfish4-Lite (MIT)            engines/sunfish4-lite/LICENSE.txt (同梱)
└ Sunfish4-Lite Source Code      licenses[].source
```

`third-party-licenses.html` は `scripts/report-license.mjs` が npm の依存から生成するもので、
**npm パッケージではないエンジンはそこに現れない。** エンジンのライセンスがマニフェスト
経由で表示に載るのはこのためである。

マニフェストを読み込めなかったエンジンは項目から除外する。表示そのものは妨げない。

**オフラインでも表示できなければ意味が無い**ので、`engine.json` とライセンス全文は
事前キャッシュに含める。どのファイルが要るかはマニフェストの `licenses[].file` が
宣言しているため、`vite.config-pwa.mts` がビルド時にそれを読んで
`additionalManifestEntries` へ積む (拡張子や名前を決め打ちしない)。
エンジンの成果物を事前キャッシュしない方針の唯一の例外で、合計でも数 KB にしかならない。

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

マニフェストが `assetBaseURL` を宣言している場合、**wasm とデータファイルだけ**は
その URL を基準に取得する ([`wasm-engine-abi.md`](./wasm-engine-abi.md) の「6. (d)」)。
`engine.json`・グルーコード・ライセンス全文は常に `engines/<dir>/` から読む。
メインスレッドが渡すのは変わらずエンジンのディレクトリで、取得先の判断は Worker が
マニフェストを読んでから行う。

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
- **プリセットの値はオプションの `default` に入れる。** `value` (ユーザーが編集した値)
  ではない。オプション画面の「エンジンの既定値に戻す」が戻す先は `default` であり、
  `value` に入れているとリセットで素のエンジンの既定値まで戻ってしまう。
  `value` を空に保つことで、ユーザーが編集したかどうかの区別も付く。
- **`defaultName` もプリセットの `displayName`。** マニフェストの `name` を入れると、
  表示名をリセットしたときに全てのプリセットが同じ名前になり、一覧で見分けが付かない。

オプション画面 (`USIEngineOptionsDialog`) は、通常はエンジンを起動し直して
`option` の申告を取得する。**組み込みエンジンではこれを行わず、一覧が持つ定義を
そのまま使う。** 定義の出どころはマニフェストであり、実機から取り直すと
マニフェストの既定値とプリセットの値が失われるため。エンジンを起動しないので、
オプションを見るだけのために成果物 (wasm・評価パラメータ) を取得することも無くなる。
その代わり、マニフェストが `options` を省略した場合は、エンジンが申告するオプションが
画面に並ばない。

TypeScript 実装の簡易エンジン (`es://basic-engine/*`、「初心者」) も従来通り一覧に並ぶ。
URI 体系が異なるため、組み込みの WebAssembly エンジンとは区別できる。

## モバイルの対局メニュー

モバイルウェブの対局メニュー (`MobileGameMenu.vue`) に並ぶ対局相手も、マニフェストが
決める。`catalog.ts` の `loadMobileGamePlayers()` が `BUILTIN_ENGINE_DIRS` の
マニフェストから `mobileGame` を宣言したプリセットを集め、その `label` をボタンに出す
([`wasm-engine-abi.md`](./wasm-engine-abi.md) の「`mobileGame`」)。**プリセットの追加・
削除・レベル名の変更は `engine.json` の編集だけで反映され、ShogiHome 側にプリセットの
一覧を持たない。**

- 並び順はエンジンのディレクトリの順と、その中では `presets` の配列の順
- 棋譜に残す名前は `mobileGame.label` ではなくエンジンの正式な名前 (`displayName`)。
  メニューのラベルはボタンの幅に合わせた短い表記でしかない
- 簡易エンジン (`es://basic-engine/*`) はマニフェストを持たないため、従来通り
  `MobileGameMenu.vue` が持ち、一覧の先頭に並ぶ
- マニフェストの読み込みは非同期なので、終わるまでは簡易エンジンだけが並ぶ。
  読み込めなかったエンジンはメニューから除外し、理由を画面に出す
  (組み込みエンジンの一覧と同じ扱い)

## キャッシュ

設定は [`src/sw.js`](../src/sw.js)、全体像は
[`webapp-update.md`](./webapp-update.md) を参照。エンジンの成果物は**事前キャッシュせず**、
実際に使われたものだけを実行時キャッシュに保持する (エンジンの利用はオンラインが前提)。

例外はライセンス表示に要るもの (`engine.json` とライセンス全文) だけで、
これらは事前キャッシュに含める (「ライセンス表示」を参照)。

| 対象                                          | 方式                      | 保持           |
| --------------------------------------------- | ------------------------- | -------------- |
| `engine.json` とライセンス全文                | 事前キャッシュ            | アプリの更新時 |
| `engines/**/*.{json,js,wasm}`                 | `StaleWhileRevalidate`    | 60 件 / 90 日  |
| 評価パラメータ・定跡 (`.data`/`.bin`/`.nnue`) | `CacheFirst` (Range 対応) | 20 件 / 90 日  |

`StaleWhileRevalidate` は返した後に取り直すため、同じ URL のまま中身を差し替えても
次回の起動には新しいものが使われる。いっぽう `CacheFirst` は取得済みならネットワークへ
行かないので、同じ URL のままでは最大 90 日 古いファイルが返り続ける。

そのため **URL を安定させるのは `engine.json` だけとし、それが指すファイルは内容が
変わったら名前を変える** ([`wasm-engine-abi.md`](./wasm-engine-abi.md) の「ファイルの命名」)。

大きなファイルを `StaleWhileRevalidate` に変えるのは避ける。起動のたびに取り直すことになり、
事前キャッシュを避けた意味が無くなる。名前が内容ごとに変わるなら `CacheFirst` と
90 日の保持期間がむしろ最適な設定になる。

### `assetBaseURL` で外部に置かれたアセット

マニフェストが `assetBaseURL` を宣言している場合、wasm と評価パラメータは
`engines/<dir>/` の外から配信される。方式と保持期間は上の表と同じだが、
照合の仕方が異なる。

**Workbox の正規表現ルートは、クロスオリジンの URL には先頭から一致しなければ当たらない。**
そのためパスで書いたルートでは拾えず、取得先を知る必要がある。

その一覧はマニフェストが持っている。`engine.json` はライセンス表示のために事前キャッシュ
されているので、**ビルド時に値を注入する仕組みを足さなくても Service Worker 自身が読める。**
配信物と食い違わないのが利点である。

**保持するのは取得先の URL そのもので、オリジンではない。** `assetBaseURL` は同じ
オリジンの `engines/` の外を指すこともあるため、オリジンでは絞り込みにならず、
逆に取得先と無関係なファイルまで拾ってしまう。判定は URL の前方一致で行う。

ただし**ルートの照合は同期でなければならない** (Workbox の `findMatchingRoute` は
`Promise` を真として扱うため、非同期のマッチャは全ての要求に一致してしまう)。
そこで照合は拡張子で行い、エンジンのものかどうかの判定はハンドラで行って、
対象外ならキャッシュを介さずそのまま `fetch` する。
