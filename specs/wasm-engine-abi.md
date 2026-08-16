# WebAssembly エンジン ABI: `shogihome-wasm-engine/1`

ShogiHome の Web 版 (ブラウザ / PWA) に載せる USI エンジンが満たすべき仕様。

エンジンはそれぞれのリポジトリでビルドし、**成果物一式を ShogiHome の
`public/engines/<dir>/` に配置する。** ShogiHome 側に C++ のソースやビルド環境は不要で、
登録作業は `src/renderer/wasm-engine/catalog.ts` の `BUILTIN_ENGINE_DIRS` に
ディレクトリ名を 1 行足すだけである。

ShogiHome 側の仕組みは [`wasm-engine.md`](./wasm-engine.md) を参照。

## 版

本文書は `shogihome-wasm-engine/1` を定義する。マニフェストの `abi` にこの文字列を書く。
非互換な変更を行う場合は版を上げる。ShogiHome は未知の版のマニフェストを読み込まず、
そのエンジンを一覧から除外する。

モジュールが公開するインターフェースは **YaneuraOu の wasm ビルドと同じ形**
(`postMessage` / `addMessageListener` / `removeMessageListener` / `terminate` / `FS`) に
揃えてある。C の関数 (`usi_command` / `usi_poll`) を直接呼ぶ形ではないが、
それらを JavaScript 側で包む定型のシムを用意してあるので
(「3. モジュールのインターフェース」を参照)、エンジン側の C++ の作りは変わらない。

ただし**形が揃うことと実際に動くことは別**である。YaneuraOu 本体を載せるには
pthreads の扱い (「8. 制約」) を解決する必要があり、本仕様の範囲外。

---

## 1. 成果物の構成

```
public/engines/<dir>/
  engine.json        マニフェスト (必須)
  <module>.js        Emscripten のグルーコード (必須)
  <module>.wasm      (必須)
  <module>.data      --preload-file を使う場合
  ...                その他のデータファイル
```

`<dir>` は英数字・`.`・`_`・`-` のみ。ShogiHome は `engines/<dir>/` 以外のパスを
読み込まない (`USIEngine.path` にこの形式で入り、パターンで検証される)。

## 2. マニフェスト (`engine.json`)

```json
{
  "abi": "shogihome-wasm-engine/1",
  "module": "basic.js",
  "moduleFormat": "esm",
  "name": "ShogiHome Basic Engine",
  "author": "Kubo, Ryosuke",
  "dataFiles": [{ "url": "eval/nn.bin", "path": "/eval/nn.bin" }],
  "options": [
    {
      "name": "Style",
      "type": "combo",
      "default": "static_rook",
      "vars": ["static_rook", "ranging_rook", "random"]
    },
    { "name": "MinimumThinkingTime", "type": "spin", "default": 500, "min": 0, "max": 60000 }
  ],
  "presets": [
    {
      "id": "basic-static-rook-v1",
      "displayName": "ShogiHome Basic (Static Rook)",
      "values": { "Style": "static_rook" }
    }
  ]
}
```

| フィールド     | 必須 | 内容                                                             |
| -------------- | ---- | ---------------------------------------------------------------- |
| `abi`          | ○    | `shogihome-wasm-engine/1`                                        |
| `module`       | ○    | グルーコードのファイル名。マニフェストからの相対パス             |
| `moduleFormat` |      | `esm` (既定) または `umd`。「4. グルーコードの形式」を参照       |
| `exportName`   | △    | `moduleFormat` が `umd` のとき必須。`-sEXPORT_NAME` に渡した名前 |
| `name`         | ○    | エンジンが `id name` で返す名前                                  |
| `author`       | ○    | エンジンが `id author` で返す名前                                |
| `dataFiles`    |      | 起動時に読み込むファイル。「6. データファイル」を参照            |
| `options`      |      | エンジンが `option` で申告する定義の写し                         |
| `presets`      | ○    | 一覧に並べるエンジンの定義。1 つ以上                             |

### `presets`

1 つの wasm から複数のエンジンを見せるための仕組み。`values` に指定した値が
起動後に `setoption` で送られる。ShogiHome の basic エンジンは 1 つの wasm から
居飛車・振り飛車・ランダムの 3 つを見せている。

**`id` はそのまま `es://usi-engine/builtin/<id>` という URI になる。**
利用者の対局設定に保存されるため、**一度公開したら変更してはならない。**
仕様や強さを変える場合は `-v2` のように別の `id` を持つプリセットを追加する。

`displayName` は一覧に表示する名前。ShogiHome 側で多言語化したい場合のみ、
`catalog.ts` の `DISPLAY_NAME_OVERRIDES` で上書きする。

### `options`

`usi` コマンドへの応答で申告する `option` 行の写しを JSON で書いたもの。
オプションダイアログの初期表示に使う。`order` は配列の順序から自動で決まる。

`USI_Hash` と `USI_Ponder` は、書かなくても ShogiHome 側で補完する。

省略してもエンジンは動作するが (オプションダイアログの再取得ボタンでエンジンから
取得できる)、適合性テストが `options` とエンジンの申告の一致を検証するので、
**書く場合は必ず実物と合わせること。**

## 3. モジュールのインターフェース

グルーコードの既定エクスポートは、モジュールを生成する関数でなければならない。
これは Emscripten の `-sMODULARIZE=1` の出力そのもので、ShogiHome は次のように呼ぶ。

```ts
const engine = await createEngine({
  printErr: (line) => {
    /* 標準エラー出力 */
  },
  locateFile: (path) => new URL(path, moduleURL).href,
});
```

`printErr` と `locateFile` は Emscripten が解釈する。`locateFile` は `.wasm` や `.data` の
場所を伝えるためのもので、ShogiHome が必ず渡す (`moduleFormat: "umd"` のときは
グルーコード自身が自分の位置を知り得ないため必須になる)。

標準エラー出力は**診断情報として記録するだけで、起動の失敗とは扱わない。**
Emscripten 自身が回復可能な状況 (MIME が `application/wasm` でないために
streaming compile を諦めて ArrayBuffer へ切り替える等) をここへ書くため。
起動の失敗はモジュール生成関数の reject か、Worker の外へ出た例外で判断する。

生成されたオブジェクトは次を公開する。**メソッド名は YaneuraOu の wasm ビルドと同じ。**

```ts
type EngineInstance = {
  // USI コマンドを 1 行渡す。
  postMessage(command: string): void;
  // エンジンの出力を 1 行ずつ受け取るリスナーを登録する。
  addMessageListener(listener: (line: string) => void): void;
  removeMessageListener(listener: (line: string) => void): void;
  // エンジンを終了し、内部のスレッドやリソースを解放する。
  terminate(): void;

  // 単一スレッドのエンジンが探索を分割実行するためのフック (任意)。
  poll?(): void;
  // マニフェストで dataFiles を使う場合のみ必要。
  FS?: { mkdirTree(path: string): void; writeFile(path: string, data: Uint8Array): void };
};
```

`poll()` の有無で ShogiHome の駆動の仕方が変わる。

| `poll()` | ShogiHome の動作                                                                  |
| -------- | --------------------------------------------------------------------------------- |
| ある     | `go` / `ponderhit` の後、`bestmove` か `checkmate` を受け取るまで 10ms 間隔で呼ぶ |
| ない     | 何もしない。エンジンが自力で思考を進めて出力する (マルチスレッド前提)             |

### 守るべき規約

- **`quit` または `terminate()` の後は何も出力してはならない。**
  思考中であっても `bestmove` を出さない。
- `go mate` に対応しない場合は `checkmate notimplemented` を返す。
- `stop` は即座に `bestmove` を返す。
- `bestmove` / `checkmate` を `postMessage()` の呼び出しの中で同期的に出しても
  ShogiHome は受け取れるが、その作りでは `stop` が効かなくなる (次項)。

### 実行モデル

既存エンジンは「探索スレッドが走り、メインスレッドが `stop` を受け付ける」前提で
書かれていることが多いが、単一スレッドの WebAssembly ではその前提が成立しない
(「8. 制約」を参照)。次のどちらかを選ぶ。

**分割実行 (推奨)**: 探索を中断可能にして `poll()` から少しずつ進める。
多くのエンジンは探索の内側に時間切れ・停止フラグを確認するフックを持っているので、
そこを「今回の `poll()` の持ち分を使い切ったら中断して戻る」ように変更し、
次の `poll()` で再開できるよう状態を保持する。反復深化なら
「1 回の `poll()` で 1 反復ぶん進める」粒度が実装しやすい。
`stop` が効き、`go infinite` (検討モード) も扱える。

**同期ブロッキング**: `postMessage("go ...")` の中で最後まで探索する。改造は最小で済むが、
探索中は Worker のメッセージを処理できないため **`stop` が効かず**、対局中の中断が
GUI 側から行えない。`go infinite` も終わらないので検討モードには使えない。
適合性テストの `stop` の項目も通らない。まず動かすことを優先する場合の暫定手段。

### C++ 側との接続 (シム)

エンジン本体を C++ で書く場合、上のインターフェースは JavaScript の定型コードで組み立てる。
ShogiHome の参照実装は [`engines/core/shim.js`](../engines/core/shim.js) をそのまま
`--pre-js` に渡している。**このファイルはエンジンを問わず流用できる。**

C 側は次の 2 つをエクスポートすればよい。

```cpp
extern "C" {
EMSCRIPTEN_KEEPALIVE void usi_command(const char* line) { handle_command(line ? line : ""); }
EMSCRIPTEN_KEEPALIVE void usi_poll()                    { /* 探索を少し進める */ }
}
```

出力は標準出力に 1 行ずつ書き、`fflush(stdout)` する。Emscripten が行単位で
`Module.print` を呼び、シムがそれをリスナーへ流す。

```cpp
void output(const std::string& line) {
  std::fputs(line.c_str(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
}
```

`main()` を持つエンジンは、`while (std::getline(std::cin, line))` の入力ループを
`usi_command()` に置き換える。Emscripten の標準入力は Worker では実質的に使えない
(既定で即座に EOF になる) ため、`-sINVOKE_RUN=0` で `main()` を呼ばないようにする。

マルチスレッドのエンジンや、C++ 以外で書かれたエンジンは、
シムを使わずに直接このインターフェースを実装してもよい。

## 4. グルーコードの形式

| `moduleFormat` | Emscripten のオプション | 読み込み方                                |
| -------------- | ----------------------- | ----------------------------------------- |
| `esm` (既定)   | `-sEXPORT_ES6=1`        | `import(moduleURL)` の既定エクスポート    |
| `umd`          | (指定しない)            | ソースに `export` を足してから `import()` |

`umd` は既存の配布物 (YaneuraOu の npm パッケージなど) をそのまま置くための逃げ道である。
Emscripten の `-sEXPORT_ES6` を付けない出力は `var <exportName> = ...` で終わり、
CommonJS と AMD への代入を試みるだけなので、ES モジュールとして評価しても値が取り出せない。
ShogiHome はソースを取得して末尾に `export default <exportName>;` を足し、
Blob URL 経由で `import()` する。`exportName` はソースへ文字列として埋め込むため、
識別子として妥当なものだけを受け付ける。

**新しく作るエンジンは `esm` にすること。** `umd` は Blob URL からの `import()` を伴うため、
`script-src` を厳しく設定した環境では動かない可能性がある。

## 5. ビルド設定

必須のリンクオプション。

```
-sMODULARIZE=1                  既定エクスポートがモジュール生成関数になる
-sEXPORT_ES6=1                  ES モジュールとして出力する (moduleFormat: "esm")
-sEXPORT_NAME=<任意>
-sENVIRONMENT=worker,node       worker は必須。node は適合性テストで使う
-sINVOKE_RUN=0                  main() を自動実行しない
-sALLOW_MEMORY_GROWTH=1
--no-entry                      main() を持たない場合
```

`engines/core/shim.js` を使う場合は、加えて次が必要。

```
--pre-js <path>/shim.js
-sEXPORTED_FUNCTIONS=_usi_command,_usi_poll,_malloc,_free
-sEXPORTED_RUNTIME_METHODS=ccall,cwrap
```

`dataFiles` を使う場合は `-sEXPORTED_RUNTIME_METHODS` に `FS` を追加する。

エンジンによって追加が必要になりやすいもの。

| オプション                           | 用途                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `-sSTACK_SIZE=<bytes>`               | 既定は 64KB。再帰の深い探索では不足する。1MB 程度から試す |
| `-sINITIAL_MEMORY=<bytes>`           | 起動直後に大きな確保を行う場合。伸長のコストを避けられる  |
| `-sMAXIMUM_MEMORY=<bytes>`           | wasm32 の上限は 4GB。ブラウザでは実質 2GB 程度と考える    |
| `-fexceptions` / `-fwasm-exceptions` | 例外を使う場合                                            |
| `-msimd128`                          | NNUE の推論などで効果が大きい                             |
| `-flto`                              | サイズと速度の改善。リンク時間は伸びる                    |

`USI_Hash` のようにメモリを確保するオプションには必ず上限を設ける (例: 最大 256MB)。
確保に失敗するとブラウザのタブごと落ちる。

### 例外に注意する

Emscripten は既定で例外の捕捉を無効にする (`-sDISABLE_EXCEPTION_CATCHING=1`)。
**`try` / `catch` は取り除かれ、`throw` はそのまま `abort()` になる。**
ネイティブビルドでは動く防御コードが wasm では機能しないため、次のような書き方は危険。

```cpp
try {
  depth = std::stoi(value);   // 数値でなければ throw → catch されず abort
} catch (...) {
  // wasm ではここへ来ない
}
```

`setoption` の値や `go` の引数は GUI や利用者が与えるもので、必ずしも数値とは限らない。
`std::stoi` / `std::stoll` / `std::stod` は使わず、`std::from_chars` のように
例外を投げない方法で変換する (`engines/core/usi.cpp` の `parseInteger` が実装例)。

例外に依存した作りを変えられない場合は `-fexceptions` (または `-fwasm-exceptions`) を
付ける。コードサイズと実行速度は悪化する。

---

## 6. データファイル (評価パラメータ・定跡)

強いエンジンは評価パラメータを別ファイルから読み込む。配置方法は 3 つあり、
**サイズで使い分ける。**

### (a) バイナリに埋め込む — 数百 KB まで

```
--embed-file eval/nn.bin@/eval/nn.bin
```

wasm/js に直接埋め込まれる。ファイルが増えず確実だが、そのぶん wasm が大きくなり、
起動のたびに全体をデコードすることになる。PWA の事前キャッシュ対象にもなるので、
**小さいものに限る。**

### (b) `--preload-file` で `.data` として同梱 — 数 MB まで

```
--preload-file eval@/eval
```

`<module>.data` が生成され、Emscripten がモジュール初期化時に自動で取得する。
ShogiHome 側の設定は不要だが、**起動のたびに全体を読み込む**ため、大きいと
対局開始までの待ちが長くなる。事前キャッシュはされず、`runtimeCaching` の
`CacheFirst` で保持される。

### (c) マニフェストの `dataFiles` で宣言する — 数十 MB 以上 (推奨)

```json
"dataFiles": [{ "url": "eval/nn.bin", "path": "/eval/nn.bin" }]
```

`url` はマニフェストからの相対パス (`public/engines/<dir>/` 配下に置く)、
`path` は Emscripten の仮想ファイルシステム上の書き込み先。

Worker が `fetch` で取得し、`FS.writeFile` で書き込んでからエンジンにコマンドを渡す。
エンジン側は `path` のファイルを普通に `fopen` / `std::ifstream` で読めばよい。

この方式の利点:

- 読み込みの進捗を ShogiHome 側のログに出せる
- `runtimeCaching` の `CacheFirst` で保持され、初回以降はオフラインでも使える
- 事前キャッシュに含まれないので、エンジンを使わない利用者に転送コストがかからない

注意点:

- `-sEXPORTED_RUNTIME_METHODS` に `FS` が必要
- 読み込みは `usi` を送る前に完了するため、**エンジンの起動タイムアウトに含まれる。**
  既定は 10 秒なので、大きいファイルではアプリ設定でタイムアウトを延ばす必要がある
- 拡張子が `.data` / `.bin` / `.nnue` 以外の場合は
  `vite.config-pwa.mts` の `runtimeCaching` にパターンを追加する
- ファイルは ShogiHome のリポジトリに commit されるため、リポジトリと配信物の
  サイズに直接効く。適合性テストは 1 エンジンあたり 8MB を上限として警告する

### どれを選ぶか

| サイズ       | 推奨                                  |
| ------------ | ------------------------------------- |
| ～数百 KB    | (a) 埋め込み                          |
| ～数 MB      | (b) `--preload-file`                  |
| 数 MB 以上   | (c) `dataFiles`                       |
| 数十 MB 以上 | (c)。加えて配信サイズが妥当か検討する |

---

## 7. 検証

ShogiHome の適合性テストが `public/engines/` 配下の全エンジンを自動で検証する。

```bash
npx vitest run src/tests/engines/conformance.spec.ts
```

検証内容:

- マニフェストがスキーマを満たし、`abi` が対応する版であること
- `module` と `.wasm`、`dataFiles` の実体が存在すること
- モジュールが `postMessage` / `addMessageListener` / `removeMessageListener` /
  `terminate` を公開していること
- `usi` に対して `id name` / `id author` / `usiok` を返すこと
- マニフェストの `options` がエンジンの申告と一致すること
- `isready` に対して `readyok` を返すこと
- 各プリセットの `setoption` を受け付けること
- `go` が合法手または `resign` を返すこと (tsshogi で検証)
- `stop` で即座に `bestmove` を返すこと
- `quit` および `terminate()` の後に出力しないこと
- プリセットの `id` がリポジトリ全体で一意であること
- 成果物のサイズが妥当であること

エンジン側リポジトリでは、ネイティブビルドで先に動作を確かめておくと
`__EMSCRIPTEN__` に依存しない部分のバグを切り分けやすい。

---

## 8. 制約

### `-pthread` を付けたビルドは受け付けない

インターフェースを YaneuraOu に揃えたのは形式の話であり、
**マルチスレッドの wasm が動くようになったわけではない。**

`-pthread` を付けると Emscripten は wasm のメモリを `shared` として宣言する。
これは起動時に `SharedArrayBuffer` を要求し、ブラウザはページが
cross-origin isolated でなければそれを拒否する。isolation には
`Cross-Origin-Opener-Policy: same-origin` と
`Cross-Origin-Embedder-Policy: require-corp` のレスポンスヘッダが要るが、
ShogiHome の Web 版は GitHub Pages で配信しており、これらを設定できない。

**実行時のスレッド数を 1 にしても回避できない。** 効くのはビルドフラグの有無であって、
実際に何本スレッドを作るかではない。既存エンジンを載せる場合は、
`std::thread` を使う箇所を条件コンパイルで畳んで `-pthread` 無しでビルドし、
探索を「3. 実行モデル」の分割実行に載せ替える必要がある。

マルチスレッド対応は配信方法の変更 (ヘッダを設定できる配信先、または
Service Worker による cross-origin isolation) とセットで検討する必要がある。

### その他

- 上記の理由から、`Threads` 相当のオプションはプリセットで 1 に固定すること。
- `-sPROXY_TO_PTHREAD` は pthreads と同じ制約を受ける。
  `-sASYNCIFY` は制約を受けず、探索の奥で `emscripten_sleep(0)` を呼ぶだけで
  分割実行と同じことができる (コードの改造量は小さい) が、
  コードサイズと実行速度の悪化が大きい。
- ponder は ShogiHome 側の実装はあるが検証されていない。
  対応しない場合は `USI_Ponder` の既定値を `false` にする。
