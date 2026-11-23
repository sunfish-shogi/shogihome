# 定跡の WebAssembly 版

定跡ファイルの読み込み・検索・保存を WebAssembly (Rust) で行う仕組み。
目的は大きな定跡ファイルを扱う際の速度向上であり、JavaScript 版を段階的に置き換える。

## 方針

- WebAssembly 版は常に On-the-fly モードで動作する。in-memory モードは持たない。
  - 元のファイルの内容と索引は WebAssembly 側で保持する。
  - 編集内容 (in-memory のエントリー) は JavaScript 側の `Map` で保持し、保存時に WebAssembly 側へ渡す。
  - 小さいファイルでも On-the-fly モードで開くため、JavaScript 版の in-memory モードとは保存結果が異なる
    (State の ID を振り直さない)。どちらも ShogiGUI で読み込める正しい SBK である。
- 形式ごとに WebAssembly 版を作る。WebAssembly 版がまだ無い形式は、設定によらず JavaScript 版で開く。
- 形式間の変換は、JavaScript 版と WebAssembly 版の間では連携しない。
  WebAssembly 版で開いた定跡は、WebAssembly 版が実装済みの形式にのみ変換できる (現在は SBK のみ)。
  それ以外の変換はエラーになる (移行期間中の制限)。
- 開いた定跡の実装 (JavaScript 版 / WebAssembly 版) は開いた時点で決まり、閉じるまで変わらない。

## 移行の手順

1. SBK 形式の WebAssembly 版と基盤 (ビルド・CI・ライセンス表示・ベンチマーク) ← 現在
2. やねうら王形式 → YBB 形式 → Apery 形式の WebAssembly 版。実装済みの形式の間から変換にも対応する。
3. 上書き保存 (現在は On-the-fly モードの JavaScript 版と同じく、開いているファイルへの上書き保存はできない)
4. JavaScript 版・On-the-fly 閾値の設定・JavaScript 版専用のテストの削除

手順 3 が完了するまでは、WebAssembly 版を既定値としたままリリースしない。

## 設定

アプリ設定 `bookBackend` (`"wasm"` | `"js"`、既定値は `"wasm"`) で実装を選ぶ。
設定画面の「定跡」タブにある「定跡の処理方式」で変更できる。

- WebAssembly 版を選んでいる場合、SBK 形式の On-the-fly 閾値は使われない (設定画面では無効表示になる)。
- WebAssembly モジュールの初期化に失敗した場合は、ログを出力して JavaScript 版を使う。

## 構成

```
wasm/book/                         Rust のソース (依存クレート無し)
  rust-toolchain.toml                ツールチェーンのバージョンを固定する
  licenses/rust-standard-library.html  Rust 標準ライブラリのライセンス表示 (生成物)
  src/board.rs                       局面と SFEN (tsshogi と同じ規則)
  src/moves.rs                       指し手 (SBK の 32bit 表現・USI・doMove/undoMove)
  src/packed.rs                      Packed SFEN (packed_sfen.ts と同じ規則)
  src/proto.rs                       SBK (Protocol Buffers) の読み書き
  src/entry.rs                       定跡のエントリーと統合処理 (mergeBookEntries)
  src/sbk.rs                         SBK 形式の On-the-fly 処理
  src/codec.rs                       JavaScript との受け渡し形式
  src/lib.rs                         エクスポートする関数

scripts/build-book-wasm.mjs        ビルドして book.wasm とライセンス表示を生成する
scripts/copy-book-wasm.mjs         book.wasm を Electron 版の出力先にコピーする (electron:compile の中で実行)
src/background/book/wasm/
  book.wasm                          ビルド成果物。生成物だが commit する
  codec.ts                           JavaScript との受け渡し形式
  sbk.ts                             SBK 形式
```

## ビルド

```bash
npm run build:book-wasm
```

`wasm/book/` のソースやツールチェーンを変更した場合は、このコマンドで
`src/background/book/wasm/book.wasm` とライセンス表示を更新して一緒に commit する。
通常のビルド (`npm run build` や `npm run electron:build`) では Rust のツールチェーンは不要。

`npm run build:book-wasm:verify` は、ビルド結果が commit 済みの `book.wasm` とライセンス表示に
バイト単位で一致するかを検証する。CI (`.github/workflows/test.yml` の `book-wasm`) では、
`wasm/book` で `rustup toolchain install` と `cargo test --locked` を実行した後にこのコマンドを実行する。

## 実行時の読み込み

`book.wasm` は実行時にファイルから読み込む。パスは `src/background/proc/env.ts` の `getBookWasmPath` で解決する。

| 環境                                                     | 実行するコード                                           | `book.wasm` の場所                        |
| -------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| 本番 (`electron:build`)                                  | webpack でまとめた `dist/packed/background.js` (asar 内) | `app.asar/dist/packed/book.wasm`          |
| 開発 (`electron:serve`)・プレビュー (`electron:preview`) | tsc の出力 (`dist/src`)                                  | `dist/src/background/book/wasm/book.wasm` |
| 単体テスト                                               | ソース (`src`)                                           | `src/background/book/wasm/book.wasm`      |

tsc は `.wasm` を出力先にコピーしないため、`electron:compile`・`electron:compile:serve` の中で
`scripts/copy-book-wasm.mjs` が `dist/src` と `dist/packed` にコピーする。
本番では asar に含めるため、asar の整合性検証の対象になる。

## ライセンス表示

WebAssembly モジュールには Rust 標準ライブラリ (`core`・`alloc`・`std` と、その依存の
`compiler_builtins`・`dlmalloc` など) のコードが含まれる。そのライセンス表示として、
ツールチェーンに同梱されている `share/doc/rust/COPYRIGHT-library.html` を
`npm run build:book-wasm` が `wasm/book/licenses/rust-standard-library.html` に複製する。

npm の依存から生成するライセンス一覧 (`docs/third-party-licenses`) とは統合しない (Web 版では使わないため)。
配布物には electron-builder の `extraResources` で `resources/licenses/rust-standard-library.html` として入れる
(インストール後のアプリのディレクトリに展開される)。

## SBK 形式

JavaScript 版の On-the-fly モード (`src/background/book/sbk.ts` の `loadSbkBookOnTheFly`・
`searchSbkBookEntryOnTheFly`・`storeSbkBookOnTheFly`) と同じ結果になるように移植している。

- 開く: 元のファイルを WebAssembly のメモリに直接読み込み (JavaScript 側でのコピーは無い)、
  局面をたどって Packed SFEN の索引を作る。同じ局面の State の順序が一致するよう、整列の方法も同じにしている。
- 検索: Packed SFEN の索引を二分探索する。SFEN の解析規則は `packed_sfen.ts` と同じ。
- 保存: 編集内容を元のファイルに統合して書き出す。変更の無い State は BoardKey と HandKey を取り除いて再エンコードする
  (`sbk_state_copy.ts` によるバイト単位のコピーと同じ結果になる)。

既知の相違点:

- SBK の指し手の駒番号やマスが不正な場合、JavaScript 版は不正なオブジェクトを作るが、
  WebAssembly 版はその指し手を無視する。正常なファイルでは発生しない。
- 文字列に孤立したサロゲートが含まれる場合、受け渡しの際に U+FFFD に置き換えられる。
- 開ける SBK ファイルの大きさは 1 GiB まで (後述)。

## 開けるファイルの大きさと異常終了

WebAssembly (wasm32) のメモリは 4 GiB までで、ファイルの内容に加えて局面ごとに索引が必要になる
(開く処理の途中では 1 局面あたり 70 バイト強)。限界まで攻めることはせず、現実的なファイル
(1 局面あたり 50〜90 バイト程度) を余裕を持って開ける 1 GiB を上限とする。
これを超えるファイルは、開く前に「大きすぎるため開けない」というエラーにする。

それでもメモリが不足したり、不具合でトラップが発生したりした場合 (WebAssembly モジュールの異常終了)、
異常終了したインスタンスは以後使わない。エラーの種類を細かく出し分けるのではなく、
何が失われたかを利用者に伝えることを重視する。

| 異常終了した場面 | 動作と利用者に伝える内容                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 開く処理         | 開いていた定跡はそのまま残ることを伝える。JavaScript 版に切り替えると開ける場合があることも伝える                                              |
| 検索             | 定跡を閉じ (空の定跡に置き換え)、保存していない変更が失われたこと (変更があった場合)・読み込んでいた定跡ファイルは変更されていないことを伝える |
| 保存             | 検索の場合に加えて、保存先のファイルが途中までしか書き込まれていない可能性があることを伝える                                                   |

定跡を閉じるため、以後の検索でエラーが続くことは無い。異常終了は `BookWasmCrashError` で表し、
`src/background/book/index.ts` の `handleWasmCrash` で処理する。

## テスト

JavaScript 版の廃止に備えて、テストを次の 4 種類に分けている。

| 種類                       | ファイル                                                   | JavaScript 版を廃止するとき   |
| -------------------------- | ---------------------------------------------------------- | ----------------------------- |
| ① 共通の振る舞い           | `sbk_backends.spec.ts`                                     | `backends` から `"js"` を外す |
| ② 期待出力の固定           | `sbk_wasm_golden.spec.ts` (期待値は `testdata/book/wasm/`) | そのまま残す                  |
| ② WebAssembly 版固有の動作 | `sbk_wasm_crash.spec.ts` (大きさの上限・異常終了)          | そのまま残す                  |
| ③ 新旧の一致               | `sbk_wasm_equivalence.spec.ts`                             | 削除する                      |
| ④ JavaScript 版のみ        | `index.spec.ts` の `[js]` のテスト、`sbk.spec.ts` など     | 削除する                      |

②の期待値ファイルは、③で JavaScript 版 (On-the-fly モード) の出力と一致することを確かめた入力と操作で作っている。
意図して出力を変更した場合は `UPDATE_GOLDEN=1` を付けて実行すると更新できる。

## ベンチマーク

`src/tests/background/book/onthefly.bench.ts` で、4 形式の On-the-fly モードの
開く・検索・保存 (統合)・変換の時間を測る。WebAssembly 版が実装済みの形式は両方の実装で測る。

```bash
BOOK_BENCH_POSITIONS=200000 npx vitest bench --run --reporter=verbose src/tests/background/book/onthefly.bench.ts
```

## 関数

インスタンスごとに 1 冊の定跡を保持する。`sbk.ts` は定跡ごとにインスタンスを作り、
参照されなくなると GC によってメモリが解放される。

| 関数                                      | 説明                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `book_alloc(len)` / `book_free(ptr, len)` | 引数を書き込む領域の確保と解放                                                 |
| `book_result_ptr()` / `book_result_len()` | 直前の呼び出しの結果                                                           |
| `book_error_ptr()` / `book_error_len()`   | 直前に失敗した呼び出しのエラーメッセージ                                       |
| `sbk_open(ptr, len)`                      | SBK を開く (領域の所有権は WebAssembly 側に移る)。結果は作者・説明・State の数 |
| `sbk_create()`                            | 元のファイルが無い空の定跡を作る                                               |
| `sbk_search(ptr, len)`                    | 元のファイルから局面を検索する (1: 見つかった, 0: 無い, -1: 失敗)              |
| `sbk_save_begin(ptr, len)`                | 編集内容を渡して書き出しを開始し、State の総数を返す                           |
| `sbk_save_next(max)`                      | 最大 max 件の State を書き出し、件数を返す (0 になるまで繰り返す)              |

## 受け渡し形式

数値はリトルエンディアン。文字列は `u32` のバイト数に続く UTF-8。`[ ]` はフラグが立っている場合のみ存在する。

エントリー:

```
u8      flags (1: patch, 2: minPly, 4: comment, 8: games, 16: wonBlack, 32: wonWhite, 64: sbkEvals)
[f64]   minPly
[str]   comment
[f64]   games
[f64]   wonBlack
[f64]   wonWhite
u32     指し手の数
指し手 × 指し手の数:
  str     usi
  u8      flags (1: usi2, 2: score, 4: depth, 8: count, 16: comment, 32: sbkEval, 64: sbkId)
  [str]   usi2
  [f64]   score
  [f64]   depth
  [f64]   count
  [str]   comment
  [f64]   sbkEval
  [f64]   sbkId
[u32]   評価の数 (flags に 64 がある場合)
評価 × 評価の数:
  f64     EvaluationValue
  f64     Depth
  f64     SelDepth
  i64     Nodes
  u8      flags (1: Variation, 2: EngineName)
  [str]   Variation
  [str]   EngineName
```

`sbk_save_begin` の入力は `[u32 エントリーの数, (str キー, エントリー) × エントリーの数]` (挿入順)。
