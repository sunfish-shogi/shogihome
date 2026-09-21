// CLI 版の組み込み WebAssembly エンジンの一覧。
//
// 本来は Vite のプラグインが作る仮想モジュール (plugins/builtin_engines.ts) だが、
// CLI は webpack でバンドルするため、そのままでは解決できない。
// webpack.config.mjs が virtual:shogihome/builtin-engines をこのファイルへ差し替える。
//
// **CLI はネイティブの USI エンジンだけを起動し、WebAssembly エンジンは扱わない。**
// そのため一覧は常に空である。
// (@/renderer/ipc/web.ts 経由で @/renderer/wasm-engine/catalog.ts がバンドルに入るが、
//  CLI では @/command/common/preload.ts が用意した bridge が使われ、web.ts の
//  webAPI は呼ばれない。)
export const BUILTIN_ENGINE_DIRS: string[] = [];
