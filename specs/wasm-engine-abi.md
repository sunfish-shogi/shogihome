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

モジュールが公開するインターフェースは **YaneuraOu の wasm ビルドと同じ**
(`postMessage` / `addMessageListener` / `removeMessageListener` / `terminate` / `FS`) で、
ShogiHome 独自の追加は無い。C の関数 (`usi_command` / `usi_poll`) を直接呼ぶ形ではないが、
それらを JavaScript 側で包む定型のシムを用意してあるので
(「3. モジュールのインターフェース」を参照)、エンジン側の C++ の作りは変わらない。

スレッド (`-pthread`) を使うエンジンも載せられるが、`SharedArrayBuffer` を
要求するため cross-origin isolation が前提になる。マニフェストの
`requiresCrossOriginIsolation` で宣言すること (「8. 制約」も参照)。

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
  "requiresCrossOriginIsolation": true,
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

| フィールド                     | 必須 | 内容                                                             |
| ------------------------------ | ---- | ---------------------------------------------------------------- |
| `abi`                          | ○    | `shogihome-wasm-engine/1`                                        |
| `module`                       | ○    | グルーコードのファイル名。マニフェストからの相対パス             |
| `moduleFormat`                 |      | `esm` (既定) または `umd`。「4. グルーコードの形式」を参照       |
| `exportName`                   | △    | `moduleFormat` が `umd` のとき必須。`-sEXPORT_NAME` に渡した名前 |
| `name`                         | ○    | エンジンが `id name` で返す名前                                  |
| `author`                       | ○    | エンジンが `id author` で返す名前                                |
| `requiresCrossOriginIsolation` |      | スレッドを使う場合は `true`。下記を参照                          |
| `dataFiles`                    |      | 起動時に読み込むファイル。「6. データファイル」を参照            |
| `options`                      |      | エンジンが `option` で申告する定義の写し                         |
| `presets`                      | ○    | 一覧に並べるエンジンの定義。1 つ以上                             |

### `presets`

1 つの wasm から複数のエンジンを見せるための仕組み。`values` に指定した値が
起動後に `setoption` で送られる。ShogiHome の basic エンジンは 1 つの wasm から
居飛車・振り飛車・ランダムの 3 つを見せている。

**`id` はそのまま `es://usi-engine/builtin/<id>` という URI になる。**
利用者の対局設定に保存されるため、**一度公開したら変更してはならない。**
仕様や強さを変える場合は `-v2` のように別の `id` を持つプリセットを追加する。

`displayName` は一覧に表示する名前。ShogiHome 側で多言語化したい場合のみ、
`catalog.ts` の `DISPLAY_NAME_OVERRIDES` で上書きする。

### `requiresCrossOriginIsolation`

`-pthread` を付けてビルドしたエンジンは `true` にする (既定は `false`)。

このようなエンジンは起動時に `SharedArrayBuffer` を要求するため、ページが
cross-origin isolated でないと動かない。**そして isolated でない場合、
Emscripten はモジュール生成の Promise を解決も reject もしないまま止まる。**
呼び出し側からは応答が無いようにしか見えず、起動タイムアウト (既定 10 秒) を
待った末に「エンジンから応答がありません」という無関係な文言が出てしまう。

宣言しておくと ShogiHome はモジュールを生成する前に確認し、即座に
「ページの再読み込みが必要」と伝える。**スレッドを使うなら必ず書くこと。**

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

  // マニフェストで dataFiles を使う場合のみ必要。
  FS?: { mkdirTree(path: string): void; writeFile(path: string, data: Uint8Array): void };
};
```

**ShogiHome 独自の追加は無く、YaneuraOu の wasm ビルドと過不足なく同じである。**
ShogiHome はコマンドを渡して出力を受け取るだけで、思考を進めるためにモジュールの
メソッドを定期的に呼ぶようなことはしない。**エンジンは自力で思考を進める義務を負う。**
単一スレッドでそれをどう成立させるかは「実行モデル」を参照。

なお YaneuraOu は `ccall` も公開しているが、ShogiHome は呼び出し側から使わないため
本仕様では要求しない (C 関数を包むシムはモジュールの内側で `ccall` を使う)。

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
(「8. 制約」を参照)。`postMessage("go ...")` の中で最後まで探索してしまうと、
その間 Worker のイベントループが回らず、`postMessage("stop")` が届かない。
**`stop` が効かず、`go infinite` も終わらないので検討モードに使えず、
適合性テストの `stop` の項目も通らない。**

したがって単一スレッドのエンジンは、探索を中断可能にして少しずつ進めなければならない
(**分割実行**)。多くのエンジンは探索の内側に時間切れ・停止フラグを確認するフックを
持っているので、そこを「今回の持ち分を使い切ったら中断して戻る」ように変更し、
次に呼ばれたときに再開できるよう状態を保持する。反復深化なら
「1 回で 1 反復ぶん進める」粒度が実装しやすい。

**その再開を誰が駆動するかはモジュールの内側の問題で、本仕様は関与しない。**
`setInterval` でも `queueMicrotask` でも `emscripten_set_main_loop` でもよい。
C++ で書く場合は次項のシムがこれを引き受けるので、エンジン側は
「1 回呼ばれるたびに少し進む関数」を用意するだけでよい。

マルチスレッドのエンジンは探索スレッドがそのまま走るため、この節は当てはまらない。

### C++ 側との接続 (シム)

エンジン本体を C++ で書く場合、上のインターフェースは JavaScript の定型コードで組み立てる。
ShogiHome の参照実装は [`engines/core/shim.js`](../engines/core/shim.js) をそのまま
`--pre-js` に渡している。**このファイルはエンジンを問わず流用できる。**

C 側は次の 2 つをエクスポートすればよい。

```cpp
extern "C" {
EMSCRIPTEN_KEEPALIVE void usi_command(const char* line) { handle_command(line ? line : ""); }
// 探索を少し進める。戻り値は「また呼ばれる必要があるか」。
EMSCRIPTEN_KEEPALIVE int usi_poll()                     { return advance_search() ? 1 : 0; }
}
```

シムは `usi_command` を呼んだ後にタイマーを起こし、`usi_poll` が 0 を返すまで
10ms 間隔で呼び続ける。0 を返せばタイマーは止まり、次のコマンドが届くまで何もしない。
そのため **`usi_poll` は「進めるものが無い」状態で必ず 0 を返すこと。**
思考していないときはもちろん、`go infinite` / `go ponder` で `stop` や `ponderhit` を
待つだけの状態も 0 である (それらは `usi_command` として届くので、
待っている間ポーリングを続ける必要はない)。

1 のまま返し続けても動作はするが、思考していない間もタイマーが回り続ける。
逆に思考中に 0 を返すと、そこで探索が止まったまま `bestmove` が出なくなる。

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

### `-pthread` は cross-origin isolation を前提とする

`-pthread` を付けると Emscripten は wasm のメモリを `shared` として宣言する。
これは起動時に `SharedArrayBuffer` を要求し、ブラウザはページが
cross-origin isolated でなければそれを拒否する。

Web 版は Service Worker がナビゲーションのレスポンスへ
`Cross-Origin-Opener-Policy` と `Cross-Origin-Embedder-Policy` を足すため、
isolation は成立する (仕組みは
[`webapp-update.md`](./webapp-update.md) の「cross-origin isolation」を参照)。
ShogiHome の basic エンジンは `-pthread` を付けてビルドしている。

**ただし isolated にならない場合がある。** Service Worker の制御下に入る前に
ドキュメントを受け取る初回アクセスや、待ち時間の打ち切りに達した場合である。

その状態で `-pthread` ビルドのモジュールを生成しようとすると、Emscripten は
Promise を解決も reject もしないまま止まる。そのため ShogiHome は
マニフェストの `requiresCrossOriginIsolation` を見て、**生成を試みる前に**
`crossOriginIsolated` を確認し、成立していなければ即座に断って
ページの再読み込みを促す。スレッドを使うエンジンは必ず宣言すること。

**実行時のスレッド数を 1 にしても要求は消えない。** 効くのはビルドフラグの有無であって、
実際に何本スレッドを作るかではない。isolation に依存したくないエンジンは、
`std::thread` を使う箇所を条件コンパイルで畳んで `-pthread` 無しでビルドし、
探索を「3. 実行モデル」の分割実行に載せ替えること。

### 探索スレッドからの出力

Emscripten は pthread からの `fd_write` をメインスレッドへ同期で代理実行する。
そのため探索スレッドから `printf` しても、シムがメインスレッドで登録した
リスナーに届く。エンジン側で出力を受け渡す仕組みを用意する必要はない。

代理実行は同期なので、**メインスレッドを塞いだまま探索スレッドが出力すると
互いに待つ形になり得る。** `quit` の後に出力しない規約 (「守るべき規約」) は
これを避ける意味でも守ること。ShogiHome 側は応答が無い場合に 1 秒で
`Worker.terminate()` する。

### その他

- スレッドを使う場合は `-sPTHREAD_POOL_SIZE` で必要な本数を起動時に確保すること。
  Worker の生成にはイベントループへ戻る必要があり、確保しておかないと
  `pthread_create` がその場で完了できない。
- `Threads` 相当のオプションを公開する場合、上限は控えめにすること。
  スレッドの本数だけ Worker が生成され、モバイル端末では負担が大きい。
- `-sASYNCIFY` は isolation を必要とせず、探索の奥で `emscripten_sleep(0)` を
  呼ぶだけで分割実行と同じことができる (コードの改造量は小さい) が、
  コードサイズと実行速度の悪化が大きい。
- ponder は ShogiHome 側の実装はあるが検証されていない。
  対応しない場合は `USI_Ponder` の既定値を `false` にする。
