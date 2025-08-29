<img width="200" src="./docs/icon.png" />

# ShogiHome

[![Test](https://github.com/sunfish-shogi/shogihome/actions/workflows/test.yml/badge.svg?branch=main&event=push)](https://github.com/sunfish-shogi/shogihome/actions/workflows/test.yml)
[![Test/CLI](https://github.com/sunfish-shogi/shogihome/actions/workflows/test-cli.yml/badge.svg?branch=main&event=push)](https://github.com/sunfish-shogi/shogihome/actions/workflows/test-cli.yml)
[![Audit](https://github.com/sunfish-shogi/shogihome/actions/workflows/audit.yml/badge.svg)](https://github.com/sunfish-shogi/shogihome/actions/workflows/audit.yml)
[![codecov](https://codecov.io/gh/sunfish-shogi/shogihome/branch/main/graph/badge.svg?token=TLSQXAIJFY)](https://codecov.io/gh/sunfish-shogi/shogihome)

[English](./README.en.md)

将棋の GUI アプリです。
コンピューターとの対局や棋譜の編集・検討ができます。

[将棋所](http://shogidokoro2.stars.ne.jp/)と同様に [USI プロトコル](http://shogidokoro2.stars.ne.jp/usi.html) 対応の思考エンジンを利用できます。

## コンセプト

私達は既に将棋所や[ShogiGUI](http://shogigui.siganus.com/)などの洗練されたソフトウェアで将棋の対局や研究が可能です。
しかし、その多くは個人がクローズドに開発しているものです。
コンピューター将棋界の権威ある開発者も[ソースコード公開の必要性に言及](https://yaneuraou.yaneu.com/2022/01/15/new-gui-for-shogi-is-needed-to-improve-the-usi-protocol/)しています。
ShogiHomeはソースコードを公開しており、そして低い制限のもとで自由に利用・改変が可能です。

ShogiHome は Web ベースの GUI フレームワークである [Electron](https://www.electronjs.org/) を使っています。
Web の技術を使うことで将来の幅広い活用を目指しており、機能は限られますが通常のブラウザでも動作します。
Electron は Chromium をバンドルするため、どの OS でも同じ操作性と品質が担保しやすいのも特徴です。

昨今では 2in1 タブレットやコンバーチブル型 PC の普及により、PC 向けの OS でもタッチパネルを使って将棋の対局ができるようになりました。
しかし、 PC 向けの伝統的なアプリケーションは UI コンポーネントが細かく、タッチ操作との相性がよくありません。
ShogiHome ではタッチ操作のしやすさも重視して UI を設計しています。

## Website

https://sunfish-shogi.github.io/shogihome/

ウェブサイトではブラウザ版アプリを試すことができます。

## Wiki

https://github.com/sunfish-shogi/shogihome/wiki

使い方や設計に関する情報はこちらを参照してください。

## スクリーンショット

![スクリーンショット1](docs/screenshots/screenshot001.png)

![スクリーンショット3](docs/screenshots/screenshot003.png)

![モバイル](docs/screenshots/mobile001.png)

## ダウンロード

[Releases](https://github.com/sunfish-shogi/shogihome/releases) からダウンロードできます。

## エンジン開発者の方へ

USI や CSA プロトコルの通信ログの出力はデフォルトで無効です。
[こちら](https://github.com/sunfish-shogi/shogihome/wiki/%E9%96%8B%E7%99%BA%E8%80%85%E5%90%91%E3%81%91%E6%A9%9F%E8%83%BD%E3%81%AE%E4%BD%BF%E3%81%84%E6%96%B9#%E3%83%AD%E3%82%B0) を参考に設定してください。

スクリプトファイルをエンジンとして登録できないという問い合わせが複数来ています。 [シェルスクリプトやインタプリタ型言語でエンジンを実行したい方へ](https://github.com/sunfish-shogi/shogihome/wiki/%E3%82%B7%E3%82%A7%E3%83%AB%E3%82%B9%E3%82%AF%E3%83%AA%E3%83%97%E3%83%88%E3%82%84%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%97%E3%83%AA%E3%82%BF%E5%9E%8B%E8%A8%80%E8%AA%9E%E3%81%A7%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%B3%E3%82%92%E5%AE%9F%E8%A1%8C%E3%81%97%E3%81%9F%E3%81%84%E6%96%B9%E3%81%B8) を参考にしてください。

## 不具合報告及びその他の開発協力

[プロジェクトへの関わり方について](https://github.com/sunfish-shogi/shogihome/wiki/%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88%E3%81%B8%E3%81%AE%E9%96%A2%E3%82%8F%E3%82%8A%E6%96%B9%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6) を必ずお読みください。

GitHub のアカウントをお持ちの方は Issue/PullRequest を活用してください。
大きな変更はいきなり着手せず Issue を作成してください。
Issue や PullRequest を作成する際は、必ず Template を使用してください。

GitHub アカウントをお持ちでない場合は [送信フォーム](https://form.run/@sunfish-shogi-1650819491) でご連絡ください。

開発の進捗状況は [プロジェクトボード](https://github.com/users/sunfish-shogi/projects/1/views/1) を参照してください。

## 開発

### 必要なもの

- Node.js

### Setup

```
git clone https://github.com/sunfish-shogi/shogihome.git
cd shogihome
npm install
```

### Launch

```
# Electron App
npm run electron:serve

# Web App
npm run serve
# Standard: http://localhost:5173
# Mobile  : http://localhost:5173/?mobile
```

### Release Build

```
# Electron App (Installer)
npm run electron:build

# Electron App (Portable)
npm run electron:portable

# Web App
npm run build
```

### Unit Tests

```
# test only
npm test

# coverage report
npm run coverage

# launch Vitest UI
npm run test:ui
```

### Lint

```
npm run lint
```

## CLI Tools

- [usi-csa-bridge](https://github.com/sunfish-shogi/shogihome/tree/main/src/command/usi-csa-bridge#readme) - USI のエンジンを CSA プロトコルの対局に参加させる。

## Licences

### ShogiHome

[MIT License](LICENSE)

### Icon Images

[/public/icon](https://github.com/sunfish-shogi/shogihome/tree/main/public/icon) 配下のアイコン画像は [Material Icons](https://google.github.io/material-design-icons/) を使用しています。
これには [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) が適用されます。

### Dependencies

レンダラープロセスで使用しているライブラリは [THIRD PARTY LICENSES](https://sunfish-shogi.github.io/shogihome/third-party-licenses.html) を参照してください。

Electron と Chromium については electron-builder によって成果物にバンドルされます。
