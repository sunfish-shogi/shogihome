# 既存の将棋エンジンを WebAssembly として取り込む手順

`specs/wasm-engine.md` で説明している仕組みに、既存の C++ 製 USI エンジンを載せるための手引き。
`engines/basic/` は ShogiHome 自身が書き下ろしたエンジンだが、外部のエンジンを取り込む場合は
事情が異なるため、判断が必要になる点を中心にまとめる。

前提として C++ (C++17 以降) で書かれ、USI プロトコルに対応したエンジンを想定する。
Rust など他言語でも `wasm32-unknown-emscripten` などを経由すれば同じ契約を満たせるが、
ここでは扱わない。

---

## 0. 最初に確認すること

取り込みの可否は、ほぼ次の 4 点で決まる。**着手前に必ず確認する。**

| 確認事項                 | 問題になる例                                             | 対処                              |
| ------------------------ | -------------------------------------------------------- | --------------------------------- |
| ライセンス               | GPL / AGPL のエンジンを同梱する                          | 「6. ライセンス」を参照           |
| CPU 固有命令への依存     | `_pext_u64` / AVX2 / `__builtin_ia32_*` を直接呼んでいる | 移植用のビルド構成があるか調べる  |
| スレッドへの依存         | 探索を `std::thread` で回している                        | 「3. 実行モデルの選択」を参照     |
| 評価関数ファイルのサイズ | NNUE で数十 MB、定跡でさらに数百 MB                      | 「5. 大きなデータファイル」を参照 |

多くの実用エンジンは x86 のビット演算命令に依存している。移植を想定した設定
(例: `NO_SSE` 相当のビルド構成) が用意されていない場合、そこから手を入れることになり
作業量が大きく変わる。まず**ネイティブで移植用構成のビルドが通るか**を確かめてから
Emscripten に進むこと。

---

## 1. ソースの配置

```
engines/
  core/            ShogiHome 自身のエンジン用。外部エンジンでは使わない。
  basic/
  <name>/          ← ここに置く
    README.md      取得元・バージョン・変更点を書く
    src/           上流のソース (vendoring または git submodule)
    usi_wasm.cpp   本文書で作る接続層
```

上流のソースは **vendoring (コピー) を推奨**する。git submodule はビルド済み成果物を
commit する本リポジトリの運用と噛み合わせづらく、`npm ci` だけでは取得できないため。
コピーする場合は `README.md` に取得元の URL・コミットハッシュ・加えた変更を必ず記録する。

**上流のソースには可能な限り手を入れない。** 差分は `usi_wasm.cpp` に閉じ込め、
どうしても本体の修正が必要な場合はパッチファイル (`engines/<name>/patches/*.patch`) として
残し、README に理由を書く。上流の更新時にやり直せるようにするため。

---

## 2. 接続層を作る

エンジン側が満たすべき契約は 3 つの関数だけで、`engines/core/` の `shogi::Engine` を
継承する必要は**ない**。既存エンジンは自前の局面表現と USI パーサを持っているので、
それをそのまま使う。

```cpp
// engines/<name>/usi_wasm.cpp
#include <emscripten/emscripten.h>
#include <string>

extern "C" {

// エンジンを初期化する。最初に 1 回だけ呼ばれる。
EMSCRIPTEN_KEEPALIVE void usi_init();

// USI コマンドを 1 行渡す。
EMSCRIPTEN_KEEPALIVE void usi_command(const char* line);

// 一定間隔で呼ばれる。思考の進行や締切の確認に使う。
EMSCRIPTEN_KEEPALIVE void usi_poll();

}
```

出力は標準出力に 1 行ずつ書き、末尾で `fflush(stdout)` する。Emscripten が行単位で
`Module.print` を呼び、Worker がメインスレッドへ中継する。

```cpp
void output(const std::string& line) {
  std::fputs(line.c_str(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
}
```

### main ループの置き換え

ほとんどのエンジンは次の形をしている。

```cpp
int main() {
  init();
  std::string line;
  while (std::getline(std::cin, line)) {   // ← Worker では動かない
    handle_command(line);
  }
}
```

Emscripten の標準入力は Worker では実質的に使えない (既定では即座に EOF になる)。
`main()` を呼ばずに、コマンドの受け口だけを差し替える。

```cpp
void usi_init()                    { init(); }
void usi_command(const char* line) { handle_command(line ? line : ""); }
```

エンジンの `main()` はリンクエラーを避けるため `--no-entry` と `-sINVOKE_RUN=0` で
呼ばれないようにするか、`#ifdef __EMSCRIPTEN__` で無効化する。

---

## 3. 実行モデルの選択

**ここが最も重要な判断。** 既存エンジンは「探索スレッドが走り、メインスレッドが `stop` を
受け付ける」前提で書かれているが、単一スレッドの WebAssembly ではその前提が成立しない。
次の 3 つから選ぶ。

### レベル 1: 同期ブロッキング (最小改造)

`usi_command("go ...")` の中で探索を最後まで走らせ、`bestmove` まで出力して戻る。

- **利点**: 上流のコードをほぼそのまま使える。スレッドも不要。
- **欠点**: 探索中は Worker のメッセージを処理できないため、**`stop` が効かない。**
  対局中の「中断」や、時間切れ間際の打ち切りが GUI 側から行えない。
  探索の打ち切りはエンジン自身の時間管理 (`btime` / `byoyomi` など) に完全に依存する。
- **注意**: `go infinite` (検討モード) は終わらないので、この方式では検討に使えない。
  `go infinite` を受け取ったら固定深さ・固定ノード数で打ち切るなどの代替が必要。

まず動かすことを優先するなら、この方式から始めてよい。

### レベル 2: 分割実行 (poll 方式) — 推奨

探索を中断可能にして、`usi_poll()` から少しずつ進める。`engines/basic/` と同じ契約。

- **利点**: `stop` が効く。`go infinite` も扱える。単一スレッドのまま。
- **欠点**: 探索ループに中断点を作る改造が必要。
- **やり方**: 多くのエンジンは探索の内側に「時間切れ・停止フラグを確認する」フック
  (例: 一定ノード数ごとに呼ばれる `check_time()` 相当) を持っている。ここから
  「今回の `usi_poll()` の持ち時間を使い切ったら中断して戻る」ように変更し、
  次の `usi_poll()` で続きから再開できるよう探索状態を保持する。
  反復深化なら「1 回の `usi_poll()` で 1 反復ぶん進める」粒度が実装しやすい。

`bestmove` と `checkmate` は `usi_command()` の中で出さず、必ず `usi_poll()` か
`stop` の受信時に出すこと。Worker は `go` / `ponderhit` を送った後だけ `usi_poll()` を
10ms 間隔で呼び、`bestmove` または `checkmate` の行を見たら停止する。

### レベル 3: pthreads (本来のマルチスレッド探索)

`-pthread` を付けると `std::thread` がそのまま動き、上流の構造を保てる。

- **前提**: `SharedArrayBuffer` が必要で、そのためにはページが cross-origin isolated で
  なければならない。すなわち次のレスポンスヘッダが要る。
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- **問題**: ShogiHome の Web 版は GitHub Pages で配信しており、**レスポンスヘッダを
  設定できない。** Service Worker でレスポンスにヘッダを付与して cross-origin isolation を
  成立させる手法 (いわゆる coi-serviceworker) はあるが、初回アクセス時に再読み込みが
  必要になる、既存の PWA の Service Worker と統合する必要がある、外部リソースの
  読み込みが CORP の制約を受ける、といった副作用がある。
- したがって、**この方式を採る場合は配信方法の変更まで含めて設計すること。**
  現状の `vite.config-pwa.mts` の設定のままでは動かない。

なお `-sPROXY_TO_PTHREAD` や `-sASYNCIFY` でブロッキング入出力を成立させる方法もあるが、
前者は pthreads と同じ制約を受け、後者はコードサイズと実行速度の悪化 (数割〜数倍) が大きい。

---

## 4. ビルド設定

`engines/CMakeLists.txt` にターゲットを追加する。`basic` の定義が雛形になる。

```cmake
add_executable(<name> <name>/usi_wasm.cpp <name>/src/....cpp)

if(EMSCRIPTEN)
  set_target_properties(<name> PROPERTIES SUFFIX ".js")
  target_link_options(<name> PRIVATE
    "-O3"
    "--no-entry"
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=create<Name>Engine"
    "-sENVIRONMENT=worker,node"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sINVOKE_RUN=0"
    "-sEXPORTED_FUNCTIONS=_usi_init,_usi_command,_usi_poll,_malloc,_free"
    "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap"
  )
endif()
```

エンジンによって追加が必要になりやすいもの。

| オプション                           | 用途                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `-sSTACK_SIZE=<bytes>`               | 既定は 64KB。再帰の深い探索では不足する。1MB 程度から試す。            |
| `-sINITIAL_MEMORY=<bytes>`           | 起動直後に大きな確保を行う場合。伸長のコストを避けられる。             |
| `-sMAXIMUM_MEMORY=<bytes>`           | wasm32 の上限は 4GB。ブラウザでは実質 2GB 程度と考える。               |
| `-fexceptions` / `-fwasm-exceptions` | 例外を使う場合。前者は互換性が高く、後者は速いが対応ブラウザを要確認。 |
| `-msimd128`                          | NNUE の推論などで効果が大きい。対応状況を確認して採否を決める。        |
| `-flto`                              | サイズと速度の改善。リンク時間は伸びる。                               |

`USI_Hash` の上限は必ず小さく制限する (例: 最大 256MB)。既定値のまま置換表を確保して
メモリ確保に失敗すると、ブラウザのタブごと落ちる。

### 検証

ネイティブビルドで先に動作を確かめる。`__EMSCRIPTEN__` で分岐していない部分の
バグを切り分けやすい。

```bash
cmake -S engines -B engines/build-native && cmake --build engines/build-native
echo -e "usi\nisready\nposition startpos\ngo byoyomi 1000" | engines/build-native/<name>
```

---

## 5. 大きなデータファイル (評価関数・定跡)

`engines/basic/` はデータファイルを持たないが、実用エンジンではここが最大の課題になる。

### 取得方法

| 方法                     | 向いている場面                   | 注意                                                     |
| ------------------------ | -------------------------------- | -------------------------------------------------------- |
| `--embed-file`           | 数百 KB 程度まで                 | wasm/js に埋め込まれるため、起動が重くなる               |
| `--preload-file`         | 数 MB 程度まで                   | `.data` ファイルが生成され、起動時に全て読み込む         |
| `fetch` + `FS.writeFile` | 数十 MB 以上 (推奨)              | 読み込み中の進捗を出せる。`isready` の中で行う           |
| IndexedDB (IDBFS)        | 再訪時の再ダウンロードを避けたい | 実装量が増える。まずは HTTP キャッシュで足りるか検討する |

`fetch` 方式では、Worker 側でファイルを取得して Emscripten の仮想ファイルシステムへ
書き込んでから `isready` に応答する。読み込みには時間がかかるので、
`info string loading eval file...` のような行を出して GUI 側に状況を見せるとよい。
`isready` への `readyok` が既定の 10 秒 (`USIEngineLaunchOptions.timeoutSeconds`) 内に
返らない場合はタイムアウトするため、エンジン設定側で余裕を持たせる必要がある。

### 配信とキャッシュ

`vite.config-pwa.mts` の `workbox.globPatterns` は `engines/**/*.wasm` を事前キャッシュ対象に
しているが、これは wasm 本体だけを想定した設定である。数十 MB の評価関数ファイルは

- workbox の既定の上限 (`maximumFileSizeToCacheInBytes`、2MiB) を超える
- 事前キャッシュにすると初回アクセスで全員がダウンロードすることになる

ため、事前キャッシュではなく `runtimeCaching` に `CacheFirst` のルールを足すこと。
盤・駒の画像に対する既存のルールが参考になる。

---

## 6. ライセンス

将棋エンジンは GPL で公開されているものが多い。**同梱すると ShogiHome の配布物全体が
その条件の影響を受ける可能性がある。** 取り込む前に必ず確認し、判断がつかない場合は
同梱せずに済ませる方法 (利用者が自分で読み込む形にするなど) を検討すること。

同梱する場合に必要な作業。

1. 上流の LICENSE を `engines/<name>/` にそのまま含める。
2. `engines/<name>/README.md` に取得元・バージョン・改変内容を明記する
   (GPL では改変の告知が求められる)。
3. `npm run license` を実行し、`docs/third-party-licenses` に反映する。
4. アプリ内のライセンス表示 (`openCopyright`) から辿れるようにする。

なお WebAssembly は誰でもダウンロードして解析できる形で配布される。
再配布に制限のあるバイナリ (商用エンジンなど) は載せられない。

---

## 7. 登録

ビルドが通ったら ShogiHome 側に登録する。

1. `scripts/build-engines.mjs` の `ENGINES` にターゲットを追加する。
2. `npm run engines:build` を実行し、`public/engines/<name>/` を commit する。
3. `src/renderer/wasm-engine/catalog.ts` の `BUILTIN_ENGINES` にエントリを追加する。

```ts
{
  path: "wasm:<name>/v1",                                 // 実在のパスではない識別子
  uri: `${uri.ES_USI_ENGINE_PREFIX}builtin/<name>-v1`,    // 固定値にすること
  moduleFile: "engines/<name>/<name>.js",
  defaultName: "<エンジンが id name で返す名前>",
  author: "<作者>",
  displayName: () => "<一覧に出す名前>",
  optionValues: { Threads: 1 },                           // 起動後に setoption で送る値
},
```

`uri` は必ず固定値にする。`issueEngineURI()` の時刻ベースの値を使うと、リロードのたびに
保存済みの対局設定と一致しなくなる。

カタログに書くオプション定義はエンジンの申告の写しであり、オプションダイアログの
再取得ボタン (`getUSIEngineInfo`) を押せばエンジンから取得した内容で更新される。
そのため完全に一致していなくても動作するが、初回表示のために主要なものは揃えておく。

---

## 8. テスト

`src/tests/engines/basic-wasm.spec.ts` が雛形になる。commit 済みの成果物を Node から
直接読み込んで駆動するので、Emscripten の無い CI でも実行できる。

最低限、次を確認する。

- `usi` に対する `id name` / `option` / `usiok` の応答
- `isready` に対する `readyok` (評価関数の読み込みを含めた所要時間も見る)
- 初期局面からの `go` が合法手を返すこと (tsshogi の `Position#doMove` で検証する)
- `stop` で `bestmove` が返ること (レベル 1 を選んだ場合は対象外)
- `quit` 後に出力が続かないこと

実用エンジンはネイティブ版との一致を確認したくなるが、探索は時間依存で結果が揺れるため、
**固定ノード数・固定深さで比較する**こと (`go nodes` / `go depth` に対応していれば使う)。

ブラウザでの確認は開発サーバーで行う。

```bash
npm run serve   # http://localhost:5173
```

対局ダイアログのエンジン一覧に現れること、対局が進むこと、
DevTools の Application → Workers に Worker が生成されていることを確認する。

---

## 9. チェックリスト

- [ ] ライセンスを確認し、同梱の可否を判断した
- [ ] 移植用 (CPU 固有命令に依存しない) の構成でネイティブビルドが通る
- [ ] 上流のソースへの変更を README またはパッチとして記録した
- [ ] `usi_init` / `usi_command` / `usi_poll` を実装した
- [ ] 実行モデル (レベル 1〜3) を選び、`stop` の挙動を把握している
- [ ] `USI_Hash` などメモリを確保するオプションに上限を設けた
- [ ] `Threads` を 1 に固定した (レベル 3 を選んだ場合を除く)
- [ ] データファイルの取得方法とキャッシュ方針を決めた
- [ ] `public/engines/<name>/` を commit し、サイズが妥当である
- [ ] `catalog.ts` に固定 URI で登録した
- [ ] テストを追加し、`npm test` と `npm run lint` が通る
- [ ] ブラウザで実際に対局できることを確認した
