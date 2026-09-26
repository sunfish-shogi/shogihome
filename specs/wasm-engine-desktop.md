# デスクトップ版の WebAssembly エンジン

デスクトップ版 (Electron) で、WebAssembly エンジンをダウンロードして使うための仕組み。

- エンジン管理画面の「ダウンロード」から、一覧に載ったエンジンを取得して登録できる
- 既存の「追加」は、ローカルのファイルを選ぶ操作であることが分かるよう「ファイルから追加」とした

エンジン側が満たすべき仕様は [`wasm-engine-abi.md`](./wasm-engine-abi.md)、Web 版の作りは
[`wasm-engine.md`](./wasm-engine.md) にある。デスクトップ版は同じエンジンの成果物をそのまま使う。

## 前提

- **Fuses の `runAsNode` は無効のまま** (`.electron-builder.config.mjs`)。`ELECTRON_RUN_AS_NODE` で
  Electron の実行ファイルを Node として使うことはできない
- **OS に依存する実行ファイルは同梱しない**

## 全体構成

```
plugins/builtin_engines.ts          Web 版のビルドで engines/index.json (一覧) を出力する
plugins/external_engines.json       外部で配信されているエンジンの一覧への登録
scripts/engine-package-entry.ts     外部のエンジンの登録内容を作るスクリプト

src/common/wasm-engine/package.ts   一覧とパッケージの型と検証

src/background/usi/wasm/
  install.ts                          ダウンロード・検証・配置・削除
  process-electron.ts                 utility プロセスの起動 (ChildProcess と同じインターフェース)
  process-cmd.ts                      コマンドラインツール向けの代替 (起動できない)
  host.ts                             utility プロセスのエントリ (dist/packed/wasm-engine-host.js)
  runner.ts                           Node 上でエンジンを起動する (Electron に依存しない)
  protocol.ts                         background と utility プロセスの間のメッセージ

src/renderer/view/dialog/EngineDownloadDialog.vue   ダウンロード画面
```

## 実行

`USIEngine.path` が `engine.json` を指すエンジンは、`EngineProcess` (`src/background/usi/engine.ts`)
がプロセス型のエンジンの代わりに `WasmEngineProcess` で起動する。これ以降の USI の処理は
プロセス型のエンジンと共通で、統計情報・prompt ウィンドウ・早期 ponder・headless の
`addEngine` もそのまま使える。

`WasmEngineProcess` は `utilityProcess.fork()` で `host.ts` を起動する。utility プロセスは
Electron 自身の実行ファイルを `--type=utility` で起動したもので、`ELECTRON_RUN_AS_NODE` を
使わない。**そのため `runAsNode` を無効にしたまま動く。** `host.ts` は asar に同梱されるため
`onlyLoadAppFromAsar` とも両立する。

`host.ts` は `runner.ts` を使い、Web 版の Worker (`engine.worker.ts`) と同じ手順を
ローカルのファイルで行う。

- グルーコードは `esm` なら `import()`、`umd` なら CommonJS のスコープで評価する
- `locateFile` はグルーコードの隣のパスを返す。`.wasm` と `.data` はそこに置かれている
- `dataFiles` はファイルから読み、Emscripten の仮想ファイルシステムへ書き込む
- `assetBaseURL` は参照しない。ダウンロード時に全てのファイルを手元へ集めてあるため
- `requiresCrossOriginIsolation` は参照しない。Node では cross-origin isolation の制約が無く、
  `SharedArrayBuffer` を使える。**スレッドを使うエンジンもそのまま動く**

WebAssembly エンジンは `quit` でプロセスを終了しない (`wasm-engine-abi.md`)。プロセス型の
エンジンと同じく `quit` で終わるよう、`host.ts` が `quit` を中継した後にエンジンの `terminate()`
を呼んでプロセスを終了する。`kill()` はまず `terminate` を依頼し、1 秒で応答が無ければ
utility プロセスを強制終了する。

エンジンのグルーコードが `console` に書いたものは USI のログに残す。

## 一覧 (インデックス)

ダウンロードできるエンジンの一覧は Web 版の配信物の `engines/index.json` である。

| 環境                    | 取得先                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| 本番                    | `https://sunfish-shogi.github.io/shogihome/webapp/engines/index.json` |
| 開発 (`electron:serve`) | `http://localhost:5173/engines/index.json` (Vite の開発サーバー)      |
| 本番以外                | 環境変数 `SHOGIHOME_ENGINE_INDEX_URL` で差し替えられる                |

本番では環境変数による差し替えを受け付けない。

```json
{
  "format": "shogihome-engine-index/1",
  "engines": [
    {
      "id": "example.yaneuraou",
      "version": "2026-09-01",
      "name": "YaneuraOu",
      "author": "yaneurao",
      "publisher": "example",
      "description": "任意の説明",
      "licenses": ["GPL-3.0-or-later"],
      "packageURL": "https://engines.example.com/yaneuraou/2026-09-01/",
      "files": [
        { "path": "engine.json", "sha256": "…", "size": 2684 },
        { "path": "yaneuraou.js", "sha256": "…", "size": 78842 },
        {
          "path": "yaneuraou.wasm",
          "url": "https://assets.example.com/yaneuraou.wasm",
          "sha256": "…",
          "size": 367783
        },
        { "path": "LICENSE.txt", "sha256": "…", "size": 35149 }
      ]
    }
  ]
}
```

| フィールド    | 必須 | 内容                                                                                  |
| ------------- | ---- | ------------------------------------------------------------------------------------- |
| `id`          | ○    | `[A-Za-z0-9][A-Za-z0-9._-]*`。外部のものは `<配布者>.<名前>` のように名前空間を付ける |
| `version`     | ○    | 同じ文字種。内容が変わったら必ず変える                                                |
| `name`        | ○    | 一覧に出す名前                                                                        |
| `author`      | ○    | 作者                                                                                  |
| `publisher`   |      | 本家以外が配信する場合の配布者。ダウンロード前に「ShogiHome の一部ではない」と示す    |
| `description` |      | 一覧に出す説明                                                                        |
| `licenses`    | ○    | 一覧に出す SPDX 識別子。全文は `engine.json` の `licenses` が指す                     |
| `packageURL`  | ○    | `engine.json` を置いたディレクトリの URL。末尾は `/`。一覧からの相対でもよい          |
| `files`       | ○    | パッケージを構成する全てのファイル。`engine.json` を必ず含む                          |

`files` の要素は、インストール先での位置 (`path`)、取得先 (`url`。省略時は `packageURL` からの
`path`)、`sha256` と `size` を持つ。

URL は https のみ受け付ける (開発用に localhost の http だけは認める)。不正な項目が 1 つでも
あれば一覧ごと拒否する。配信側の誤りを黙って隠すと、エンジンが一覧から消えた理由が
分からなくなるため。

### 本家のエンジン

`public/engines/` (とビルドプロファイルの `engines.dirs`) に置いたエンジンは、Web 版のビルドが
一覧に載せる。`version` は全ファイルのパスと sha256 から作る (内容が変われば変わる)。
**`assetBaseURL` を宣言したエンジンは載せない。** 外部にある wasm や評価パラメータの中身を
ビルド時に確かめられないためで、外部のエンジンと同じ方法で登録する。

### 外部のエンジン

このリポジトリに置けないエンジン (GPL のエンジンや、Cloudflare などで配信している大きな
エンジン) は、`plugins/external_engines.json` の `engines` に項目を加える。項目は
スクリプトで作る。

```bash
npx tsx scripts/engine-package-entry.ts https://engines.example.com/yaneuraou/2026-09-01/ \
  --id example.yaneuraou --publisher example
```

スクリプトはパッケージの全てのファイルを実際に取得し、大きさと sha256 を求める。取得先は
マニフェストの規則 (`wasm-engine-abi.md` の「6. (d)」) に従う。

| ファイル                                | 取得先                                 | インストール先           |
| --------------------------------------- | -------------------------------------- | ------------------------ |
| `engine.json`・グルーコード・ライセンス | `packageURL`                           | `engine.json` からの相対 |
| `<module>.worker.js` (あれば)           | `packageURL`                           | グルーコードの隣         |
| `.wasm`・`.data` (あれば)               | `assetBaseURL` (無ければ `packageURL`) | グルーコードの隣         |
| `dataFiles[].url`                       | `assetBaseURL` (無ければ `packageURL`) | `engine.json` からの相対 |

一覧に載るのは Web 版をビルドして配信したときである (`npm run release`)。

#### 配信側の要件

Web 版の要件 (`wasm-engine-abi.md` の「配信側の要件」) に加えて次を満たすこと。
デスクトップ版は Chromium のネットワークスタック (`net.fetch`) で取得し、
`User-Agent` に `ShogiHome/<版>` を名乗る。

- **ボット対策のチャレンジを返さない。** Cloudflare の Bot Fight Mode・Browser Integrity
  Check・JS チャレンジはアプリからの取得を 403 や HTML で拒否する。該当するパスでは無効にする
- **Referer を要求しない。** ホットリンク保護の対象外にする
- **置いたファイルを書き換えない。** 内容を変えるときは別の `version` のディレクトリに置く。
  一覧は sha256 で照合するため、書き換えると検証に失敗して誰もインストールできなくなる

CORS と CORP はブラウザが強制するものなので、デスクトップ版の取得には影響しない。

## 検証

**ダウンロードしたものは全て一覧の sha256 と大きさで照合する。** グルーコードは utility
プロセスで Node の権限を持って動く。wasm もビルド設定によってはグルーコードの関数を通じて
任意の処理を行える。評価パラメータや定跡もエンジンの解析処理の入力になる。壊れた
評価パラメータはエラーにならずに「弱い」「おかしい」という形で現れるため、事故の検出にも役立つ。

照合はダウンロードしながら行い、大きさが宣言を超えた時点で打ち切る。1 つでも一致しなければ
インストールしない。取得したマニフェストが仕様を満たすこと、グルーコード・`dataFiles`・
ライセンス全文が一覧に載っていることも確かめる。

起動時には照合しない。利用者のフォルダを書き換えられる攻撃者は、登録済みのプロセス型の
エンジンも差し替えられるため、新たな脅威にはならない。一覧を読むときにファイルの有無と
大きさだけを確かめ、欠けていれば「修復が必要」と示す。

一覧そのものは HTTPS で取得したものを信頼している。一覧に署名を付けて検証する仕組みは
まだ無い (「今後」を参照)。

## 配置

```
<userData>/engines/                  ポータブル版では実行ファイルの隣の engines/
  <id>@<version>/
    engine.json                        USIEngine.path はこれを指す
    install.json                       インストールの記録 (一覧の項目と sha256)
    <module>.js / <module>.wasm / …
  .tmp-<id>@<version>-<乱数>/          ダウンロード中
  .trash-<id>@<version>-<乱数>/        置き換えで退避した古いもの
```

- ダウンロードは `.tmp-*` に行い、全て揃って検証が通ったらリネームして確定する
- 同じ版が既にある場合 (再インストール・修復) は、古いものを `.trash-*` へ退避してから置き換える
- **手元に同じ sha256 のファイルがあれば、ダウンロードせずに複製する。** 更新で評価パラメータが
  変わらない場合や、壊れたファイルだけを修復する場合に、大きなファイルを取り直さないため。
  複製したものも照合し、一致しなければダウンロードに切り替える
- Windows ではセキュリティソフトが書き込み直後のファイルを掴み、リネームが `EPERM` などで
  失敗することがある。少し待って繰り返す
- 起動時に、1 日以上前の `.tmp-*` と `.trash-*` を消す。macOS では複数のインスタンスを
  起動できるため、別のインスタンスがダウンロード中のものは消さない
- アンインストールはディレクトリごと消す。エンジンが動いている間は消さない

## 登録

インストールしたエンジンは一度起動して (`getUSIEngineInfo`)、実機が申告するオプションを得る。
マニフェストのプリセットごとにエンジン一覧の項目を作り、Web 版の組み込みエンジンと同じく
**プリセットの値はオプションの `default` に入れる** (`src/common/wasm-engine/preset.ts`)。
表示名と既定の名前はプリセットの `displayName`、タグはプリセットの `tags` から作る。

オプション画面は、ダウンロードしたエンジンでは実機から定義を取り直さない。取り直すと
プリセットの既定値が素のエンジンのものに置き換わるため (Web 版の組み込みエンジンと同じ扱い)。

## 画面

エンジン管理画面の下部に「ファイルから追加」「ダウンロード」「比較・マージ」を並べる。
エンジンが 1 つも無いときは「エンジンをダウンロード」も表示する。どちらも Web 版では出さない。

ダウンロード画面はエンジン管理画面の子の画面である。**エンジン管理画面は一覧をメモリ上で
編集し「保存して閉じる」で確定する**ため、ダウンロード画面も結果をエンジン管理画面の一覧に
返すだけにし、確定は任せる。ファイルの保存だけはその場で確定する。

| 操作                          | 振る舞い                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- |
| インストール                  | ライセンス全文を表示し、同意したらダウンロードする。プリセットの項目を一覧に足す |
| 更新 (別の版がある)           | 古い版を参照していた項目の `path` を新しい版に向ける。**URI は変えない**         |
| 再インストール (同じ版がある) | 欠けたファイルや壊れたファイルを修復する。一覧は変えない (参照が無ければ足す)    |
| アンインストール              | 編集中の一覧と保存済みの一覧のどちらからも参照されていない場合だけ行える         |

URI を変えないのは、対局や検討の設定が URI でエンジンを参照しているためである。
更新後の古い版は「インストール済み」に「未使用」として残り、利用者が消す。

ライセンスの確認では、`publisher` があれば「ShogiHome の一部ではない」ことを、
コピーレフトのライセンス (GPL・LGPL・AGPL・MPL など) を含めばその旨を示す。
ライセンス全文は `engine.json` と一緒にダウンロード前に取得し、一覧の sha256 で照合する。

## ライセンス

デスクトップ版はエンジンを配布物に含めない。エンジンは利用者の操作で配布者から直接
ダウンロードされ、ShogiHome 本体とは別のプロセスで動き、USI の文字列だけをやり取りする。
プロセス型のエンジンと同じ関係であり、本体の配布物に GPL のコードは含まれない。
ライセンスを提示する義務はエンジンを配信する側が負い、ShogiHome はダウンロードの前に
全文と入手先を示す。

## 今後

- 一覧への署名 (Ed25519 など) とその検証
- 中断したダウンロードの再開 (Range リクエスト)
- ライセンス表示 (メニューの「ライセンス」) への、インストール済みのエンジンの追加
- 登録するプリセットの選択
- 起動時にファイルの欠落を検出した場合の案内
