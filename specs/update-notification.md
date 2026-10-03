# アップデート通知

ShogiHome (Electron 版) は起動時に新しいバージョンの有無を確認し、通知を表示する。

## リリース情報ファイル

GitHub Pages 上の次のファイルから、安定版 (`stable`) と最新版 (`latest`) のバージョン番号を取得する。

- Windows: `release-win.json`
- macOS: `release-mac.json`
- Linux: `release-linux.json`
- その他: `release.json`

```json
{
  "stable": { "version": "1.28.1", "tag": "v1.28.1", "link": "https://github.com/..." },
  "latest": { "version": "1.29.0", "tag": "v1.29.0", "link": "https://github.com/..." }
}
```

- アプリが使用するのは `version` のみ。
- `tag` と `link` は旧バージョンのアプリとの互換性のために残している。アプリはこれらを使用せず、タグは `"v" + version`、リンクは `https://github.com/sunfish-shogi/shogihome/releases/tag/{tag}` として生成する。

## クールダウン期間

リポジトリが乗っ取られて不正なリリースが作られた場合に、利用者へ通知される前に発見・削除できるよう、GitHub リリースの公開から **4 日** 経過するまでは通知しない。

- 既知のバージョン (`version.json` に保存済み) から変化したバージョンについて、GitHub API `GET /repos/sunfish-shogi/shogihome/releases/tags/{tag}` で公開日時を確認する。
- 以下をすべて満たす場合のみ、そのバージョンを受け入れる。
  - `tag_name` が期待するタグと一致する。
  - `draft` が `false` である。
  - `published_at` から 4 日以上経過している。
- 受け入れられなかったバージョン (クールダウン中、リリースが存在しない、API エラーなど) は、既知のバージョンを維持する。次回のチェック (自動チェックでは最短 1 日後) で再度確認する。
- 既知のリリース情報が無い状態で受け入れられないバージョンがある場合は、リリース情報を保存しない。
- 公開日時はリリース情報ファイルではなく GitHub API から取得する。リリース情報ファイルに日時を持たせると、ファイルを書き換えられた場合に回避されるため。

## 外部リンク

通知やヘルプメニューから開くリリースページの URL は、受け入れたバージョン番号から生成する。保存済みのリンクやリリース情報ファイルのリンクは使用しない。
