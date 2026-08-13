# engines

ShogiHome 自身が持つ WebAssembly エンジンのソース。**参照実装**であり、
ここに置く必要があるのは ShogiHome が書き下ろしたエンジンだけである。

外部のエンジンはそれぞれのリポジトリでビルドし、成果物を `public/engines/<dir>/` に
配置するだけでよい。このディレクトリは通らない。

- 仕様 (エンジン側が満たすべきもの): [`specs/wasm-engine-abi.md`](../specs/wasm-engine-abi.md)
- 仕組み (ShogiHome 側の作り): [`specs/wasm-engine.md`](../specs/wasm-engine.md)

## 構成

| ディレクトリ | 内容                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| `core/`      | エンジン非依存の将棋コア (局面・指し手生成・合法手判定・SFEN) と USI 入出力 |
| `basic/`     | `src/renderer/players/basic.ts` (BasicPlayer) を移植したエンジン            |
| `tests/`     | ネイティブビルドで動かす移植の同等性テスト                                  |

## ビルド

```bash
npm run engines:build                 # Emscripten でビルドし public/engines/ へ配置する

cmake -S engines -B engines/build-native && cmake --build engines/build-native
engines/build-native/basic_test       # テスト
engines/build-native/basic            # 標準入出力で対話できる USI エンジン
```
