# 対局中の USI エンジン自動再起動

対局中 (CSA 通信対局・ローカル対局) に USI エンジンのプロセスが異常終了した場合、
新しいプロセスを自動で起動し、異常終了時に実行中だった探索をやり直す。

本機能はオプションであり、無効の場合は既存の実装をそのまま使う。
実装は既存のエンジン管理クラス `USIPlayer` (`src/renderer/players/usi.ts`) を包むラッパーとして作る。

## 現状の挙動 (オプション無効時)

- エンジンが異常終了すると、background の `EngineProcess#onClose` が `errorCallback` を呼ぶが、
  `setupPlayer` (`src/background/usi/index.ts`) の Promise は `usiok` で解決済みのため何も起きない。
  `close` イベントでは統計情報を更新するだけで、renderer には通知されない。
- そのため renderer の `USIPlayer` は `bestmove` を待ち続け、対局は時間切れになるまで止まる。
  - ローカル対局で `enableEngineTimeout` が無効の場合は、時間切れ後に `stop` を送るが応答が無いので進行しない。
  - CSA 通信対局ではサーバーが時間切れ負けを判定する。

オプション無効時は、この挙動を変更しない (下記の通知経路を追加するが、受け取っても何もしない)。

## 用語

- **探索要求**: ゲーム管理クラスが `Player#startSearch` で要求した、自分の手番の探索
  (Ponder ヒットによるものを含む)
- **Ponder 要求**: `Player#startPonder` による相手番の先読み
- **再起動**: 古いプロセスの後始末、新しいプロセスの起動 (`usi` 〜 `usiok`)、
  対局中であれば `isready` 〜 `readyok` と `usinewgame` までの一連の処理

## 設定

| 対象 | 型 | 項目 | 既定値 |
| --- | --- | --- | --- |
| ローカル対局 | `GameSettings` (`src/common/settings/game.ts`) | `restartEngineOnCrash: boolean` | `false` |
| CSA 通信対局 | `CSAGameSettings` (`src/common/settings/csa.ts`) | `restartEngineOnCrash: boolean` | `false` |

- `CSAGameSettings` は `CSAGameSettingsHistory`・`CSAGameSettingsForCLI` と、その変換・正規化関数にも同じ項目を追加する。
  古い設定ファイルでは項目が無いので、正規化で `false` を補う。
- 対局ダイアログ (`GameDialog`)・通信対局ダイアログ (`CSAGameDialog`) にチェックボックスを追加する。
  プレイヤーが USI エンジンの場合のみ意味を持つ。
- usi-csa-bridge (`src/command/usi-csa-bridge`) の設定にも同じ項目を追加する。
- 再起動の試行回数などは当面は定数とし (後述)、設定項目にはしない。

ローカル対局では先手・後手の両方に適用する。連続対局・並列対局 (`parallel.ts`, SPRT) も同じ
`PlayerBuilder` を使うので同様に適用される。

## 構成

```
GameManager / CSAGameManager / ParallelGameManager
        │ Player インターフェース (変更なし)
        ▼
RestartableUSIPlayer   ← 新規 (src/renderer/players/restartable_usi.ts)
        │ 内部に保持・必要に応じて作り直す
        ▼
USIPlayer              ← 既存 (異常終了の通知を受け取る口だけ追加)
        │ IPC
        ▼
background/usi (EngineProcess)  ← 異常終了を renderer に通知する経路を追加
```

### PlayerBuilder

`defaultPlayerBuilder` (`src/renderer/players/builder.ts`) のオプションに
`restartOnCrash?: boolean` を追加する。

- `false` (既定): 従来どおり `USIPlayer` を生成して `launch()` する。
- `true`: `RestartableUSIPlayer` を生成して `launch()` する。
  内部の `USIPlayer` は次のファクトリで生成する。
  `() => new USIPlayer(playerSettings.usi, options, onSearchInfo)`

`onSearchInfo` はファクトリに渡すので、作り直した後も同じコールバックに読み筋が届く。

呼び出し側 (`src/renderer/store/index.ts` の `startGame`・`loginCSAGame`、usi-csa-bridge) は、
対局設定の `restartEngineOnCrash` をこのオプションに渡す。

## 異常終了の検出 (background → renderer)

### 「異常終了」の判定

`src/background/usi/index.ts` の `Session` に `quitRequested: boolean` を追加し、
`quit(sessionID)` / `quitAll()` で `true` にする。プロセスの `close` 時に
`quitRequested` が `false` であれば異常終了とみなす。

`EngineProcess` の `State.WillQuit` では判定しない。
`EngineProcess#onError` (stdin の書き込み失敗など) が内部で `quit()` を呼んで `WillQuit` に遷移するため、
`State` だけでは区別できない。

起動時 (`usiok` より前) の終了は従来どおり `setupPlayer` の reject として扱い、通知しない。

### 通知経路

既存の `onUSIBestMove` などと同じ経路で、次のイベントを追加する。

- `Handlers.onUSIEngineCrashed(sessionID: number)` (`src/background/usi/index.ts`)
- `Renderer.USI_ENGINE_CRASHED` (`src/common/ipc/channel.ts`)
- `src/background/window/ipc.ts` で renderer へ送信
- `Bridge.onUSIEngineCrashed` (`src/renderer/ipc/bridge.ts`)、`preload.ts`・`web.ts` に実装
  - `web.ts`: WebAssembly エンジンのワーカーが異常終了したことを検出できる場合は通知する。
    検出できない場合は何もしない (Web 版ではこの機能は実質的に動作しない)
- `src/renderer/ipc/setup.ts` で `onUSIEngineCrashed` (`src/renderer/players/usi.ts`) に接続
- usi-csa-bridge (`src/command/common/preload.ts`) は `@/renderer/players/usi.js` を
  そのまま `setUSIHandlers` に展開しているので、`usi.ts` からエクスポートすれば自動的に接続される

### USIPlayer への追加

```ts
setCrashHandler(handler?: () => void): void;
onEngineCrashed(): void; // usiPlayers[sessionID] から呼ばれる
```

`onEngineCrashed` はハンドラーが設定されていれば呼び、設定されていなければ API ログに警告を出すだけにする。
オプション無効時はハンドラーを設定しないので、挙動は変わらない。

### background の小修正

- 異常終了で `QuitCompleted` になった `EngineProcess` に対して `quit()` が呼ばれると `WillQuit` に戻ってしまい、
  `isEnginePathInUse`・`isActiveSessionExists` が使用中と誤判定する。
  `quit()` は `QuitCompleted` の場合に何もしないようにする。
- `buildTimeState` で各値を `Math.max(0, Math.floor(...))` で整数ミリ秒に丸める。
  再開時に秒読み・加算時間に端数のある値を渡すため (例: `2.345 * 1e3 = 2345.0000000000005`)。
  既存の値は整数なので、オプション無効時の送信内容は変わらない。

## RestartableUSIPlayer

`Player` インターフェースを実装する。`USIPlayer` の全メソッドを内部の `USIPlayer` に委譲しつつ、
次の状態を持つ。

| フィールド | 内容 |
| --- | --- |
| `inner: USIPlayer` | 現在のプロセスに対応する `USIPlayer` |
| `generation: number` | `inner` を作り直すたびに加算。古い世代からの通知・コールバックを無視するために使う |
| `restarting?: Promise<void>` | 再起動中の処理 |
| `inGame: boolean` | `readyNewGame` 後 `gameover` 前なら `true` |
| `pendingSearch?: PendingSearch` | 未完了の探索要求 (下記) |
| `stopRequested: boolean` | 未完了の探索要求に対して `stop()` が呼ばれたか |
| `restartCount: number` | 現在の対局での再起動回数。`readyNewGame` でリセット |
| `closed: boolean` | `close()` 済み |

```ts
type PendingSearch = {
  position: ImmutablePosition; // clone して保持
  usi: string;
  timeStates: TimeStates; // startSearch に渡された値そのもの
  handler: SearchHandler; // ゲーム管理クラスから渡されたハンドラー
  requestedAt: number; // performance.now() (ローカルの単調時計)
};
```

### 各メソッドの動作

#### `launch()`

`inner` を生成して `launch()` し、`setCrashHandler` で自身の `onCrash(generation)` を登録する。

#### `readyNewGame()`

1. `restartCount = 0`
2. 再起動中なら完了を待つ。対局の合間に異常終了していた場合 (再起動が失敗に終わり `inner` が無効なまま) は、
   ここで再起動する
3. `inner.readyNewGame()` を呼び、`inGame = true`

#### `startSearch(position, usi, timeStates, handler)`

1. `pendingSearch` を記録する (`requestedAt` は呼ばれた時点)。`stopRequested = false`
2. 再起動中でなければ、`inner.startSearch` を **ラップしたハンドラー** で呼ぶ
3. 再起動中であれば何もしない (再起動完了時に `pendingSearch` を発行する)

ラップしたハンドラーは、呼び出し時の `generation` が現在と一致する場合のみ元のハンドラーに転送する。
`onMove`・`onResign`・`onWin` を転送する前に `pendingSearch` を消す。`onError` は消さずに転送する。

#### `startPonder(position, usi, timeStates)`

再起動中なら何もしない (Ponder は再開しない方針のため、要求自体を捨てる)。
それ以外は `inner.startPonder` に委譲する。

#### `startMateSearch(...)`

`inner` に委譲するだけで、再起動後のやり直しはしない (対局では使わない)。
詰み探索中に異常終了した場合は `MateHandler#onError` を呼ぶ。

#### `stop()`

- `pendingSearch` があれば `stopRequested = true`
- 再起動中でなければ `inner.stop()` に委譲

ローカル対局で `enableEngineTimeout` が無効のとき、時間切れになると `stop()` が呼ばれて即座の着手を求められる。
再起動中にこれが起きた場合は、再起動完了後に探索を発行した直後に `stop` を送り、すぐに `bestmove` を返させる。

#### `gameover(result)`

1. `pendingSearch = undefined`, `inGame = false`
2. 再起動中なら完了を待つ
3. `inner` が対局中の状態 (再起動処理で `readyNewGame` 済み) であれば `inner.gameover(result)` を呼ぶ。
   これにより次の `readyNewGame` で `EngineProcess` が `NotReady` から `isready` を送れる

#### `close()`

`closed = true` とし、`pendingSearch` を消し、再起動中であれば完了を待たずに現在の `inner` を `close()` する。
再起動処理は各ステップの後で `closed` を確認し、`true` であれば作ったプロセスを閉じて終了する。

#### その他

- `isEngine()` は `true`
- `name`・`multiPV`・`setMultiPV`・`setUSIInfoCommandHandler` などは `inner` に委譲する。
  `setMultiPV`・`setUSIInfoCommandHandler` で設定した値はラッパーにも保持し、再起動後の `inner` に再適用する
- `sessionID` は現在の `inner.sessionID` を返す

### 異常終了時の処理 (`onCrash(gen)`)

`gen !== generation`、`closed`、または既に再起動中の場合は無視する。

1. 警告をログに出し、利用者に通知する (後述)
2. `restartCount` が上限 (`maxRestartsPerGame = 3`) 以上なら、再起動せず **失敗時の処理** へ
3. `restartCount += 1`、`generation += 1`
4. 古い `inner` を `close()` する (エラーは無視してログのみ)。
   これで `usiPlayers` から古いセッションが外れ、読み筋表示 (`useUSIMonitor`) からも消える
5. 新しい `inner` を生成して `launch()`。続けて `inGame` なら `readyNewGame()`
   - 失敗した場合は 1 秒待って再試行する (`maxLaunchAttempts = 2`)。全て失敗したら **失敗時の処理** へ
   - 各ステップの後で `closed` を確認する
6. `pendingSearch` があれば、残り時間を補正して (後述) `inner.startSearch` を発行する。
   `stopRequested` なら続けて `inner.stop()` を呼ぶ
7. `pendingSearch` が無い (相手番・対局の合間) 場合は何もしない。Ponder は再開しない

再起動中に呼ばれた `startSearch`・`gameover`・`close` は上記の各メソッドの説明のとおり、
`pendingSearch`・`inGame`・`closed` を介して手順 5〜7 に反映される。
例えば相手番に異常終了し、再起動中に相手が着手した場合は、手順 6 で新しい探索要求が発行される。

#### 失敗時の処理

`pendingSearch` があれば、その `handler.onError` にエラー
(`t.engineProcessWasClosedUnexpectedly` に再起動の失敗を付記したもの) を渡す。
`pendingSearch` は残したままにし、対局の扱いはオプション無効時と同じ (時間切れまで待つ) とする。
投了などの自動的な対局終了は行わない。

### 残り時間の補正

探索要求を受けた時点からの経過時間を、**ローカルの単調時計** (`performance.now()`) で計測し、
手番側の持ち時間から差し引く。

```
elapsed = performance.now() - pendingSearch.requestedAt
```

- CSA 通信対局でも、サーバーの時刻やサーバーから受け取る残り時間は使わない。
  `startSearch` に渡された `timeStates` は探索要求の時点の残り時間を表しているので、それを基準にする。
- 再起動に掛かった時間 (プロセス起動・評価関数の読み込み・置換表の確保など) もすべて `elapsed` に含まれる。
- 相手側の時間は変更しない (その間、相手の時計は止まっている)。

手番側 (`position.color`) の `TimeState` を次のように補正する。
`timeMs` は加算時間を加算済みの値であることに注意する (`buildTimeState` の NOTE を参照)。

| 方式 | 補正 |
| --- | --- |
| 秒読み (`byoyomi > 0`) | `rest = timeMs - elapsed`。`rest >= 0` なら `timeMs = rest`。<br>`rest < 0` なら `timeMs = 0`, `byoyomi = max(0, byoyomi * 1000 + rest) / 1000` |
| フィッシャー (`increment > 0`) | `rest = max(0, timeMs - elapsed)`。`timeMs = rest`。<br>`rest < increment * 1000` なら `increment = rest / 1000` (`btime` が 0 になり、残りがすべて `binc` で渡る) |
| 切れ負け | `timeMs = max(0, timeMs - elapsed)` |

補正後の時間が 0 でも探索は発行する。時間切れの判定はゲーム管理クラス (ローカルの時計) と CSA サーバーに任せる。
エンジン側の通信遅延マージン (`NetworkDelay` など) はそのまま働くので、ShogiHome 側では追加のマージンを設けない。

Ponder ヒットだった探索要求も、新しいプロセスには Ponder の状態が無いので通常の `go` になる。
早期 Ponder (`enableEarlyPonder`) の場合も同様で、`go` の時間指定は上記の補正後の値になる。

### 利用者への通知

`RestartableUSIPlayer` のコンストラクターに次のコールバックを渡せるようにする
(`PlayerBuilder` 経由で設定)。

```ts
type RestartEvents = {
  onCrash?: (name: string) => void;
  onRestarted?: (name: string, elapsedMs: number) => void;
  onRestartFailed?: (name: string, e: unknown) => void;
};
```

- GUI: 対局を止めない通知 (`useMessageStore` 等のトースト相当) を表示する。
  `onError` (エラーダイアログ) は再起動に失敗した場合のみ使う。
- usi-csa-bridge: アプリケーションログに出力する。
- いずれもログ (`api.log`) には必ず残す。
- 棋譜コメントへの記録は行わない (将来の検討事項)。

文言は `ja.ts`・`en.ts` に追加し、`zh_tw.ts`・`vi.ts` には `// TODO: Translate` を付けて日本語のまま追加する。

### CSA 通信対局での `usiSessionID`

`CSAGameManager#usiSessionID` は `this.player instanceof USIPlayer` で判定しているため、
ラッパーでは 0 になってしまう。`src/renderer/players/usi.ts` に次の関数を追加し、それを使う。

```ts
export function getUSISessionID(player?: Player): number;
// USIPlayer / RestartableUSIPlayer なら現在の sessionID、それ以外は 0
```

`CSAGameManager` は `Store` のフィールドとして `reactive(this)` 経由で参照されるので、
`inner` をプレーンなフィールドとして持てば、差し替え時に `usiSessionIDs` (通信対局待機ダイアログの
エンジン監視ボタン) も追従する。実装時に表示が追従することを確認する。

## シーケンス例

### 自分の手番に異常終了 (CSA 通信対局・秒読み)

```
CSAGameManager        RestartableUSIPlayer         USIPlayer(旧)   USIPlayer(新)
   startSearch ──────▶ pendingSearch 記録 (t0)
                       inner.startSearch ────────▶ go
                                                    × 異常終了
                       ◀─────── onEngineCrashed ─┘
                       onCrash: 旧 close, 新 launch ─────────────▶ usi/usiok
                                                                   isready/readyok/usinewgame
                       elapsed = now - t0 で補正
                       inner.startSearch ─────────────────────────▶ go (補正後の時間)
   ◀──── onMove ────── (pendingSearch を消して転送) ◀──── bestmove ┘
```

### 相手番 (Ponder 中) に異常終了し、再起動中に相手が着手

```
   startPonder ──────▶ inner.startPonder (go ponder)
                       × 異常終了 → 再起動開始 (Ponder は再開しない)
   startSearch ──────▶ pendingSearch 記録 (t0)。再起動中なので保留
                       再起動完了 → elapsed = now - t0 で補正して go
```

## テスト

- `src/tests/renderer/players/restartable_usi.spec.ts` を追加し、`api` をモックして次を確認する。
  - 探索中の異常終了で再起動し、補正した `timeStates` で `startSearch` が再発行される
    (秒読み・フィッシャー・切れ負け、持ち時間から秒読みへの食い込み)
  - Ponder 中の異常終了では再起動のみで `go ponder` を送らない
  - 再起動中の `startSearch`・`stop`・`gameover`・`close`
  - 古い世代の `bestmove`・異常終了通知を無視する
  - 再起動回数・起動試行回数の上限と失敗時の `onError`
- `src/tests/background/usi/` で、`quit` を呼ばずに終了した場合のみ `onUSIEngineCrashed` が呼ばれること、
  `QuitCompleted` での `quit()` が状態を変えないことを確認する。
- `defaultPlayerBuilder` がオプションに応じて `USIPlayer` / `RestartableUSIPlayer` を返すことを確認する。

## 対象外・将来の検討事項

- 応答しなくなった (プロセスは生きている) エンジンの検出と強制再起動
- 再起動回数などの設定項目化
- 再起動の発生を棋譜コメントに残す
- 再起動に失敗した場合に投了する選択肢
- 検討・詰み探索・棋譜解析での自動再起動
