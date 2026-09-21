# WebAssembly エンジン ABI: `shogihome-wasm-engine/1`

ShogiHome の Web 版 (ブラウザ / PWA) に載せる USI エンジンが満たすべき仕様。

エンジンはそれぞれのリポジトリでビルドし、**成果物一式を ShogiHome の
`public/engines/<dir>/` に配置する。** ShogiHome 側に C++ のソースやビルド環境は不要で、
`engine.json` を持つディレクトリはビルド時に自動で一覧に載るため、
**ShogiHome のソースを編集する必要も無い。**

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
  LICENSE.txt        ライセンス全文 (必須。「9. ライセンス」を参照)
  <module>.data      --preload-file を使う場合
  ...                その他のデータファイル
```

`<dir>` は英数字・`.`・`_`・`-` のみ。ShogiHome は `engines/<dir>/` 以外のパスを
読み込まない (`USIEngine.path` にこの形式で入り、パターンで検証される)。
**この規則から外れた名前のディレクトリを置くとビルドが失敗する。**
一覧に載せてしまうと、実行時の解決で弾かれてエンジンもライセンスも黙って消えるため。

## 2. マニフェスト (`engine.json`)

```json
{
  "abi": "shogihome-wasm-engine/1",
  "module": "engine.js",
  "moduleFormat": "esm",
  "name": "Example Engine",
  "author": "Author Name",
  "requiresCrossOriginIsolation": true,
  "licenses": [
    { "spdx": "MIT", "file": "LICENSE.txt", "source": "https://github.com/example/engine" }
  ],
  "dataFiles": [{ "url": "eval/nn.bin", "path": "/eval/nn.bin" }],
  "options": [
    { "name": "Style", "type": "combo", "default": "a", "vars": ["a", "b"] },
    { "name": "MinimumThinkingTime", "type": "spin", "default": 500, "min": 0, "max": 60000 }
  ],
  "presets": [
    {
      "id": "example-engine-v1",
      "displayName": "Example Engine",
      "values": { "Style": "a" },
      "tags": ["game"]
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
| `assetBaseURL`                 |      | wasm とデータファイルの取得先。「6. (d)」を参照                  |
| `requiresCrossOriginIsolation` |      | スレッドを使う場合は `true`。下記を参照                          |
| `licenses`                     | ○    | ライセンスの申告。「9. ライセンス」を参照                        |
| `dataFiles`                    |      | 起動時に読み込むファイル。「6. データファイル」を参照            |
| `options`                      |      | エンジンが `option` で申告する定義の写し                         |
| `presets`                      | ○    | 一覧に並べるエンジンの定義。1 つ以上                             |

### `presets`

1 つの wasm から複数のエンジンを見せるための仕組み。`values` に指定した値が
起動後に `setoption` で送られる。強さやスタイルの異なる複数のプリセットを、
1 つの wasm から見せることができる。

`values` は**そのプリセットにとっての既定値**として扱う。`options[].default`
(素のエンジンの申告の写し) より優先し、利用者がオプション画面で
「エンジンの既定値に戻す」を押したときに戻る先にもなる。

**`id` はそのまま `es://usi-engine/builtin/<id>` という URI になる。**
利用者の対局設定に保存されるため、**一度公開したら変更してはならない。**
仕様や強さを変える場合は `-v2` のように別の `id` を持つプリセットを追加する。

`displayName` は一覧に表示する名前。そのまま利用者に見せる文字列になる。

`tags` にはエンジンの用途に応じて `game` `research` `mate` の組み合わせを指定する。
ユーザー定義のタグは現在サポートされていない。

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
  mainScriptUrlOrBlob: moduleURL,
});
```

いずれも Emscripten が解釈する。`locateFile` は `.wasm` や `.data` の場所を伝えるためのもので、
ShogiHome が必ず渡す (`moduleFormat: "umd"` のときはグルーコード自身が自分の位置を
知り得ないため必須になる)。

`mainScriptUrlOrBlob` は pthread の Worker がグルーコードを読み直すための URL で、
やはり ShogiHome が必ず渡す。詳細は「8. 制約」の
「モジュール Worker と UMD の組み合わせ」を参照。

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
  FS?: { mkdir(path: string): void; writeFile(path: string, data: Uint8Array): void };
};
```

`FS` に求めるのは `mkdir` と `writeFile` だけである。Emscripten の `FS` には
`mkdirTree` や `analyzePath` のような補助もあるが、**closure コンパイラを通した
ビルド (YaneuraOu の配布物がこれ) では名前が保たれず呼び出せない。**
ShogiHome は親ディレクトリを `mkdir` で 1 階層ずつ作る
(既存のディレクトリで例外になった場合は無視し、結果は `writeFile` で判定する)。

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

エンジン本体を C++ で書く場合、上のインターフェースは `--pre-js` で渡す JavaScript の
定型コード (シム) で組み立てる。シムの実装はエンジン側で用意する。

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
`script-src` を厳しく設定した環境では動かない可能性がある。加えて、モジュール Worker では
Emscripten の環境判別が働かず、スレッドを使うエンジンでは制約が増える
(「8. 制約」の「モジュール Worker と UMD の組み合わせ」を参照)。

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

シムを使う場合は、加えて次が必要。

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
例外を投げない方法で変換する。

例外に依存した作りを変えられない場合は `-fexceptions` (または `-fwasm-exceptions`) を
付ける。コードサイズと実行速度は悪化する。

---

## 6. データファイル (評価パラメータ・定跡)

強いエンジンは評価パラメータを別ファイルから読み込む。配置方法は 3 つあり、
**サイズで使い分ける。** 加えて (d) で、wasm とデータファイルだけを配布物の外
(別のオリジン) から配信できる。

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

### (d) `assetBaseURL` で外部のオリジンから配信する

(a)〜(c) はいずれもファイルが配布物に含まれることを前提にしている。**`assetBaseURL` を
宣言すると、wasm とデータファイルだけを別の場所から取得できる。**

```json
"assetBaseURL": "https://assets.example.com/yaneuraou/v1/"
```

リポジトリと配布物にファイルを持たずに済むため、数十 MB の wasm や評価パラメータを
オブジェクトストレージ (S3 / R2 / GCS など) や CDN から配信したい場合に使う。
ホスティングの容量やファイルサイズの制限を避ける目的にも使える。

**ShogiHome は取得先を問わない。** 同一オリジンである必要も、特定の事業者である必要も無い。

#### 対象と対象外

**対象は JS 以外のアセットだけである。**

| ファイル                              | 基準                                            |
| ------------------------------------- | ----------------------------------------------- |
| `.wasm` / `--preload-file` の `.data` | `assetBaseURL` (無ければグルーコードの隣)       |
| `dataFiles[].url`                     | `assetBaseURL` (無ければマニフェストからの相対) |
| `engine.json`                         | **常に `engines/<dir>/`**                       |
| `module` (グルーコード)               | **常に `engines/<dir>/`**                       |
| `.js` / `.mjs` (`<module>.worker.js`) | **常に `engines/<dir>/`**                       |
| `licenses[].file`                     | **常に `engines/<dir>/`**                       |

後の4つが対象外なのには理由がある。

- `engine.json` とライセンス全文は**事前キャッシュの対象**で、エンジンを使っていない
  利用者がオフラインで開いてもライセンスを表示できなければならない (「9. ライセンス」)
- **JS は Worker のスクリプトとして読み直される。** `-pthread` でビルドしたエンジンは
  Emscripten が `new Worker(new URL("<module>.js", import.meta.url))` を出力し、
  古い版はスレッド用に別ファイル (`<module>.worker.js`) を出して `locateFile` で
  解決する。**Worker のスクリプトは同一オリジンでなければ構築できない**ため、
  外部に置くと `Failed to construct 'Worker': Script at '...' cannot be accessed
from origin '...'` で起動しなくなる。CORS を設定しても解決しない

そのため `locateFile` が返す先も、**JS だけはグルーコードの隣に固定する。**
これらは数百 KB にとどまるため、配布物に含めても負担にならない。

#### 書式と配置

- **https でホストを持つ URL で、末尾は `/`。** 相対パスを解決する基準になるため、
  `/` が無いと最後の要素が捨てられて別の場所を指す。クエリとフラグメントは
  解決の際に捨てられるので受け付けない。違反はマニフェストごと拒否する
- **`.wasm` と `.data` は `assetBaseURL` の直下に置く。** Emscripten が `locateFile` へ
  渡すのはファイル名だけで、エンジンのディレクトリ内の階層は伝わらない
- `dataFiles[].url` は相対パスがそのまま連結されるため、`eval/nn.bin` のような
  階層を保ったまま置ける

#### 配信側の要件

- **CORS。** `Access-Control-Allow-Origin` が無いと、モジュールの読み込みも
  `fetch` も失敗する
- **`Cross-Origin-Resource-Policy: cross-origin`。** Web 版のページは
  cross-origin isolated になる (「8. 制約」) ため、これが無い応答は `require-corp` に
  弾かれ得る。CORS が通っていれば読める経路もあるが、宣言しておくのが確実である
- **`.wasm` は `Content-Type: application/wasm`。** 違うと Emscripten が
  streaming compile を諦め、起動が遅くなる

#### キャッシュ

実行時キャッシュは外部オリジンのものも対象になる。Service Worker が事前キャッシュ済みの
`engine.json` から `assetBaseURL` を読んで、**宣言されたオリジンだけ**を対象にする
([`wasm-engine.md`](./wasm-engine.md) の「キャッシュ」)。保持の方式と期間は
同一オリジンに置いた場合と変わらない。

#### 検証

適合性テストは実体をネットワークから取得して実行する (一時ディレクトリに残すため、
2 回目以降は取り直さない)。**外部に置いた場合、テストの実行にはネットワークが要る。**

### どれを選ぶか

| サイズ       | 推奨                                  |
| ------------ | ------------------------------------- |
| ～数百 KB    | (a) 埋め込み                          |
| ～数 MB      | (b) `--preload-file`                  |
| 数 MB 以上   | (c) `dataFiles`                       |
| 数十 MB 以上 | (c)。加えて配信サイズが妥当か検討する |

(d) は大きさではなく**置き場所**の選択で、(b) (c) と組み合わせて使う。
配布物にファイルを含めたくない場合にだけ必要になる。

### ファイルの命名

`engine.json` が指すファイルは、**内容を変えたら名前も変える** (`nn-20260901.bin` のように
日付や内容のハッシュを入れる)。評価パラメータと定跡は `CacheFirst` で保持されるため、
同じ URL のままでは最大 90 日 古いものが返り続ける。

URL を安定させてよいのは `engine.json` だけである。グルーコードと wasm は
`StaleWhileRevalidate` で返した後に取り直されるため、同じ名前のままでも次回の起動には
新しいものが使われる。

---

## 7. 検証

ShogiHome の適合性テストが `public/engines/` 配下の全エンジンを自動で検証する。

```bash
npx vitest run src/tests/engines/conformance.spec.ts
```

検証内容:

- マニフェストがスキーマを満たし、`abi` が対応する版であること
- `module` と `.wasm`、`dataFiles` の実体が存在すること
  (`assetBaseURL` を宣言した場合は、その取得先から取得できること)
- `licenses` が宣言され、その `file` が存在して空でないこと
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

### モジュール Worker と UMD の組み合わせ

ShogiHome はエンジンを `type: "module"` の Worker で動かす。**モジュール Worker には
`importScripts` が無い。** Emscripten はこれで環境を判別しているため
(`ENVIRONMENT_IS_WORKER = typeof importScripts === "function"`)、
`-sEXPORT_ES6` を付けずに出力した UMD の成果物は、自分が Worker で動いていることを
認識できない。`document.currentScript` も `import.meta.url` も無いので、
**グルーコードは自分の URL を知り得ない。**

これが実際に問題になるのは pthread ビルドである。Emscripten はスレッド用の Worker へ
`Module.mainScriptUrlOrBlob || _scriptDir` を送り、受け取った側がそれを `importScripts` して
グルーコードを読み直す。どちらも無いと `undefined` が渡り、スレッド用の Worker が
その場で例外を投げる。それはメインのモジュール Worker へ再送出されて外へ出るため、
ShogiHome には Worker の `error` イベントとしてしか見えない
(**`検討の初期化中にエラーが出ました: エンジンの読み込みに失敗しました。
failed to start engine worker`**)。マニフェストにも起動処理にも誤りが無いように見えるので、
この文言が出たらここを疑うこと。

そのため ShogiHome はモジュール生成時に `mainScriptUrlOrBlob` を渡す。
**値は Blob URL ではなく元のグルーコードの URL である。**
`importScripts` される側はクラシックスクリプトとして評価されるため、
`umd` の読み込みのために末尾へ `export default` を足したソースは読めない。

`ENVIRONMENT_IS_WORKER` が偽のままである影響は他にも残る。

- wasm の取得は `WebAssembly.instantiateStreaming` を使う経路だけが生きている。
  MIME が `application/wasm` でないなどで streaming に失敗すると、
  同期 XHR による代替経路が用意されていないため、そこで起動に失敗する。
- `emscripten_is_main_browser_thread()` が真を返す。

いずれも `esm` では起こらない。**新しく作るエンジンを `esm` にすべき理由の一つである。**

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

---

## 9. ライセンス

**エンジンは ShogiHome の Web 版の配布物の一部として配信される。**
したがってライセンスの提示も配布物の側で完結していなければならない。
マニフェストの `licenses` に申告し、**全文をエンジンのディレクトリに同梱する。**

```json
"licenses": [
  { "spdx": "MIT", "file": "LICENSE.txt", "source": "https://github.com/example/engine" },
  { "subject": "評価関数パラメータ", "spdx": "CC0-1.0", "file": "eval/LICENSE.txt" }
]
```

| フィールド | 必須 | 内容                                                                              |
| ---------- | ---- | --------------------------------------------------------------------------------- |
| `spdx`     | ○    | SPDX 識別子 (`MIT` / `GPL-3.0-or-later` など)。一覧に無いものは任意の文字列でよい |
| `file`     | ○    | ライセンス全文のファイル。マニフェストからの相対パス。**必ず同梱すること**        |
| `subject`  |      | ライセンスの対象の表示名。省略時はエンジンの `name`                               |
| `source`   |      | ソースコードの入手先。https の URL のみ。コピーレフトのライセンスでは必須         |

配列なのは、エンジン本体と評価パラメータ・定跡でライセンスが異なることがあるため。
分かれる場合は `subject` に対象が分かる名前を書く。

ShogiHome はこれを読み、ライセンス表示 (メニューの「ライセンス」) に
`<subject> (<spdx>)` の項目を並べ、同梱した全文へのリンクとして開く。
`source` があれば `<subject> Source Code` の項目も並べる。

**外部サイトへのリンクだけで済ませてはならない。** リンク先は消えることがあり、
オフラインでは開けない。全文の同梱が要件で、`source` はそれを補うものである。

`engine.json` と `file` が指すファイルは事前キャッシュに含まれる。エンジンを一度も
使っていない利用者がオフラインで開いても表示できるようにするためで、
エンジンの成果物を事前キャッシュしない方針 (「6. データファイル」) の唯一の例外である。
**ライセンス全文以外のファイルをここへ書いてはならない。**

`file` の拡張子は `.txt` を推奨する。ブラウザが全文をその場で表示できるかは配信される
Content-Type 次第で、これは拡張子で決まる (GitHub Pages では `.txt` が `text/plain`、
拡張子が無いと `application/octet-stream` になり、表示ではなく保存になる)。

パーサは後方互換のため `licenses` の無いマニフェストも受け付けるが、
適合性テストが `public/engines/` 配下の全エンジンに対してこれを要求する。

`file` と `source` は検証を通らなければマニフェストごと拒否される。`file` は
上位ディレクトリを参照しない相対パスであること、`source` は URL として成立していて
スキームが https でホストを持つこと。どちらもそのままリンクとして開く値だからである
(Web 版の `openWebBrowser` は `window.open` を呼ぶだけで、他に検証する場所が無い)。

### コピーレフトのライセンス

GPL / LGPL / AGPL のエンジンを組み込むと、**結合したソフトウェア全体が
そのライセンスの条件に従う。** ShogiHome 本体は MIT で配布しているため、
このようなエンジンはこのリポジトリには置かず、別のリポジトリでビルドと配信を行う。
その配布物のライセンス表示には、エンジンのライセンスに加えて、
結合物自身のライセンスとソースの入手先も載せなければならない。
