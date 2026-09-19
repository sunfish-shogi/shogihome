# ビルドプロファイル

**別のリポジトリから、ShogiHome のソースを編集せずに特別版の Web 版をビルドするための設定。**

WebAssembly エンジンを組み込んだ版を配布したい場合、エンジンの成果物を置くだけでなく、
そのエンジン向けに UI を有効にしたり、結合物自身のライセンスを表示に足したりする必要がある。
これらを JSON ファイル 1 枚で指定する。

```bash
SHOGIHOME_BUILD_PROFILE=../shogihome-plus.json npm run build
```

**環境変数を指定しなければ既定のプロファイルが使われ、通常のビルドの挙動は変わらない。**

読み込みと検証はビルド時に完結し (`plugins/build_profile.ts`)、renderer へは仮想モジュール
`virtual:shogihome/build-profile` として検証済みの値だけが渡る。

## 書式

サンプルを [`build-profile.sample.json`](./build-profile.sample.json) に置いてある
(下の例と同じ内容)。これを複製して書き換えるとよい。エンジンの置き場所を指す
`engines.dirs` だけは、置いた側でしか成立しないためサンプルには入れていない
(「エンジンを組み込む」を参照)。

```json
{
  "features": {
    "mobileSearchTab": true
  },
  "license": {
    "distribution": {
      "text": "ShogiHome+Example (GPLv3)",
      "url": "https://github.com/example/shogihome-plus/blob/main/LICENSE",
      "sourceURL": "https://github.com/example/shogihome-plus"
    },
    "thirdPartyURL": "https://example.github.io/shogihome-plus/third-party-licenses.html"
  }
}
```

| 項目                             | 既定    | 内容                                                             |
| -------------------------------- | ------- | ---------------------------------------------------------------- |
| `engines.dirs`                   | (無し)  | エンジンの置き場所。プロファイルからの相対で書く                 |
| `features.mobileSearchTab`       | `false` | モバイルウェブの UI に「思考」タブ (読み筋と評価値グラフ) を出す |
| `license.distribution.text`      | (無し)  | ライセンス表示に足す配布物自身の表記                             |
| `license.distribution.url`       | (無し)  | その全文の URL。`text` と対で指定する                            |
| `license.distribution.sourceURL` | (無し)  | 配布物のソースの入手先。コピーレフトのライセンスでは必須         |
| `license.thirdPartyURL`          | 本家    | npm の依存のライセンス一覧の URL                                 |

### 検証

**知らないキーがあればビルドを失敗させる。** 書き間違いを黙って無視すると、設定したつもりの
項目が効かないまま配布物ができてしまうため。型が合わない場合も同様に失敗する。

URL はライセンス表示からそのままブラウザへ渡すため、**https でホストを持つ URL のみ**
受け付ける (エンジンのマニフェストの `source` と同じ規則。
[`wasm-engine-abi.md`](./wasm-engine-abi.md) の「9. ライセンス」を参照)。

プロファイルはビルド時に読み込まれる。開発サーバーの起動中に書き換えた場合は再起動すること。

## エンジンを組み込む

**エンジンの成果物は別のリポジトリに置いたままでよい。** `engines.dirs` でその場所を指すと、
`engine.json` を持つディレクトリがビルド時に一覧へ載り、`engines/<dir>/` として配信される
(本家が `public/engines/` に置いているものと同じ扱い。開発サーバーでも配信される)。

```
shogihome-plus/                  別のリポジトリ
├── shogihome/                   ShogiHome (submodule など。無改変)
├── engines/                     ← engines.dirs で指す
│   └── example/                 エンジン側リポジトリのビルド成果物
│       ├── engine.json
│       ├── example.js / example.wasm
│       └── LICENSE.txt          ライセンス全文 (同梱が要件)
├── shogihome-plus.json          ビルドプロファイル
├── LICENSE                      配布物自身のライセンス
└── build.sh
```

```json
{
  "engines": {
    "dirs": ["./engines"]
  }
}
```

```bash
#!/bin/bash
# build.sh
set -eu
cd "$(dirname "$0")"/shogihome
npm ci
SHOGIHOME_BUILD_PROFILE=../shogihome-plus.json \
  npx vite build -c vite.config-pwa.mts --outDir ../../dist
```

ディレクトリ名がそのまま実行時の `engines/<dir>/` になるため、**名前は
`[A-Za-z0-9._-]+` でなければならず、本家のエンジンと重複してもいけない。**
どちらもビルドを失敗させる (置いたエンジンが黙って消えるのを防ぐため)。

エンジンが仕様を満たしているかは、同じプロファイルを渡して適合性テストを走らせれば
確認できる。`engines.dirs` のエンジンも対象になる。

```bash
SHOGIHOME_BUILD_PROFILE=../shogihome-plus.json npx vitest run src/tests/engines/
```

## ライセンスの注意

**GPL / LGPL / AGPL のエンジンを組み込むと、結合したソフトウェア全体がそのライセンスの
条件に従う。** ShogiHome 本体は MIT で配布しているため、このようなエンジンは本家の
リポジトリには置かず、別のリポジトリでビルドと配信を行う。

その配布物のライセンス表示には次が並ぶ必要がある。`license.distribution` はこのためにある。

| 項目                   | 出どころ                               |
| ---------------------- | -------------------------------------- |
| ShogiHome (MIT)        | 常に表示される                         |
| 配布物自身のライセンス | `license.distribution`                 |
| 配布物のソース         | `license.distribution.sourceURL`       |
| エンジンのライセンス   | エンジンの `engine.json` の `licenses` |
| エンジンのソース       | 同 `licenses[].source`                 |
