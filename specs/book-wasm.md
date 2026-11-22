# 定跡の WebAssembly 版

定跡データの読み書きと保持を WebAssembly (Rust) で行う仕組み。
JavaScript 版より高速で、メモリの使用量も少ない。

## 対象範囲

現在 WebAssembly 版で処理するのは SBK 形式の in-memory モードのみ。

| 処理                                 | 実装                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| SBK の読み込み (in-memory)           | WebAssembly                                                                  |
| SBK の保持・検索・編集 (in-memory)   | WebAssembly                                                                  |
| SBK の保存 (in-memory)               | WebAssembly                                                                  |
| SBK への変換 (他の形式から)          | WebAssembly (一時的なストアに取り込んで書き出す)                             |
| SBK から他の形式への変換             | 読み込みは WebAssembly、書き出しは JavaScript                                |
| SBK の on-the-fly モード             | JavaScript (on-the-fly から他の形式に変換する場合の読み込みのみ WebAssembly) |
| やねうら王形式・Apery 形式・YBB 形式 | JavaScript                                                                   |

他の形式は段階的に移行する予定。

## 設定と移行期間の扱い

アプリ設定 `bookBackend` (`"wasm"` | `"js"`、既定値は `"wasm"`) で実装を選ぶ。
設定画面の「定跡」タブにある「定跡の処理方式」で変更できる。

- 設定は定跡を開いたとき (新規作成を含む) に適用される。開いている定跡の実装は閉じるまで変わらない。
- WebAssembly モジュールの初期化に失敗した場合は、ログを出力して JavaScript 版を使う。
- JavaScript 版は移行期間中の代替手段として残している。WebAssembly 版で問題が無いことを
  確認できたら JavaScript 版と設定項目を削除する。

## 構成

```
wasm/book/                         Rust のソース (依存クレート無し)
  rust-toolchain.toml                ツールチェーンのバージョンを固定する
  src/board.rs                       局面と SFEN (tsshogi と同じ規則)
  src/moves.rs                       指し手 (SBK の 32bit 表現・USI・doMove/undoMove)
  src/packed.rs                      局面のキー (256 bit の PackedSfen)
  src/proto.rs                       SBK (Protocol Buffers) の読み書き
  src/store.rs                       挿入順を保持する辞書
  src/sbk.rs                         SBK の読み込みと書き出し
  src/codec.rs                       JavaScript との受け渡し形式
  src/lib.rs                         エクスポートする関数

scripts/build-book-wasm.mjs        ビルドして binary.ts を生成する
src/background/book/wasm/
  binary.ts                          ビルド成果物 (base64)。生成物だが commit する
  codec.ts                           JavaScript との受け渡し形式
  sbk_store.ts                       ストア (Map<string, BookEntry> と同じように使える)
```

## ビルド

```bash
npm run build:book-wasm
```

`wasm/book/` のソースやツールチェーンを変更した場合は、このコマンドで
`src/background/book/wasm/binary.ts` とライセンス表示を更新して一緒に commit する。通常のビルド (`npm run build` や `npm run electron:build`) では
Rust のツールチェーンは不要。

`npm run build:book-wasm:verify` は、ビルド結果が commit 済みの `binary.ts` とライセンス表示に
バイト単位で一致するかを検証する。ツールチェーンは `rust-toolchain.toml` で固定している。
CI では `wasm/book` で `rustup toolchain install` と `cargo test --locked` を実行した後に
このコマンドを実行する。

## ライセンス表示

WebAssembly モジュールには Rust 標準ライブラリ (`core`・`alloc`・`std` と、その依存の
`compiler_builtins`・`dlmalloc`・`hashbrown`・`libm`・`memchr`・`rustc-demangle` など) のコードが含まれる。
そのライセンス表示として、ツールチェーンに同梱されている `share/doc/rust/COPYRIGHT-library.html` を
`npm run build:book-wasm` が `wasm/book/licenses/rust-standard-library.html` に複製する。
この複製も commit し、`npm run build:book-wasm:verify` で固定したツールチェーンのものと一致するか検証する。

npm の依存から生成するライセンス一覧 (`docs/third-party-licenses`) とは統合しない (Web 版では使わないため)。
配布物には electron-builder の `extraResources` で `resources/licenses/rust-standard-library.html` として入れる
(インストール後のアプリのディレクトリに展開される)。

## JavaScript 版との互換性

WebAssembly 版は JavaScript 版と同じ結果を返すことを目標とする。

- エントリーの内容・挿入順 (列挙の順序) は JavaScript 版と一致する。
- SBK の書き出し結果は JavaScript 版とバイト単位で一致する。
- キーは SFEN 文字列で、文字列として完全一致したものを同じキーとみなす (Map と同じ)。
  内部では正規形の SFEN (tsshogi の `Position.sfen` と同じ表記) を 256 bit に詰めて保持し、
  それ以外 (手数が 1 でない・玉が無い・駒が多すぎるなど) は文字列のまま保持する。
- 数値は JavaScript の number (f64) のまま保持するため、整数以外の値も失われない。

既知の相違点:

- SBK の指し手の駒番号やマスが不正な場合、JavaScript 版は不正なオブジェクトを作るが、
  WebAssembly 版はその指し手を無視する。正常なファイルでは発生しない。
- 文字列に孤立したサロゲートが含まれる場合、受け渡しの際に U+FFFD に置き換えられる。
- `get` が返すエントリーはコピーなので、変更した場合は `set` で書き戻す必要がある
  (`src/background/book/index.ts` は常に書き戻す)。

これらは `src/tests/background/book/sbk_wasm.spec.ts` と `backend.spec.ts` で、
テスト用の定跡ファイル・乱数で作った定跡・編集操作について JavaScript 版との一致を検証している。

## 関数

インスタンスごとに 1 冊の定跡を保持する。`sbk_store.ts` は定跡ごとにインスタンスを作り、
参照されなくなると GC によってメモリが解放される。

| 関数                                          | 説明                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `book_alloc(len)` / `book_free(ptr, len)`     | 引数を書き込む領域の確保と解放                                    |
| `book_result_ptr()` / `book_result_len()`     | 直前の呼び出しの結果                                              |
| `book_error_ptr()` / `book_error_len()`       | 直前に失敗した呼び出しのエラーメッセージ                          |
| `book_clear()`                                | 定跡を空にする                                                    |
| `book_size()`                                 | エントリーの数                                                    |
| `book_load_sbk(ptr, len)`                     | SBK を読み込む (0: 成功, -1: 失敗)                                |
| `book_get(ptr, len)`                          | エントリーを取得する (1: 見つかった, 0: 無い, -1: 失敗)           |
| `book_set(kptr, klen, eptr, elen)`            | エントリーを設定する (0: 成功, -1: 失敗)                          |
| `book_entries(start, count)`                  | 挿入順に最大 count 件を取得し、件数を返す                         |
| `book_get_sbk_meta()` / `book_set_sbk_meta()` | SBK の作者と説明                                                  |
| `book_save_sbk_begin()`                       | 書き出しを開始し、State の総数を返す                              |
| `book_save_sbk_next(max)`                     | 最大 max 件の State を書き出し、件数を返す (0 になるまで繰り返す) |

## 受け渡し形式

数値はリトルエンディアン。文字列は `u32` のバイト数に続く UTF-8。

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

`[ ]` はフラグが立っている場合のみ存在する。
