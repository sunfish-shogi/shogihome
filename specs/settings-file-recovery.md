# 設定ファイル破損時のリカバリー

PC のクラッシュ等で設定ファイルが破損して JSON としてパースできない場合の振る舞いを定める。
対象は Electron 版がファイルとして保存する設定ファイル (`src/background/settings.ts` で読み書きするもの) である。

## 対象ファイル

- `window.json`
- `usi_engine.json`
- `app_setting.json`
- `batch_conversion_setting.json`
- `game_setting.json`
- `csa_game_setting_history.json`
- `research_setting.json`
- `analysis_setting.json`
- `mate_search_setting.json`
- `layouts.json`
- `book_import.json`

## 振る舞い

設定ファイルの読み込みで JSON のパースに失敗した場合、以下の処理を行う。

1. 破損したファイルを同じディレクトリ内で `<元のファイル名>.corrupted-<タイムスタンプ>` にリネームして保管する。
   - タイムスタンプは `YYYYMMDDhhmmss` 形式とする。
   - 同名のファイルが既に存在する場合は末尾に `-2`, `-3`, ... の連番を付与する。
2. 既定の設定値を使用してアプリの起動・動作を継続する。
3. メインウィンドウの準備ができた時点でエラーメッセージを表示し、ファイルが壊れていたことと退避したファイルのパスを案内する。
   - ウィンドウ表示後に読み込まれた設定ファイルで破損を検出した場合は、その時点でエラーメッセージを表示する。

JSON としてパースできるが内容が不正な場合 (スキーマの不一致など) はこの仕組みの対象外であり、従来どおり正規化処理によって補完される。

破損ファイルの退避 (リネーム) 自体に失敗した場合は従来どおりエラーとして扱い、ファイルの削除や上書きは行わない。
