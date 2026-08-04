# TypeScript 7 移行計画

TypeScript 7.0 (Go によるネイティブ移植版、開発コード名 "Corsa") への移行方針を定める。

本書の記述は、`typescript@7.0.2` を実際に本リポジトリへインストールして検証した結果に基づく。
検証日時点の最新は `typescript@7.0.2` (`latest`)、次期 API 版は `7.1.0-dev.*` (`next`)。

## 結論 (要約)

- **アプリケーションのソースコードは無変更で移行できる。** `tsconfig.json` も変更不要。
  TS 6.0.3 と TS 7.0.2 で診断結果は完全に一致した。
- **移行のコストは全てツールチェーン側にある。** TypeScript 7.0 はコンパイラ API を同梱しないため、
  API に依存する `vue-tsc` / `typescript-eslint` / `ts-loader` の 3 つが動作しなくなる。
- したがって **`tsc` だけを 7.0 に、API 利用ツールは 6.0 に据え置く「side-by-side 構成」** を採る。
  これは TypeScript チームが公式に用意した移行経路であり、専用パッケージ `@typescript/typescript6` が提供されている。
- 完全移行 (6.0 の同居解消) は、安定した公開 API を備える **TypeScript 7.1 と、それに対応した各ツールのリリース待ち**。

## 1. TypeScript 7.0 の Breaking Changes

### 1-1. 削除されたコンパイラオプション

`typescript@7.0.2` で実際にエラーとなることを確認した。

| オプション                           | 結果                                                                                                   | 本リポジトリ         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------- |
| `target: "es5"`                      | `error TS5108: Option 'target=ES5' has been removed.`                                                  | 該当なし (`ESNext`)  |
| `moduleResolution: "node"`           | `error TS5108: Option 'moduleResolution=node10' has been removed.`                                     | 該当なし (`Bundler`) |
| `module: "amd" \| "umd" \| "system"` | `error TS5108: Option 'module=AMD' has been removed.`                                                  | 該当なし (`ESNext`)  |
| `baseUrl`                            | `error TS5102: Option 'baseUrl' has been removed.` (`paths` を tsconfig.json からの相対で書くよう案内) | 該当なし (未使用)    |
| `esModuleInterop: false`             | `error TS5108: Option 'esModuleInterop=false' has been removed.`                                       | 該当なし (`true`)    |

`ignoreDeprecations: "6.0"` は 7.0.2 でも引き続き受け付けられる (エラーにならない)。

**本リポジトリの `tsconfig.json` / `tsconfig.bg.json` / `tsconfig.lint.json` は、いずれも削除対象のオプションを使っていない。設定変更は不要。**

なお `lib` に指定している `esnext` / `dom` / `dom.iterable` / `scripthost` は 7.0 でも全て提供されている
(ネイティブパッケージ内に `lib.*.d.ts` が 110 ファイル同梱)。

### 1-2. デフォルト値

「7.0 で `strict` などの既定値が変わる」という記述が各所に見られるが、
`--showConfig` および実挙動を 6.0.3 と 7.0.2 で比較した限り**差異は確認できなかった**
(いずれも暗黙の `any` を `TS7006` として報告する)。
本リポジトリは `strict` / `types` / `target` などを明示指定しているため、いずれにせよ影響を受けない。

### 1-3. パッケージ構成の変更

`typescript@7.0.2` の中身は 6.x から根本的に変わっている。

- **コンパイラ本体は Go 製ネイティブバイナリ**になり、`@typescript/typescript-<platform>-<arch>` という
  20 個のプラットフォーム別パッケージが `optionalDependencies` として配布される。
  `typescript` 本体は `getExePath()` でバイナリを解決する薄いラッパーになった。
- **`lib.*.d.ts` の置き場所が変わった。** 標準ライブラリ定義は `typescript/lib/` ではなく
  プラットフォーム別パッケージ (例: `@typescript/typescript-linux-x64/lib/`) に同梱される。
- **`bin` は `tsc` のみ。`tsserver` バイナリは廃止された** (エディタ連携は LSP へ移行)。
- `.tsbuildinfo` の形式が非互換。移行時に削除が必要。

### 1-4. コンパイラ API が同梱されない (最大の Breaking Change)

`typescript@7.0.2` の `exports` は次のとおりで、**従来の API 入口が全て失われている**。

```jsonc
{
  ".": "./lib/version.cjs", // { version, versionMajorMinor } だけ
  "./unstable/sync": "...", // 新 API (プレビュー)
  "./unstable/async": "...",
  "./unstable/ast": "...",
  // ...
}
```

- `import ts from "typescript"` で得られるのは `version` と `versionMajorMinor` のみ。
  `ts.createProgram` / `ts.sys` / `ts.ScriptTarget` などは**存在しない**。
- `typescript/lib/typescript.js`、`typescript/lib/tsc`、`typescript/lib/tsserverlibrary` は
  `exports` に無く、解決できない。
- 新 API は `typescript/unstable/*` に置かれているが名前のとおり暫定であり、
  **安定した公開 API は TypeScript 7.1 で提供予定**。

### 1-5. 公式の移行経路: `@typescript/typescript6`

上記の API 空白期間のために、TypeScript チームは互換パッケージ
[`@typescript/typescript6`](https://www.npmjs.com/package/@typescript/typescript6) を公開している。

実体は TS 6 系を再輸出するだけの薄いパッケージである。

```js
// node_modules/@typescript/typescript6/lib/typescript.js
module.exports = require("@typescript/old");
```

`@typescript/old` は `npm:typescript@^6` のエイリアスで、中身は通常の `typescript@6.0.3`
(従来どおりの API と `lib.*.d.ts` 108 ファイル、`bin` は `tsc` と `tsserver`)。

これを `typescript` という名前でインストールしておけば、`require("typescript")` する
ツール群は従来どおり 6.0 の API を得られる。

## 2. 本リポジトリのツールチェーンへの影響 (実測)

`typescript@7.0.2` を単独でインストールした状態での実測結果。

| ツール              | 用途                                    | TS 7.0 単独での結果                                                                                  |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `tsc`               | `electron:compile` (background の emit) | **動作する。** 4.83s → 0.68s (約 7 倍高速)                                                           |
| `vue-tsc`           | `lint` の型検査                         | **失敗。** `ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc' is not defined by "exports"`                  |
| `typescript-eslint` | `lint` の型情報付き ESLint              | **失敗。** `Error: typescript-eslint does not support TS 7.0.` を明示的に throw                      |
| `ts-loader`         | webpack (`preload` / `usi-csa-bridge`)  | **失敗。** `TypeError: Cannot read properties of undefined (reading 'fileExists')` (`ts.sys` が無い) |
| `tsc-alias`         | `@/` エイリアス解決                     | 影響なし (TypeScript API に非依存)                                                                   |
| `ts-proto`          | `gen-proto`                             | 影響なし (TypeScript API に非依存)                                                                   |
| `tsx`               | 各種スクリプト実行                      | 影響なし (esbuild ベース)                                                                            |
| `vite` / `vitest`   | ビルド・テスト                          | 影響なし (esbuild ベースで型検査をしない)                                                            |

`src/` 配下に `typescript` を直接 import しているコードは存在しないため、**アプリ本体への影響はない**。

### `typescript-eslint` の対応状況

`typescript-eslint@8.66.0` (最新) の `peerDependencies` は `typescript: ">=4.8.4 <6.1.0"` であり、
7.x は範囲外。canary (`8.66.1-alpha.4`) でも同様で、**TS 7 対応版はまだ存在しない**。

同パッケージは TS 7 を検出すると、公式ブログの「Running side-by-side with TypeScript 6.0」節と
追跡 issue [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
を案内して停止する。issue によれば、ESLint が非同期パーサーに未対応であることなどから
**対応は TS 7.1 以降**の見込み。

## 3. 移行方針

`tsc` のみを 7.0 に切り替え、API を必要とするツールは 6.0 に据え置く side-by-side 構成とする。

`package.json` の `devDependencies` を次のようにする。

```
"typescript":   "npm:@typescript/typescript6@^6.0.2"   ... API 利用ツール向け (6.0)
"typescript-7": "npm:typescript@^7.0.2"                ... 型検査・emit 用 (7.0)
```

### 注意点: `tsc` バイナリの衝突

`@typescript/typescript6` は依存として `@typescript/old` (= `typescript@6.0.3`) を引き込み、
**これが `bin.tsc` を宣言しているため `node_modules/.bin/tsc` を奪う**。
実際に検証環境では `npx tsc --version` が `6.0.3` を返した。

そのため、**npm scripts では TS 7 のバイナリを明示的なパスで呼び出す**。

```
"scripts": {
  "tsc7": "node node_modules/typescript-7/bin/tsc"
}
```

`node node_modules/typescript-7/bin/tsc --version` → `Version 7.0.2` を確認済み。
`--watch` (`electron:serve` で使用) もサポートされている。

### 変更するスクリプト

`tsc` を直接呼び出している 3 箇所を差し替える。

| スクリプト               | 変更前                                            | 変更後                                                        |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------- |
| `electron:compile`       | `tsc --project ./tsconfig.bg.json`                | `npm run tsc7 -- --project ./tsconfig.bg.json`                |
| `electron:compile:serve` | 同上                                              | 同上                                                          |
| `electron:serve`         | `tsc --project ./tsconfig.bg.json --sourceMap -w` | `npm run tsc7 -- --project ./tsconfig.bg.json --sourceMap -w` |

`lint` (`vue-tsc` + `eslint`) と webpack (`ts-loader`) は**変更不要**。
`typescript` が 6.0 を指し続けるため、そのまま動作する。

## 4. 実施手順

1. `package.json` の `devDependencies` を上記の 2 エイリアスに差し替える。
2. `scripts` に `tsc7` を追加し、`electron:compile` / `electron:compile:serve` / `electron:serve` を差し替える。
3. `npm install` で `package-lock.json` を更新する。
4. 既存の `.tsbuildinfo` (`dist/tsconfig.bg.tsbuildinfo`、`node_modules/.cache/vue-tsc/`) を削除する。
5. 下記の検証を実行する。

### 検証項目と実測結果

side-by-side 構成で全て確認済み。

| 検証                                                            | 結果                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `tsc7 --project tsconfig.bg.json` (emit)                        | 成功。`dist/src/background/index.js` を出力。**0.68s** (TS6: 4.83s) |
| TS 6.0.3 と 7.0.2 の診断差分 (`src/**/*.ts`, `scripts/**/*.ts`) | **完全に一致** (双方ともエラー 0 件)                                |
| `vue-tsc --noEmit -p tsconfig.lint.json`                        | 成功 (35.5s、TS6 単独時 33.3s と同等)                               |
| `eslint`                                                        | 成功                                                                |
| `webpack --config-name preload` (ts-loader)                     | 成功                                                                |
| `tsc-alias`                                                     | 成功                                                                |
| `vitest run`                                                    | **93 ファイル / 625 テスト 全て成功**                               |
| `vite build`                                                    | 成功 (1.75s)                                                        |
| `npm run verify:lockfile`                                       | 成功 (1368 パッケージ)                                              |
| `npm run audit:scripts`                                         | 成功 (新規パッケージに install スクリプトなし)                      |

### CI・リリースへの影響

- `.github/workflows/` に TypeScript のバージョンを直接指定している箇所はなく、**ワークフローの変更は不要**。
- `release.yml` は windows / macOS / ubuntu のマトリクスでビルドするが、
  `package-lock.json` にはネイティブバイナリのプラットフォーム別パッケージが
  **20 種類すべて記録される** (win32/darwin/linux の x64・arm64 を含む) ため、各 OS で `npm ci` が成立する。
- `scripts/verify-lockfile.mjs` はエイリアス (`pkg.name`) を考慮した実装になっているため、
  今回のエイリアス構成でもそのまま通る (検証済み)。

## 5. 残課題 (TypeScript 7.1 以降で再検討)

side-by-side 構成はあくまで暫定であり、以下が解消され次第、6.0 の同居を解消して完全移行する。

- **TypeScript 7.1 の安定 API リリース。** 現在 `typescript/unstable/*` にあるものが確定するまで、
  API 利用ツールは 6.0 を必要とする。
- **`typescript-eslint` の TS 7 対応** ([#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940))。
  ESLint 側の非同期パーサー対応が前提となるため、時期は未定。
- **`vue-tsc` (Volar) の TS 7 対応。** `typescript/lib/tsc` への依存を解消する必要がある。
- **`ts-loader` の TS 7 対応。** ただし `preload` / `usi-csa-bridge` のバンドルは
  esbuild ベースのローダーへ置き換える選択肢もあり、TS 7 対応を待たずに解消できる可能性がある。

完全移行時には、`typescript` を素の `typescript@7` に戻し、`typescript-7` エイリアスと
`tsc7` スクリプトを削除する。

## 参考

- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) — 「Running side-by-side with TypeScript 6.0」節
- [typescript-eslint#10940 — TS 7 (tsgo) support](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- [`@typescript/typescript6`](https://www.npmjs.com/package/@typescript/typescript6)
