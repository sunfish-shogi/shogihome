import fs from "node:fs";
import path from "node:path";
import { Plugin } from "vite";

// 組み込み WebAssembly エンジンの一覧をビルド時に作る仮想モジュール。
//
// public/engines/<dir>/ に engine.json を含むディレクトリを置けば、そのエンジンが
// 一覧に載る。**ShogiHome のソースを編集する必要は無い。** 別のリポジトリの
// ビルドスクリプトが成果物を配置してビルドするだけで、エンジンを足した版を作れる。
//
// マニフェストの内容はここでは検証しない。engine.json を読むのは実行時 (catalog.ts) で、
// 仕様を満たしているかは適合性テスト (src/tests/engines/) が受け持つ。ここで要るのは
// 「どのディレクトリを読むか」だけである。
//
// 開発サーバーの起動中にエンジンを追加した場合は、サーバーを再起動すること。
export const BUILTIN_ENGINES_MODULE_ID = "virtual:shogihome/builtin-engines";

// Vite の規約に従い、解決後の ID には \0 を付けて他のプラグインに触らせない。
const RESOLVED_MODULE_ID = `\0${BUILTIN_ENGINES_MODULE_ID}`;

export function listBuiltinEngineDirs(enginesDir: string): string[] {
  if (!fs.existsSync(enginesDir)) {
    return [];
  }
  return (
    fs
      .readdirSync(enginesDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && fs.existsSync(path.join(enginesDir, entry.name, "engine.json")),
      )
      .map((entry) => entry.name)
      // 一覧の順序 (= エンジンの並び順) を読み取り順に依存させない。
      .sort()
  );
}

export function builtinEngines(enginesDir: string): Plugin {
  return {
    name: "shogihome-builtin-engines",
    resolveId(id: string) {
      return id === BUILTIN_ENGINES_MODULE_ID ? RESOLVED_MODULE_ID : undefined;
    },
    load(id: string) {
      if (id !== RESOLVED_MODULE_ID) {
        return undefined;
      }
      return `export const BUILTIN_ENGINE_DIRS = ${JSON.stringify(listBuiltinEngineDirs(enginesDir))};\n`;
    },
  };
}
