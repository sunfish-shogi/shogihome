# Electron 将棋

![Test](https://github.com/sunfish-shogi/electron-shogi/actions/workflows/test.yml/badge.svg)

将棋の GUI アプリです。
コンピューターとの対局や棋譜の編集・検討ができます。

[将棋所](http://shogidokoro.starfree.jp/)と同様に [USI プロトコル](http://shogidokoro.starfree.jp/usi.html) 対応の思考エンジンを利用できます。

## コンセプト

私達は既に将棋所や[ShogiGUI](http://shogigui.siganus.com/)などの洗練されたソフトウェアで将棋の対局や研究が可能です。
しかし、その多くは個人がクローズドに開発しているものです。
コンピューター将棋界の権威ある開発者も[オープンソースのGUIの必要性に言及](https://yaneuraou.yaneu.com/2022/01/15/new-gui-for-shogi-is-needed-to-improve-the-usi-protocol/)しています。
Electron 将棋はオープンソースであり、そして低い制限のもとで自由に利用・改変が可能です。

また、 Web の技術を使うことで幅広い活用を目指します。
USI エンジンを呼び出す機能を除いて、ほぼ全ての機能がブラウザで利用できます。

## Web サイト

https://sunfish-shogi.github.io/electron-shogi/

リンク先からブラウザ版アプリを試すことができます。

## スクリーンショット

![スクリーンショット1](docs/screenshots/screenshot001.png)

![スクリーンショット2](docs/screenshots/screenshot002.png)

![スクリーンショット3](docs/screenshots/screenshot003.png)

## ダウンロード

開発者の方は後述のコマンドを使用してビルドください。

一般の方向けのファイルは準備中です。

## 要望・提案・不具合報告

GitHub のアカウントをお持ちの方は GitHub Issue/PullRequest を活用してください。
設計に関する意見も歓迎です。

それ以外の方の連絡方法は準備中です。（Twitter で連絡頂いても構いません。）

## 開発

### 必要なもの

- Node.js (16.14.0 以上推奨)

### セットアップ

```
npm install
```

### 起動

```
# Electron アプリ
npm run electron:serve

# ブラウザアプリ
npm run serve
```

### リリース

```
# Electron アプリ
npm run electron:build

# ブラウザアプリ
npm run build
```

### ユニットテスト

```
npm run test:unit
```

### Lint

```
npm run lint
```

## ライセンス

### Electron 将棋のライセンス

[MIT License](LICENSE)

### アイコン画像のライセンス

[Material Icons](https://google.github.io/material-design-icons/) を使用しています。
これには[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt)が適用されます。
