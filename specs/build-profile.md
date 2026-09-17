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

| 項目                             | 既定    | 内容                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------ |
| `features.mobileSearchTab`       | `false` | モバイルウェブの UI に「思考」タブ (エンジンの読み筋) を出す |
| `license.distribution.text`      | (無し)  | ライセンス表示に足す配布物自身の表記                         |
| `license.distribution.url`       | (無し)  | その全文の URL。`text` と対で指定する                        |
| `license.distribution.sourceURL` | (無し)  | 配布物のソースの入手先。コピーレフトのライセンスでは必須     |
| `license.thirdPartyURL`          | 本家    | npm の依存のライセンス一覧の URL                             |

### 検証

**知らないキーがあればビルドを失敗させる。** 書き間違いを黙って無視すると、設定したつもりの
項目が効かないまま配布物ができてしまうため。型が合わない場合も同様に失敗する。

URL はライセンス表示からそのままブラウザへ渡すため、**https でホストを持つ URL のみ**
受け付ける (エンジンのマニフェストの `source` と同じ規則。
[`wasm-engine-abi.md`](./wasm-engine-abi.md) の「9. ライセンス」を参照)。

プロファイルはビルド時に読み込まれる。開発サーバーの起動中に書き換えた場合は再起動すること。

## エンジンを組み込む

エンジンの成果物は `public/engines/<dir>/` に置く。`engine.json` を持つディレクトリは
ビルド時に自動で一覧に載るため、プロファイルに書く項目は無い
([`wasm-engine.md`](./wasm-engine.md) の「エンジンの追加」)。

```
shogihome-plus/                  別のリポジトリ
├── shogihome/                   ShogiHome (submodule など。無改変)
├── engines/
│   └── example/                 エンジン側リポジトリのビルド成果物
│       ├── engine.json
│       ├── example.js / example.wasm
│       └── LICENSE.txt          ライセンス全文 (同梱が要件)
├── shogihome-plus.json          ビルドプロファイル
├── LICENSE                      配布物自身のライセンス
└── build.sh
```

```bash
#!/bin/bash
# build.sh
set -eu
cd "$(dirname "$0")"
cp -r engines/* shogihome/public/engines/
cd shogihome
npm ci
SHOGIHOME_BUILD_PROFILE=../shogihome-plus.json \
  npx vite build -c vite.config-pwa.mts --outDir ../../dist
```

エンジンが仕様を満たしているかは、成果物を配置した状態で適合性テストを走らせて確認できる。

```bash
npx vitest run src/tests/engines/
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
