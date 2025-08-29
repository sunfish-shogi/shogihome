# usi-csa-bridge

[ShogiHome](https://github.com/sunfish-shogi/shogihome#readme) の機能のうち、 CSA 対局サーバーへ接続して USI のエンジンを対局に参加させる部分をコマンドラインから実行するツールです。

## セットアップ方法

### NPM レジストリからインストールする場合

```
npm install -g usi-csa-bridge
```

インストール済みのバージョンは `npm list -g` で確認できます。
最新バージョンのチェックは `npm outdated -g` 、アップデートは `npm update -g usi-csa-bridge` または `npm install -g usi-csa-bridge@{ここにバージョンを指定}` で可能です。

`-g` オプションを指定するとグローバルインストール（カレントディレクトリではなくマシン環境全体へのインストール）になります。
環境によっては管理者権限が必要なため、権限のエラーが出る場合は `sudo` コマンドを使用してください。

### ソースコードからビルドする場合

```
# Clone
git clone git@github.com:sunfish-shogi/shogihome.git --branch <インストールするバージョンのタグを指定> --depth 1
# Git の履歴が必要な場合は --depth 1 を除外してください。

# clone したディレクトリに移動
cd shogihome

# 依存モジュールのインストール
npm install
# 開発時のバージョンに合わせる場合は npm ci を使ってください。

# ビルドとインストール
npm run usi-csa-bridge:install
```

## ヘルプを表示

```
npx usi-csa-bridge --help
```

## 設定ファイルの作成

### ShogiHomeからエクスポートする場合

CSA プロトコル通信対局のダイアログを開いて設定を入力し、以下のいずれかのボタンで設定をコピーします。

- YAML - YAML 形式で設定をコピーします。
- JSON - JSON 形式で設定をコピーします。
- Command - 引数に設定を直接記述する場合のコマンドをコピーします。

### 設定ファイルをテキストエディタで作成する場合

以下の要領で YAML を記述してください。
JSON で書く場合も構造は同じです。

【注意】 `setoption` が必要ないとしても `USI_Ponder` だけは明示しないと `go ponder` コマンドは実行されません。

```yaml
# USI エンジンの設定
usi:
  # エンジンの名前
  name: テストエンジン
  # 実行ファイルのパス
  path: /path/to/engine
  # エンジン固有のオプション
  options:
    USI_Hash:
      type: spin
      value: 1024
    USI_Ponder:
      type: check
      value: true
    Threads:
      type: spin
      value: 1
    MultiPV:
      type: spin
      value: 1
    BookDir:
      type: string
      value: book
  # Early Ponder を有効化するかどうか
  # NOTICE: Early Ponder が正常に動作するためにはエンジンがやねうら王の拡張仕様をサポートしている必要があります。
  enableEarlyPonder: false

# CSA 対局サーバーの接続設定
server:
  # プロトコルバージョン
  #   v121          : CSA プロトコル v1.2.1
  #   v121_floodgate: CSA プロトコル v1.2.1 + 読み筋と評価値の送信を可能にした Floodgate 拡張
  protocolVersion: v121_floodgate
  # ホスト名
  host: 127.0.0.1
  # ポート番号
  port: 4081
  # ログインID
  id: ログインID
  # パスワード
  password: パスワード
  # TCP Keepalive の設定
  tcpKeepalive:
    # 初期遅延 (秒)
    initialDelay: 10
  # 空行送信の設定 (オプショナル)
  # NOTICE: CSA プロトコルの規定により 30 秒以上の間隔をあけて送信する必要があります。
  blankLinePing:
    # 初期遅延 (秒)
    initialDelay: 40
    # 送信間隔 (秒)
    interval: 40

# 対局回数
repeat: 1
# エラー時の自動再ログイン
autoRelogin: true
# 1 局ごとにエンジンを再起動するかどうか
restartPlayerEveryGame: false

# 棋譜を保存するかどうか
saveRecordFile: true
# 思考結果を指し手コメントで残すかどうか
enableComment: true
# 棋譜ファイル名のテンプレート
# https://github.com/sunfish-shogi/shogihome/wiki/棋譜ファイル名テンプレート
recordFileNameTemplate: "{datetime}{_title}{_sente}{_gote}"
# 棋譜ファイルの拡張子 (.kif|.kifu|.ki2|.ki2u|.csa|.jkf)
recordFileFormat: .kifu
```

## 実行

以下の要領でコマンドを実行します。

```
# YAML ファイル
npx csa-usi-bridge 設定ファイル.yaml

# JSON ファイル
npx csa-usi-bridge 設定ファイル.json

# JSON (直接指定)
npx csa-usi-bridge <JSON 形式の設定を gzip 圧縮して Base64 エンコードした文字列>
```

コマンド引数に設定を直接指定する場合は、JSON 形式で設定を作成した上で gzip 圧縮と Base64 エンコードが必要です。
ShogiHomeの画面からコピーするのが簡単ですが、自分でエンコードする場合は Linux のコマンドを使って以下の要領で変換します。

```
# エンコード
cat config.json | gzip -c | base64 -w 0

# デコード
echo -n <Base64> | base64 -d | gzip -c -d
```

## 中断について

現在のところ、対局や対局待ちの状態を手動でやめさせる方法は Ctrl+C 等でプロセスを落とす以外にありません。 シグナルに対して特別な処理をしていないので、USI や CSA のコマンドを送らず強制的にセッションが終了します。

## ログについて

デフォルトでは標準出力のみにログを送ります。 ファイルで書き出す場合にはコマンドオプションを使用します。 ファイルで書き出す場合はカレントディレクトリに logs というサブディレクトリが作られます。

## 棋譜の保存について

棋譜を保存する場合、デフォルトではカレントディレクトリに records というサブディレクトリが作られます。 出力先を変更する場合はコマンドオプションを使用します。

## E2E テスト

ShogiHome のプロジェクトルートディレクトリで以下の要領でコマンドを実行します。

```
npm run usi-csa-bridge:build
./src/tests/e2e/usi-csa-bridge/run 1
```
