import fs from "node:fs";
import path from "node:path";
import { Plugin } from "vite";
import { buildProfileFromEnv } from "./build_profile.js";

// 組み込み WebAssembly エンジンの一覧をビルド時に作る仮想モジュール。
//
// public/engines/<dir>/ に engine.json を含むディレクトリを置けば、そのエンジンが
// 一覧に載る。**ShogiHome のソースを編集する必要は無い。**
//
// 別のリポジトリのビルドスクリプトは、成果物を public/engines/ へコピーする代わりに、
// ビルドプロファイルの engines.dirs で置き場所を指すこともできる
// (specs/build-profile.md)。この場合も実行時のパスは engines/<dir>/ で変わらず、
// ビルドの出力と開発サーバーの配信をこのプラグインが受け持つ。
//
// マニフェストの内容はここでは検証しない。engine.json を読むのは実行時 (catalog.ts) で、
// 仕様を満たしているかは適合性テスト (src/tests/engines/) が受け持つ。ここで要るのは
// 「どのディレクトリを読むか」だけである。
//
// 開発サーバーの起動中にエンジンを追加した場合は、サーバーを再起動すること。
export const BUILTIN_ENGINES_MODULE_ID = "virtual:shogihome/builtin-engines";

// ディレクトリ名に使える文字。
//
// 実行時は engines/<dir>/ という形の path しか読み込まない
// (catalog.ts の ENGINE_PATH_PATTERN)。この規則から外れた名前をそのまま一覧に載せると、
// ビルドは通るのに実行時の解決で弾かれ、エンジンもそのライセンスも黙って消える。
// **一覧に載せずにビルドを失敗させる。** 置いたはずのエンジンが出てこない理由を
// 利用者側で調べさせないため。
//
// 実行時の規則と揃っていることは適合性テストが確かめる
// (src/tests/engines/conformance.spec.ts が catalog.ts の判定を直接使う)。
// ここで同じ規則を書いているのは、Vite の設定から renderer のコードを
// import できないためである (エイリアスが効かない)。
const ENGINE_DIR_PATTERN = /^[A-Za-z0-9._-]+$/;

// Vite の規約に従い、解決後の ID には \0 を付けて他のプラグインに触らせない。
const RESOLVED_MODULE_ID = `\0${BUILTIN_ENGINES_MODULE_ID}`;

// 本家の置き場所。エンジンの成果物はここに commit される。
export const PUBLIC_ENGINES_DIR = path.resolve(import.meta.dirname, "../public/engines");

// エンジンを探す置き場所。本家の public/engines/ と、ビルドプロファイルが指す場所。
// ビルドの設定と適合性テストが同じ一覧を見るために使う。
export function builtinEngineRoots(): string[] {
  return [PUBLIC_ENGINES_DIR, ...buildProfileFromEnv().engineDirs];
}

export type BuiltinEngine = {
  // ディレクトリ名。実行時の engines/<name>/ に対応する。
  name: string;
  // 成果物の置かれた場所 (絶対パス)。
  dir: string;
};

// 複数の置き場所からエンジンを集める。前に置いたルートほど先に走査する。
//
// **名前が重複したらビルドを失敗させる。** 実行時のパスは engines/<name>/ だけなので、
// どちらか一方しか配信できず、勝った側が置き場所の順序で決まってしまうため。
export function listBuiltinEngines(roots: string[]): BuiltinEngine[] {
  const engines = new Map<string, BuiltinEngine>();
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const dir = path.join(root, entry.name);
      // engine.json の無いディレクトリはエンジンではないので対象外。名前も問わない。
      if (!entry.isDirectory() || !fs.existsSync(path.join(dir, "engine.json"))) {
        continue;
      }
      if (!ENGINE_DIR_PATTERN.test(entry.name)) {
        throw new Error(
          `invalid engine directory name: "${entry.name}" ` +
            `(must match ${ENGINE_DIR_PATTERN}; see specs/wasm-engine-abi.md)`,
        );
      }
      const duplicated = engines.get(entry.name);
      if (duplicated) {
        throw new Error(
          `duplicated engine directory name: "${entry.name}" (${duplicated.dir} and ${dir})`,
        );
      }
      engines.set(entry.name, { name: entry.name, dir });
    }
  }
  // 一覧の順序 (= エンジンの並び順) を読み取り順に依存させない。
  return [...engines.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true }).flatMap((entry) => {
    if (!entry.isFile()) {
      return [];
    }
    return [path.relative(dir, path.join(entry.parentPath, entry.name))];
  });
}

// 開発サーバーで返す Content-Type。
//
// **.wasm は application/wasm でなければならない。** Emscripten の
// instantiateStreaming がこれを見ており、違えばエンジンの起動に失敗する。
const CONTENT_TYPES: { [ext: string]: string } = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export function builtinEngines(): Plugin {
  const engines = listBuiltinEngines(builtinEngineRoots());
  // public/engines/ に置かれたものは Vite が publicDir としてそのまま配る。
  // 外に置かれたものだけ、このプラグインが同じ engines/<name>/ へ載せ替える。
  const external = engines.filter((engine) => path.dirname(engine.dir) !== PUBLIC_ENGINES_DIR);

  return {
    name: "shogihome-builtin-engines",

    resolveId(id: string) {
      return id === BUILTIN_ENGINES_MODULE_ID ? RESOLVED_MODULE_ID : undefined;
    },

    load(id: string) {
      if (id !== RESOLVED_MODULE_ID) {
        return undefined;
      }
      const dirs = engines.map((engine) => engine.name);
      return `export const BUILTIN_ENGINE_DIRS = ${JSON.stringify(dirs)};\n`;
    },

    generateBundle() {
      for (const engine of external) {
        for (const file of listFiles(engine.dir)) {
          this.emitFile({
            type: "asset",
            fileName: `engines/${engine.name}/${file}`,
            source: fs.readFileSync(path.join(engine.dir, file)),
          });
        }
      }
    },

    configureServer(server) {
      if (external.length === 0) {
        return;
      }
      // 実体のパスで持つ。下で読み出し先がこの内側に収まっていることを実体で確かめるため。
      const dirs = new Map(external.map((engine) => [engine.name, fs.realpathSync(engine.dir)]));
      // Vite の静的配信と同じヘッダーを付ける。
      //
      // **Web 版の開発サーバーは cross-origin isolation を要求する**
      // (vite.config-pwa.mts の server.headers)。この場合、Worker として読み込む
      // スクリプトの応答にも COEP が要り、無いと ERR_BLOCKED_BY_RESPONSE で
      // -pthread のエンジンが起動しない。public/engines/ に置いた場合は Vite が
      // 付けているので、外に置いたときだけ挙動が変わることになる。
      //
      // このミドルウェアは Vite の内蔵ミドルウェアより前に入る (SPA フォールバックに
      // engines/ を飲み込ませないため)。ヘッダーを付ける処理もまだ走っていないので、
      // ここで設定済みのものをそのまま写す。
      const headers = server.config.server.headers || {};
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", "http://localhost").pathname;
        const matched = /^\/engines\/([^/]+)\/(.+)$/.exec(pathname);
        const dir = matched && dirs.get(matched[1]);
        if (!dir) {
          next();
          return;
        }
        // 任意のファイルを読み出させないため、エンジンのディレクトリの内側に
        // 収まっていることを確かめる。**シンボリックリンクは path.resolve では
        // 解決されない**ので、実体のパスで判定する。
        // 壊れた百分率エンコード (%zz) は decodeURIComponent が投げる。
        let file;
        try {
          file = fs.realpathSync(path.resolve(dir, decodeURIComponent(matched[2])));
        } catch {
          next();
          return;
        }
        if (!file.startsWith(dir + path.sep)) {
          next();
          return;
        }
        for (const [key, value] of Object.entries(headers)) {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[path.extname(file)] || "application/octet-stream",
        );
        res.end(fs.readFileSync(file));
      });
    },
  };
}
