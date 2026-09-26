# Web アプリの言語指定クエリ

Web 版では URL に `lang` クエリを付けて表示言語を指定できる。
サイトトップの英語版・中国語版のページから Web アプリを開くリンクで使う。
Electron 版には適用されない。

```
webapp/index.html?lang=en
webapp/index.html?mobile&lang=zh_tw
```

値は `Language` (`src/common/i18n/languages.ts`) の値 (`ja`, `en`, `zh_tw`, `vi`) とする。

## 振る舞い

1. `lang` クエリは起動時に読み取り、`history.replaceState` で URL から取り除く。
   クエリ付きの URL がブックマークされたり共有されたりするのを防ぐため、
   値が不正な場合も取り除く。他のクエリ (`mobile` など) は残す。
2. 値が `ja` または不正な値の場合は何もしない。
3. アプリ設定が localStorage に保存されていない場合は、指定された言語をアプリ設定に保存し、
   その言語で起動する。
4. アプリ設定が保存済みで言語が同じ場合は何もしない。
5. アプリ設定が保存済みで言語が異なる場合は、現在の言語で起動したあと、切り替えるかを確認する。
   確認のメッセージは現在の言語と切り替え先の言語の両方で表示する。
   「はい」を選ぶとアプリ設定を保存してページを再読み込みする。

## 読み取るタイミング

初回アクセスでは cross-origin isolation のためにページを再読み込みすることがある
(`src/coi-bootstrap.js`, [webapp-update.md](webapp-update.md) を参照)。
再読み込みの前にクエリを取り除くと言語の指定が失われるため、
`window.__shogihomeCOIReady` が解決してから読み取る。
