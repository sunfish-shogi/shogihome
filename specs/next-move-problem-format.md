# 次の一手問題集フォーマット仕様（フォーマット定義）

この文書は次の一手問題集ファイルの**データフォーマットそのもの**を定義する。
問題集の作成手順や出題時の UI 挙動は [next-move-problem.md](./next-move-problem.md) を参照。

## 1. ファイル全体

- ファイルは UTF-8 (BOM なし) でエンコードされた JSON テキストとする。
- 拡張子は `.json` とする。
- トップレベルはオブジェクトで、`format` フィールドの値 `"shogihome-next-move"` によって次の一手問題集であることを識別する。
- 未知のフィールドは無視して読み込めなければならない（前方互換性のため）。

```json
{
  "format": "shogihome-next-move",
  "version": 1,
  "metadata": { ... },
  "problems": [ ... ]
}
```

| フィールド | 型     | 必須 | 説明                                        |
| ---------- | ------ | ---- | ------------------------------------------- |
| `format`   | string | ✔    | 固定値 `"shogihome-next-move"`              |
| `version`  | number | ✔    | フォーマットバージョン。本仕様では `1`      |
| `metadata` | object |      | 問題集全体のメタ情報（[2 章](#2-metadata)） |
| `problems` | array  | ✔    | 問題の配列（[3 章](#3-problems)）           |

読み込み時、`version` が未知の値（`1` より大きい）の場合はエラーとする。

## 2. metadata

問題集全体のメタ情報。すべてのフィールドは省略可能。

| フィールド   | 型     | 説明                                                   |
| ------------ | ------ | ------------------------------------------------------ |
| `title`      | string | 問題集の名前                                           |
| `createdAt`  | string | 作成日時（ISO 8601 形式）                              |
| `appVersion` | string | 生成したアプリケーションのバージョン                   |
| `engine`     | object | 再探索に使用したエンジンの情報（[2.1 節](#21-engine)） |
| `criteria`   | object | 生成時の判定条件（[2.2 節](#22-criteria)）             |

### 2.1 engine

| フィールド              | 型     | 説明                         |
| ----------------------- | ------ | ---------------------------- |
| `name`                  | string | USI エンジン名               |
| `multiPV`               | number | 再探索時の MultiPV 値        |
| `maxSecondsPerPosition` | number | 1 局面あたりの探索時間（秒） |

### 2.2 criteria

生成時に使用した判定条件を記録する。出題時の動作には影響しないが、問題集の性質を把握したり再生成したりする際の参考情報となる。悪手判定・採用判定は勝率（%）で行う（[next-move-problem.md](./next-move-problem.md) 参照）。

| フィールド              | 型     | 説明                                                      |
| ----------------------- | ------ | --------------------------------------------------------- |
| `winRateDropThreshold`  | number | 勝率降下幅（%）。検出対象とする勝率下降の最小値           |
| `adoptionWinRateDiff`   | number | 採用判定の勝率差（%）。採用に必要な最善手と実戦の手の差   |
| `acceptableWinRateDiff` | number | 正解範囲の勝率差（%）。複数の正解を認める範囲             |
| `minWinRate`            | number | 対象局面評価の下限（%）。劣勢・逆転困難な局面の除外に使用 |
| `coefficientInSigmoid`  | number | 評価値を勝率に換算する際に使用したシグモイド係数          |
| `minPly`                | number | 対象とする手数の下限                                      |
| `maxPly`                | number | 対象とする手数の上限                                      |

## 3. problems

問題の配列。各要素は 1 問を表すオブジェクトとする。

| フィールド     | 型     | 必須 | 説明                                                     |
| -------------- | ------ | ---- | -------------------------------------------------------- |
| `sfen`         | string | ✔    | 出題局面（[3.1 節](#31-sfen)）                           |
| `candidates`   | array  | ✔    | 再探索で得られた候補手の配列（[3.2 節](#32-candidates)） |
| `actualMove`   | object | ✔    | 実戦で指された手（[3.3 節](#33-actualmove)）             |
| `previousMove` | object |      | 出題局面に至る直前の指し手（[3.4 節](#34-previousmove)） |
| `analysis`     | object |      | 棋譜解析コメント由来の評価値（[3.5 節](#35-analysis)）   |
| `source`       | object |      | 出典棋譜の情報（[3.6 節](#36-source)）                   |

### 3.1 sfen

- `盤面 手番 持ち駒 手数` の 4 フィールド形式の SFEN 文字列とする（`sfen` プレフィックスは付けない）。
- 手番側が解答者となる。
- 手数フィールドは `1` に正規化する。実戦での手数は `source.ply` に記録する。
- 問題の重複判定は手数フィールドを除いた第 1〜3 フィールドの一致で行う。

### 3.2 candidates

MultiPV 再探索で得られた候補手の配列。手番側から見て良い順（評価値の降順）に並べ、先頭要素を最善手とする。最低 2 要素（最善手と次善手）を含めることを推奨する。

| フィールド | 型      | 必須 | 説明                                                            |
| ---------- | ------- | ---- | --------------------------------------------------------------- |
| `usi`      | string  | ✔    | 指し手（USI 形式。例: `"7g7f"`, `"P*5e"`）                      |
| `score`    | number  |      | 評価値（[4 章](#4-評価値の表現)）                               |
| `mate`     | number  |      | 詰み手数（[4 章](#4-評価値の表現)）                             |
| `depth`    | number  |      | 探索深さ                                                        |
| `accepted` | boolean |      | 出題時に正解として扱うか。省略時は `false`                      |
| `pv`       | array   |      | 読み筋（USI 形式の指し手の配列）。先頭要素は `usi` と同じ指し手 |

- `score` と `mate` はいずれか一方を記録する。両方省略された候補は評価値不明として扱う。
- 先頭要素（最善手）の `accepted` は必ず `true` とする。
- **相手の応手**は `pv` の 2 番目の要素として表現する。出題後に応手を提示するため、生成時は各候補の `pv` を 2 手以上記録することを推奨する（エンジンが 1 手しか返さなかった場合は 1 手でもよい）。

### 3.3 actualMove

実戦で指された手（悪手）。

| フィールド    | 型     | 必須 | 説明                                          |
| ------------- | ------ | ---- | --------------------------------------------- |
| `usi`         | string | ✔    | 指し手（USI 形式）                            |
| `score`       | number |      | 評価値                                        |
| `mate`        | number |      | 詰み手数                                      |
| `scoreSource` | string |      | 評価値の出所。`"research"` または `"comment"` |

- `scoreSource` が `"research"` の場合、評価値は問題生成時の再探索（MultiPV 候補に実戦の手が含まれていた場合）に由来する。
- `scoreSource` が `"comment"` の場合、評価値は棋譜ファイルの解析コメントに由来する。再探索とは条件（エンジン・深さ）が異なるため、`candidates` の評価値と厳密には比較できないことに注意する。

### 3.4 previousMove

出題局面に至る直前の指し手（相手の指し手）。出題時に盤面の最終手として強調表示するために使用する。

| フィールド | 型     | 必須 | 説明                                                                  |
| ---------- | ------ | ---- | --------------------------------------------------------------------- |
| `usi`      | string | ✔    | 指し手（USI 形式）                                                    |
| `sfen`     | string | ✔    | この指し手を指す**前**の局面（4 フィールド形式・手数は `1` に正規化） |

- USI 形式の指し手だけでは指し手オブジェクト（駒種・手番など）を復元できないため、指し手を指す前の局面の SFEN を併せて記録する。
- `sfen` の局面で `usi` の指し手を進めた局面は、手数フィールドを除いて `problems[].sfen` と一致しなければならない。読み込み時にこれを検証し、一致しない場合はエラーとする。
- 出題局面が初形など直前の指し手が存在しない場合は省略する。

### 3.5 analysis

悪手検出に使用した、棋譜解析コメント由来の評価値。

| フィールド        | 型     | 説明                               |
| ----------------- | ------ | ---------------------------------- |
| `scoreBeforeMove` | number | 実戦の手を指す直前の局面の評価値   |
| `scoreAfterMove`  | number | 実戦の手を指した直後の局面の評価値 |

### 3.6 source

出典棋譜の情報。

| フィールド    | 型     | 説明                           |
| ------------- | ------ | ------------------------------ |
| `path`        | string | 棋譜ファイルの絶対パス         |
| `ply`         | number | 実戦の手の手数（1 始まり）     |
| `blackPlayer` | string | 先手の対局者名                 |
| `whitePlayer` | string | 後手の対局者名                 |
| `date`        | string | 対局日（棋譜に記載がある場合） |

`path` はローカル環境に依存するため、ファイルが存在しない場合でも出題機能は動作しなければならない。

## 4. 評価値の表現

- 評価値（`score`）はすべて**先手から見た値**とする（ShogiHome の解析コメントと同じ規約）。
- 詰みが見つかった場合は `score` の代わりに `mate` を記録する。`mate` は詰みまでの手数を符号付きで表し、先手勝ちの場合に正、後手勝ちの場合に負とする。
- 評価値の単位はセンチポーン相当とし、スケールは生成に使用したエンジンに依存する。

## 5. サンプル

```json
{
  "format": "shogihome-next-move",
  "version": 1,
  "metadata": {
    "title": "2026年6月 対局分",
    "createdAt": "2026-07-11T10:30:00+09:00",
    "appVersion": "1.24.0",
    "engine": {
      "name": "Example Engine NNUE",
      "multiPV": 3,
      "maxSecondsPerPosition": 10
    },
    "criteria": {
      "winRateDropThreshold": 20,
      "adoptionWinRateDiff": 15,
      "acceptableWinRateDiff": 5,
      "minWinRate": 20,
      "coefficientInSigmoid": 600,
      "minPly": 20,
      "maxPly": 120
    }
  },
  "problems": [
    {
      "sfen": "ln1g5/1ks4+R1/1pp1p4/p2p1p2p/9/P1P1P3P/1P1P1PP2/1BK1G4/LN5NL b RB2GS2sn2l3p 1",
      "candidates": [
        {
          "usi": "S*8c",
          "score": 850,
          "depth": 24,
          "accepted": true,
          "pv": ["S*8c", "7b8c", "B*7a"]
        },
        {
          "usi": "B*9b",
          "score": 620,
          "depth": 24,
          "accepted": false,
          "pv": ["B*9b", "7b6b"]
        }
      ],
      "actualMove": {
        "usi": "2b2a+",
        "score": 120,
        "scoreSource": "research"
      },
      "previousMove": {
        "usi": "7a8b",
        "sfen": "lnkg5/2s4+R1/1pp1p4/p2p1p2p/9/P1P1P3P/1P1P1PP2/1BK1G4/LN5NL w RB2GS2sn2l3p 1"
      },
      "analysis": {
        "scoreBeforeMove": 780,
        "scoreAfterMove": 150
      },
      "source": {
        "path": "/Users/foo/kifu/20260601-01.kif",
        "ply": 67,
        "blackPlayer": "先手太郎",
        "whitePlayer": "後手次郎"
      }
    }
  ]
}
```
