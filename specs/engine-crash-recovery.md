# 対局中の USI エンジン自動再起動

対局中 (CSA 通信対局・ローカル対局) に USI エンジンのプロセスが異常終了した場合、
新しいプロセスを自動で起動し、異常終了時に実行中だった探索をやり直す。

本機能はオプションであり、無効の場合は既存の実装をそのまま使う。
実装は background の既存のエンジン管理クラス `EngineProcess` (`src/background/usi/engine.ts`) を包む
ラッパー `RestartableEngineProcess` として作り、再起動を background の中で完結させる。
renderer からは同じセッション (sessionID) のまま中のプロセスだけが差し替わって見える。

## 現状の挙動 (オプション無効時)

- エンジンが異常終了すると、`EngineProcess#onClose` が `errorCallback` を呼ぶが、
  `setupPlayer` (`src/background/usi/index.ts`) の Promise は `usiok` で解決済みのため何も起きない。
  `close` イベントでは統計情報を更新するだけで、renderer には通知されない。
- そのため renderer の `USIPlayer` は `bestmove` を待ち続け、対局は時間切れになるまで止まる。
  - ローカル対局で `enableEngineTimeout` が無効の場合は、時間切れ後に `stop` を送るが応答が無いので進行しない。
  - CSA 通信対局ではサーバーが時間切れ負けを判定する。

オプション無効時は、この挙動を変更しない。

## 設計方針

- **再起動は background で完結させる。** renderer (`USIPlayer`・`GameManager`・`CSAGameManager`) には手を入れない。
  sessionID が変わらないので、`USIPlayer` が持つ Ponder・定跡・MultiPV の状態、読み筋表示、
  `CSAGameManager#usiSessionID` などはそのまま使える。
- **`EngineProcess` 自体は変更しない。** ラッパーが内部に `EngineProcess` を持ち、異常終了したら作り直す。
- **相手番の Ponder は再開しない。** 自分の手番の探索だけをやり直す。
- **経過時間はローカルの時計で測る。** 探索を要求された時点から再開までの経過時間を手番側の持ち時間から差し引く。

## 用語

- **探索要求**: renderer から `go` (時間指定あり) または `ponderhit` を要求されたもの。自分の手番の探索
- **Ponder 要求**: renderer から `go ponder` を要求されたもの。相手番の先読み
- **再起動**: 新しい `EngineProcess` の起動 (`usi` 〜 `usiok`)、オプションの再設定、
  必要に応じて `isready` 〜 `readyok` と `usinewgame` までの一連の処理

## 設定

| 対象         | 型                                               | 項目                            | 既定値  |
| ------------ | ------------------------------------------------ | ------------------------------- | ------- |
| ローカル対局 | `GameSettings` (`src/common/settings/game.ts`)   | `restartEngineOnCrash: boolean` | `false` |
| CSA 通信対局 | `CSAGameSettings` (`src/common/settings/csa.ts`) | `restartEngineOnCrash: boolean` | `false` |

- `CSAGameSettings` は `CSAGameSettingsHistory`・`CSAGameSettingsForCLI` と、その変換・正規化関数にも同じ項目を追加する。
  古い設定ファイルでは項目が無いので、正規化で `false` を補う。
- 対局ダイアログ (`GameDialog`)・通信対局ダイアログ (`CSAGameDialog`) にチェックボックスを追加する。
  プレイヤーが USI エンジンの場合のみ意味を持つ。
- usi-csa-bridge (`src/command/usi-csa-bridge`) の設定にも同じ項目を追加する。
- 再起動の試行回数などは当面は定数とし (後述)、設定項目にはしない。

ローカル対局では先手・後手の両方に適用する。連続対局・並列対局 (`parallel.ts`, SPRT) も同じ
`PlayerBuilder` を使うので同様に適用される。

### 設定の受け渡し

`USIEngineLaunchOptions` (`src/common/settings/usi.ts`) に `restartOnCrash?: boolean` を追加する。

1. `src/renderer/store/index.ts` の `startGame`・`loginCSAGame`、および usi-csa-bridge が、
   対局設定の `restartEngineOnCrash` を `defaultPlayerBuilder` のオプション (`USIEngineLaunchOptions`) に渡す
2. `USIPlayer#launch` が既存の `api.usiLaunch(engine, launchOptions)` でそのまま background に渡す
3. `setupPlayer` (`src/background/usi/index.ts`) が `restartOnCrash` を見て、
   `EngineProcess` と `RestartableEngineProcess` のどちらを使うかを決める

検討・解析・詰み探索などは `restartOnCrash` を渡さないので、従来どおり `EngineProcess` を使う。

## 構成

```
renderer (変更なし)
  GameManager / CSAGameManager ─▶ USIPlayer ─▶ api.usiGo / usiPonderHit / ...
                                                    │ IPC (変更なし)
background                                          ▼
  usi/index.ts  Session.process: USIEngineProcess
                    ├─ EngineProcess                (restartOnCrash: false, 既存)
                    └─ RestartableEngineProcess     (restartOnCrash: true, 新規)
                           └─ inner: EngineProcess  (異常終了したら作り直す)
```

### インターフェースの抽出

`src/background/usi/index.ts` が `Session.process` に対して使っているメソッド・プロパティを
インターフェース `USIEngineProcess` として定義し、`EngineProcess` と `RestartableEngineProcess` がそれを実装する。

- `on(event, callback)`、`launch()`、`quit()`、`ready()`、`setOption()`、`go()`、`goPonder()`、
  `goMate()`、`ponderHit()`、`stop()`、`gameover()`、`invoke()`
- `state`、`currentPosition`、`pid`、`lastReceived`、`lastSent`、`commandHistory`

`getUSIEngineInfo`・`sendOptionButtonSignal` は従来どおり `EngineProcess` を直接使う。

## RestartableEngineProcess

新規ファイル `src/background/usi/restartable.ts` に実装する。
コンストラクターの引数は `EngineProcess` と同じ (`path`, `sessionID`, `logger`, `option`) とし、
内部の `EngineProcess` を同じ引数で生成する。sessionID も同じものを使い、ログには再起動の発生を記録する。

### 状態

| フィールド                 | 内容                                                                             |
| -------------------------- | -------------------------------------------------------------------------------- |
| `inner?: EngineProcess`    | 現在のプロセス。再起動中や起動失敗後は無効なことがある                           |
| `generation: number`       | `inner` を作り直すたびに加算。古いプロセスからのコールバックを無視するために使う |
| `launched: boolean`        | 最初の `usiok` を受信済みか。これより前の異常終了は再起動せず従来どおり扱う      |
| `restarting: boolean`      | 再起動処理中か                                                                   |
| `quitRequested: boolean`   | `quit()` が呼ばれたか                                                            |
| `inGame: boolean`          | `ready()` が呼ばれてから `gameover()` が呼ばれるまで `true`                      |
| `readyPending: boolean`    | 外側の `ready()` が `readyok` を待っているか                                     |
| `pending?: PendingRequest` | 未完了の要求 (下記)                                                              |
| `stopRequested: boolean`   | 未完了の探索要求に対して `stop()` が呼ばれたか                                   |
| `options: Map`             | `setOption()` で設定された値 (値を持つもののみ)。再起動後に再送する              |
| `restartCount: number`     | 現在の対局での再起動回数。`ready()` でリセット                                   |
| `callbacks`                | 外側から `on()` で登録されたコールバック                                         |
| `history: CommandHistory`  | 全プロセスを通したコマンド履歴                                                   |

```ts
type PendingRequest =
  | { type: "search"; position: string; timeState: TimeState; requestedAt: number }
  | { type: "ponder"; position: string; timeState?: TimeState }
  | { type: "other"; position: string }; // go infinite・go mate など (対局では使わない)
```

`requestedAt` は `performance.now()` (ローカルの単調時計) の値。

### コールバックの中継

外側から `on()` で登録されたコールバックはラッパーが保持する。
`inner` を生成するたびに、`inner` の各イベントにラッパーの中継関数を登録する。
中継関数は登録時の `generation` が現在と一致する場合のみ動作する。

| `inner` のイベント              | ラッパーの動作                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bestmove`                      | 対応する `pending` を消してから外側へ転送                                                                         |
| `checkmate` 系                  | `pending` を消してから外側へ転送                                                                                  |
| `info`・`goEnd`・`checkmateEnd` | そのまま外側へ転送                                                                                                |
| `command`                       | `history` に追加してから外側へ転送                                                                                |
| `usiok`                         | 初回は `launched = true` として外側へ転送。再起動時は転送せず、再起動処理を進める                                 |
| `ready`                         | `readyPending` なら外側へ転送 (統計の対局数を二重に数えないため、再起動処理だけで行った `isready` では転送しない) |
| `timeout`                       | 初回は外側へ転送。再起動時は転送せず、起動失敗として扱う                                                          |
| `error`                         | `launched` 前は外側へ転送。後は転送せず、続く `close` で異常終了として扱う                                        |
| `close`                         | 下記                                                                                                              |

`close` を受け取ったときの扱い:

- `quitRequested` → 外側へ転送する (正常終了)
- `launched` 前 → 外側へ転送する (起動失敗。従来どおり `setupPlayer` が reject する)
- 再起動中のプロセス → 起動失敗として再試行する
- それ以外 → **異常終了**。再起動処理を開始する

外側への `close` は、ラッパーが最終的に終了したときに 1 回だけ転送する。
これにより `setupPlayer` の統計更新・セッション削除は従来どおり 1 回だけ行われる。

### 外側からの要求

#### `launch()`

`inner` を生成して `launch()` する。

#### `ready()`

1. `restartCount = 0`、`inGame = true`、`readyPending = true`
2. 再起動中なら何もしない (再起動処理の中で `isready` を送る)
3. それ以外は `inner.ready()` を呼ぶ

#### `go(position, timeState)` / `goPonder(position, timeState)` / `goMate(...)`

1. `pending` を記録する。`go` で `timeState` があれば `search` (`requestedAt` は呼ばれた時点)、
   `goPonder` は `ponder`、それ以外は `other`。`stopRequested = false`
2. 再起動中でなければ `inner` に委譲する。再起動中なら何もしない

#### `ponderHit(timeState)`

1. `pending` が `ponder` なら、同じ局面の `search` に置き換える (`requestedAt` は呼ばれた時点)
2. 再起動中でなければ `inner.ponderHit` に委譲する。再起動中なら何もしない

再起動で Ponder が失われた後に `ponderhit` が来た場合は、再起動処理の手順 6 で通常の `go` に変換して送る。
`index.ts` の `ponderHit` は `currentPosition` から手番を求めるので、
ラッパーの `currentPosition` は再起動中も最後に要求された局面を返す。

#### `stop()`

- `pending` があれば `stopRequested = true`
- 再起動中でなければ `inner.stop()` に委譲

ローカル対局で `enableEngineTimeout` が無効のとき、時間切れになると `stop` で即座の着手を求められる。
再起動中にこれが起きた場合は、探索を再発行した直後に `stop` を送り、すぐに `bestmove` を返させる。

#### `gameover(result)`

1. `pending = undefined`、`inGame = false`、`readyPending = false`
2. 再起動中でなければ `inner.gameover(result)` に委譲する
3. 再起動中なら、再起動処理の手順 5 で `isready` を送らないので何もしなくてよい

#### `setOption(name, value)`

値があれば `options` に記録し、再起動中でなければ `inner.setOption` に委譲する。
エンジン設定に保存されたオプションは `EngineProcessOption.engineOptions` で起動のたびに送られるので、
ここで記録するのは対局中に変更されたもの (MultiPV など) だけになる。

#### `quit()`

`quitRequested = true` とし、`inner` があれば `inner.quit()` を呼ぶ。
再起動中に `inner` が無ければ、その場で外側へ `close` を転送する。
再起動処理は各ステップの後で `quitRequested` を確認し、`true` であれば作ったプロセスを `quit()` して終了する。

#### `invoke(type, command)` (監視画面からの手動コマンド)

`inner` があれば委譲する。再起動中は捨ててログに警告を出す。

#### プロパティ

| プロパティ                 | 値                                                                          |
| -------------------------- | --------------------------------------------------------------------------- |
| `state`                    | 再起動中は `State.Restarting` (新設)。それ以外は `inner.state`              |
| `currentPosition`          | 最後に要求された局面 (`pending.position`)。無ければ `inner.currentPosition` |
| `pid`                      | `inner?.pid`                                                                |
| `lastReceived`・`lastSent` | `inner` の値                                                                |
| `commandHistory`           | `history` (プロセスをまたいで連続した履歴)                                  |

`State.Restarting` は監視画面 (`MonitorView`) に状態として表示される。
`isEnginePathInUse`・`isActiveSessionExists` では `QuitCompleted` 以外なので使用中として扱われる。

### 異常終了時の処理 (再起動処理)

1. 警告をログに出し、`history` に SYSTEM コマンド (`restarting: crashed`) を追加し、利用者に通知する (後述)
2. `restartCount` が上限 (`maxRestartsPerGame = 3`) 以上なら、再起動せず **失敗時の処理** へ
3. `restarting = true`、`restartCount += 1`、`generation += 1`
4. 新しい `inner` を生成して `launch()` し、`usiok` を待つ
   - 起動失敗 (`timeout`・`close`) の場合は 1 秒待って再試行する (`maxLaunchAttempts = 2`)。
     全て失敗したら **失敗時の処理** へ
   - 保存されたオプションは `EngineProcessOption.engineOptions` により `EngineProcess` が自動で送る。
     続けて `options` に記録した値を `inner.setOption` で再送する
5. `inGame` なら `inner.ready()` を呼び、`readyok` を待つ (`EngineProcess` が `usinewgame` を送る)。
   `readyPending` なら外側の `ready` コールバックへ転送して `readyPending = false`
6. `restarting = false` とし、`pending` に応じて要求を発行する
   - `search`: 残り時間を補正して (後述) `inner.go(position, timeState)`。`stopRequested` なら続けて `inner.stop()`
   - `ponder`: 何もしない (Ponder は再開しない)。`pending` は残し、後で `ponderhit` が来たら `search` として扱う
   - `other`: 何もしない (対局では使わない)
   - 無し: 何もしない (相手番で Ponder をしていなかった場合、対局の合間など)
7. ログに再起動の完了と所要時間を出し、利用者に通知する

各ステップの後で `quitRequested` を確認する。
再起動中に呼ばれた `go`・`ponderHit`・`stop`・`gameover`・`ready` は、前節のとおり
`pending`・`stopRequested`・`inGame`・`readyPending` を介して手順 5・6 に反映される。
例えば Ponder 中に異常終了し、再起動中に相手が着手した場合は次のようになる。

- Ponder が当たった: renderer は `ponderhit` を送る → `pending` が `search` になり、手順 6 で `go` を送る
- Ponder が外れた: renderer は `go` を送る → `pending` が新しい局面の `search` になり、手順 6 で `go` を送る

#### 失敗時の処理

`restarting = false`、`inner = undefined` とし、ログと利用者への通知でエラーを伝える。
`pending` は残したままにし、対局の扱いはオプション無効時と同じ (時間切れまで待つ) とする。
投了などの自動的な対局終了は行わない。
外側の `ready()` が待っている場合 (`readyPending`) は、外側の `error` コールバックへエラーを転送して reject させる。

以降、外側から `ready()` が呼ばれたら (次の対局の開始)、`restartCount` をリセットしてから再起動処理を行う。
`quit()` が呼ばれたら、その場で外側へ `close` を転送する。

### 残り時間の補正

探索要求を受けた時点 (`go` または `ponderhit` が呼ばれた時点) からの経過時間を、
background の **ローカルの単調時計** (`performance.now()`) で計測し、手番側の持ち時間から差し引く。

```
elapsed = performance.now() - pending.requestedAt
```

- CSA 通信対局でも、サーバーの時刻やサーバーから受け取る残り時間は使わない。
  探索要求の `TimeState` はその時点の残り時間を表しているので、それを基準にする。
- 再起動に掛かった時間 (プロセス起動・評価関数の読み込み・置換表の確保など) もすべて `elapsed` に含まれる。
- 相手側の時間は変更しない (その間、相手の時計は止まっている)。

`TimeState` は USI の形式 (`btime`/`wtime` は加算時間を含まない持ち時間) になっている
(`buildTimeState` を参照)。手番 (`getNextColorFromUSI(position)`) 側の値を次のように補正する。
以下では手番側の `btime`/`wtime` を `time`、`binc`/`winc` を `inc` と書く。

| 方式                        | 判定              | 補正                                                                                                                          |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 秒読み                      | `binc = winc = 0` | `rest = time - elapsed`。`rest >= 0` なら `time = rest`。<br>`rest < 0` なら `time = 0`, `byoyomi = max(0, byoyomi + rest)`   |
| フィッシャー                | `inc > 0`         | `rest = max(0, time + inc - elapsed)`。<br>`rest >= inc` なら `time = rest - inc`。`rest < inc` なら `time = 0`, `inc = rest` |
| 切れ負け (秒読み・加算無し) | 上記以外          | `time = max(0, time - elapsed)`                                                                                               |

- すべての値は `Math.floor` で整数ミリ秒にする。
- 補正後の時間が 0 でも探索は発行する。時間切れの判定はゲーム管理クラス (ローカルの時計) と CSA サーバーに任せる。
- エンジン側の通信遅延マージン (`NetworkDelay` など) はそのまま働くので、ShogiHome 側では追加のマージンを設けない。
- 早期 Ponder (`enableEarlyPonder`) で `ponderhit` に付いてきた `TimeState` も同様に補正して `go` に使う。

補正の関数は `TimeState` と手番と経過時間を受け取る純粋関数として `restartable.ts` に置き、単体でテストする。

### 利用者への通知

`src/background/usi/index.ts` の `Handlers` に次を追加する。

```ts
onUSIEngineRestart(
  sessionID: number,
  event: "crashed" | "restarted" | "failed",
  detail?: { elapsedMs?: number; error?: Error },
): void;
```

- GUI (`src/background/window/ipc.ts`): `crashed`・`restarted` は既存の `sendMessage` で対局を止めない通知を表示する。
  `failed` は `sendError` でエラーとして表示する。
- usi-csa-bridge (`src/command/common/preload.ts`): アプリケーションログに出力する。
- いずれの場合も USI ログには必ず記録する。
- 棋譜コメントへの記録は行わない (将来の検討事項)。

文言は `ja.ts`・`en.ts` に追加し、`zh_tw.ts`・`vi.ts` には `// TODO: Translate` を付けて日本語のまま追加する。

### 統計情報

`setupPlayer` の統計は外側のイベントから更新されるので、ラッパーが中継するイベントのとおりに数えられる。

- 起動回数 (`runCount`) は最初の `usiok` の 1 回だけ数える (再起動の `usiok` は転送しないため)
- 対局数 (`gameCount`) は外側の `ready()` に対応する分だけ数える
- 異常終了したプロセスで実行中だった探索の時間 (`goEnd`) は数えない
- 稼働時間 (`totalUptimeMs`) はラッパーの生成から最終的な終了までになる

再起動回数を統計に加えるかは将来の検討事項とする。

## シーケンス例

### 自分の手番に異常終了 (CSA 通信対局・秒読み)

```
renderer (USIPlayer)     RestartableEngineProcess         EngineProcess(旧)   EngineProcess(新)
  usiGo(pos, ts) ──────▶ pending = search (t0)
                         inner.go ──────────────────────▶ go
                                                           × 異常終了
                         ◀──────────────── close ────────┘
                         再起動: launch ───────────────────────────────────▶ usi / usiok
                                 ready ────────────────────────────────────▶ isready / readyok / usinewgame
                         elapsed = now - t0 で ts を補正
                         inner.go ─────────────────────────────────────────▶ go (補正後の時間)
  ◀──── bestmove ─────── (pending を消して転送) ◀─────────────── bestmove ──┘
```

renderer から見ると、同じ sessionID の `go` に対して少し遅れて `bestmove` が届いただけになる。

### 相手番 (Ponder 中) に異常終了し、再起動中に Ponder が当たった

```
  usiGoPonder ─────────▶ pending = ponder, inner.goPonder (go ponder)
                         × 異常終了 → 再起動開始 (Ponder は再開しない)
  usiPonderHit(ts) ────▶ pending = search (t0)。再起動中なので保留
                         再起動完了 → elapsed = now - t0 で ts を補正して go
```

## テスト

- `src/tests/background/usi/restartable.spec.ts` を追加する。`EngineProcess` をモックし、次を確認する。
  - 探索中の異常終了で再起動し、補正した `TimeState` で `go` が再発行される
  - Ponder 中の異常終了では再起動のみで `go ponder` を送らず、後の `ponderHit` が `go` に変換される
  - 再起動中の `go`・`ponderHit`・`stop`・`gameover`・`ready`・`quit`・`setOption`
  - 古い世代のプロセスからのイベントを無視する
  - 外側の `close`・`usiok`・`ready` がそれぞれ 1 回だけ転送される
  - 最初の `usiok` より前の異常終了は従来どおり `close`・`error` を転送する
  - 再起動回数・起動試行回数の上限と、失敗時の通知
- 残り時間の補正関数を単体でテストする (秒読み・フィッシャー・切れ負け、持ち時間から秒読みへの食い込み、
  加算時間への食い込み、補正後が 0 になる場合、端数の切り捨て)。
- `src/tests/background/usi/index.spec.ts` で、`restartOnCrash` に応じて
  `EngineProcess` / `RestartableEngineProcess` が使われることを確認する。

## 対象外・将来の検討事項

- 応答しなくなった (プロセスは生きている) エンジンの検出と強制再起動
- Web 版 (WebAssembly エンジンは renderer 側の別実装 `src/renderer/wasm-engine` で動くため対象外)
- 再起動回数などの設定項目化
- 再起動の発生を棋譜コメント・統計情報に残す
- 再起動に失敗した場合に投了する選択肢
- 検討・詰み探索・棋譜解析での自動再起動
