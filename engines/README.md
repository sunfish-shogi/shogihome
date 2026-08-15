# engines

ShogiHome 自身が持つ WebAssembly エンジンのソース。**参照実装**であり、
ここに置く必要があるのは ShogiHome が書き下ろしたエンジンだけである。

外部のエンジンはそれぞれのリポジトリでビルドし、成果物を `public/engines/<dir>/` に
配置するだけでよい。このディレクトリは通らない。

- 実装状況と改良の手引き: [`specs/basic-engine.md`](../specs/basic-engine.md)
- 仕様 (エンジン側が満たすべきもの): [`specs/wasm-engine-abi.md`](../specs/wasm-engine-abi.md)
- 仕組み (ShogiHome 側の作り): [`specs/wasm-engine.md`](../specs/wasm-engine.md)

## 構成

| ディレクトリ   | 内容                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `core/`        | エンジン非依存の将棋コア (局面・指し手生成・合法手判定・SFEN) と USI 入出力       |
| `core/shim.js` | ABI のインターフェースを Emscripten の Module に生やす `--pre-js`。エンジン非依存 |
| `basic/`       | `src/renderer/players/basic.ts` (BasicPlayer) を移植したエンジン                  |
| `tests/`       | ネイティブビルドで動かす移植の同等性テスト                                        |

## ビルドとテスト

| コマンド                   | 内容                                                       |
| -------------------------- | ---------------------------------------------------------- |
| `npm run engines:test`     | C++ のテストをビルドして実行する。**普段はこれだけでよい** |
| `npm run engines:native`   | ネイティブビルドのみ (対話実行用)                          |
| `npm run engines:build`    | WebAssembly へビルドし `public/engines/` へ配置する        |
| `npm run engines:bench`    | 固定局面のベンチマーク (探索の速さ)                        |
| `npm run engines:selfplay` | 自己対局 (探索の強さ)                                      |

### C++ のテスト

```bash
npm run engines:test
```

ネイティブビルドして CTest を実行する。必要なのは CMake と C++20 のコンパイラだけで、
Emscripten は要らない。失敗したテストの出力はそのまま表示される。

テストの中身は [`tests/basic_test.cpp`](./tests/basic_test.cpp) にある。
局面・指し手生成・USI の解析・評価・探索を、tsshogi 実装との同等性も含めて確認する。

### エンジンを対話的に動かす

```bash
npm run engines:native
./engines/build-native/basic
```

標準入出力で USI コマンドをやり取りできる。例:

```
usi
setoption name Style value ranging_rook
isready
position startpos moves 7g7f
go btime 60000 wtime 60000 byoyomi 10000
quit
```

`go` の後は `bestmove` が返るまで数百ミリ秒かかる (ネイティブビルドでは
バックグラウンドのスレッドが `poll()` を回す)。

### 強さと速さの計測

```bash
npm run engines:bench                                        速さ (ノード数・時間)
npm run engines:selfplay -- --a Depth=5 --b Depth=3 --games 20   強さ (勝率)
```

探索を改良したときは両方を見る。詳細は
[`specs/basic-engine.md`](../specs/basic-engine.md) の「動作確認の方法」を参照。

### WebAssembly のビルド

```bash
npm run engines:build
```

Emscripten を「環境変数 `EMSDK` → `PATH` 上の `emcmake` → Docker」の順に探す。
生成物 (`public/engines/basic/basic.js` と `.wasm`) はリポジトリに commit する。

commit 済みの WebAssembly に対するテストは `npm test` に含まれている
(`src/tests/engines/`)。エンジンを変更したら `npm run engines:build` で
再生成してから `npm test` を実行すること。
