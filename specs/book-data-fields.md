# 定跡データ項目と UI 対応

このドキュメントは、`src/background/book` で扱う定跡データの各項目と、UI (レンダラー) での表示・編集対応状況をまとめたものです。

## 定跡手 (BookMove)

`src/common/book.ts` の `BookMove` 型で定義されます。

| 項目      | 説明                                 | 対応フォーマット       | UI 表示            | UI 編集                        |
| --------- | ------------------------------------ | ---------------------- | ------------------ | ------------------------------ |
| `usi`     | 定跡手                               | すべて                 | ○ (BookView)       | 追加・削除・並べ替え           |
| `usi2`    | 相手の応手                           | yane2016               | × (意図的に非表示) | × (既存値は編集時も保持される) |
| `score`   | 評価値                               | yane2016 / apery / ybb | ○                  | ○ (BookMoveDialog)             |
| `depth`   | 探索深さ                             | yane2016 / ybb         | ○                  | ○ (BookMoveDialog)             |
| `count`   | 出現回数                             | yane2016 / apery / sbk | ○ (出現頻度と割合) | ○ (BookMoveDialog)             |
| `comment` | 指し手コメント                       | yane2016               | ○                  | ○ (BookMoveDialog)             |
| `sbkEval` | 指し手評価 (絶対手/好手/疑問手/悪手) | sbk                    | ○ (ラベル表示)     | ○ (BookMoveDialog)             |
| `sbkId`   | SBK の次局面 State ID                | sbk                    | × (内部値)         | × (編集時も保持される)         |

`usi2` は人間にとって必要性が低く、可読な形での表示・編集方法が難しいため、意図的に UI へ露出していません。
既存の値はどの編集操作でも失われないよう保持されます。`sbkId` も同様に保持のみ行います。

## 局面情報 (BookEntry / BookPositionEntry)

局面単位のメタデータは `src/background/book/types.ts` の `BookEntry` で保持され、
IPC (`searchBookEntry`) では `src/common/book.ts` の `BookPositionEntry` として
レンダラーへ渡されます。

| 項目       | 説明                     | 対応フォーマット | UI 表示                  | UI 編集                      |
| ---------- | ------------------------ | ---------------- | ------------------------ | ---------------------------- |
| `moves`    | 定跡手のリスト           | すべて           | ○ (BookView)             | ○                            |
| `comment`  | 局面コメント             | yane2016 / sbk   | ○ (定跡ペインのフッター) | ○ (フッターのインライン編集) |
| `minPly`   | 初期局面からの手数       | yane2016 / ybb   | ○ (定跡の情報ダイアログ) | × (自動計算値)               |
| `games`    | 対局数                   | sbk              | ○ (フッターとダイアログ) | × (自動集計値)               |
| `wonBlack` | 先手勝ち数               | sbk              | ○ (フッターとダイアログ) | × (自動集計値)               |
| `wonWhite` | 後手勝ち数               | sbk              | ○ (フッターとダイアログ) | × (自動集計値)               |
| `sbkEvals` | エンジン解析結果のリスト | sbk              | ○ (定跡の情報ダイアログ) | ×                            |

- 定跡ペインのフッターには局面コメントと対局数・勝敗数を小さく表示します。
  どちらも存在しない局面では表示しません。
- 局面コメントの編集は対応フォーマット (yane2016 / sbk) でのみ可能です。
- 盤面反転定跡 (flippedBook) で反転局面の定跡を表示している場合、
  先手勝ち数と後手勝ち数は入れ替えて表示し、コメントの編集は反転局面に対して行われます。

### sbkEvals の項目

`BookPositionEval` (`src/common/book.ts`) として渡されます。

| 項目              | 説明                                      |
| ----------------- | ----------------------------------------- |
| `evaluationValue` | 評価値                                    |
| `depth`           | 探索深さ                                  |
| `selDepth`        | 選択的探索深さ                            |
| `nodes`           | ノード数 (64bit 値のため JSON では文字列) |
| `variation`       | 読み筋                                    |
| `engineName`      | エンジン名                                |

## 定跡ファイル情報 (BookInfo)

`src/common/book.ts` の `BookInfo` 型で定義され、IPC (`getBookInfo`) で取得します。
「定跡の情報」ダイアログ (BookPropertiesDialog) とネイティブメニューから確認できます。

| 項目             | 説明                                        | UI 表示 | UI 編集 |
| ---------------- | ------------------------------------------- | ------- | ------- |
| `format`         | フォーマット (yane2016 / apery / sbk / ybb) | ○       | −       |
| `type`           | 読み込みモード (in-memory / on-the-fly)     | ○       | −       |
| `path`           | ファイルパス                                | ○       | −       |
| `entryCount`     | 局面数 (in-memory のみ)                     | ○       | −       |
| `unsaved`        | 未保存の変更の有無                          | ○       | −       |
| `sbkAuthor`      | 作者 (SBK)                                  | ○       | ×       |
| `sbkDescription` | 説明 (SBK)                                  | ○       | ×       |

`sbkAuthor` / `sbkDescription` はファイルの読み込み・保存で保持されますが、編集 UI は現時点では提供していません。
