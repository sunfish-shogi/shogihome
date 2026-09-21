// engine.json が置かれたディレクトリを指定して、WebAssembly エンジンを Node から動かす。
// Worker (src/renderer/wasm-engine/engine.worker.ts) と同じ手順を Node 上で再現する。
//
// **isready までは進めず、usi の応答を読むところまでを担う。** オプションの申告は
// usiok までに出揃うため、評価パラメータ (dataFiles) の読み込みは必要ない。
//
// NOTE: 適合性テストの src/tests/engines/driver.ts も同じことをするが、あちらは
// ビルドの置き場所から見付けたディレクトリ名を受け取る。scripts から src/tests を
// 参照するのは筋が悪く、逆向きは "../" を禁じた import 制約で書けないため、
// 任意のパスを扱うこちらは別の実装にしている。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  EngineFactory,
  EngineInstance,
  validateEngineInstance,
} from "@/renderer/wasm-engine/loader.js";
import {
  EngineManifest,
  MANIFEST_FILE_NAME,
  parseEngineManifest,
} from "@/renderer/wasm-engine/manifest.js";
import { parseOptionCommand } from "@/renderer/wasm-engine/protocol.js";
import { USIEngineOption } from "@/common/settings/usi.js";

export function readManifest(engineDir: string): EngineManifest {
  const file = path.join(engineDir, MANIFEST_FILE_NAME);
  return parseEngineManifest(JSON.parse(fs.readFileSync(file, "utf8")));
}

// Emscripten はグルーコードと同じ名前で .wasm や .data を出力する。
// **グルーコードの拡張子は .js とは限らない** (ESM の出力は .mjs のこともある)。
function engineAssetName(manifest: EngineManifest, extension: string): string {
  return path.basename(manifest.module.replace(/\.m?js$/, extension));
}

// UMD の成果物を CommonJS として評価する。
//
// Worker では末尾に export 文を足して Blob URL から import() するが、Node で同じことを
// すると ES モジュールとして評価され、Emscripten の Node 向けの経路が壊れる
// (require や __dirname が無いため ReferenceError になる)。
function evaluateUMD(modulePath: string, exportName: string): EngineFactory {
  const source = fs.readFileSync(modulePath, "utf8");
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {${source}\nreturn ${exportName};\n})`,
    { filename: modulePath },
  ) as (
    exports: unknown,
    require: unknown,
    module: unknown,
    filename: string,
    dirname: string,
  ) => EngineFactory;
  const module = { exports: {} };
  return wrapper(
    module.exports,
    createRequire(modulePath),
    module,
    modulePath,
    path.dirname(modulePath),
  );
}

// assetBaseURL が宣言されたエンジンは wasm が配布物に含まれない
// (specs/wasm-engine-abi.md の「6. (d)」)。Emscripten の locateFile は同期なので、
// 要求され得るファイルを先に一時ディレクトリへ取得しておく。
async function fetchRemoteAssets(
  manifest: EngineManifest,
  tempDir: string,
): Promise<Map<string, string>> {
  const assets = new Map<string, string>();
  if (!manifest.assetBaseURL) {
    return assets;
  }
  for (const name of [engineAssetName(manifest, ".wasm"), engineAssetName(manifest, ".data")]) {
    const response = await fetch(new URL(name, manifest.assetBaseURL).href);
    if (!response.ok) {
      continue;
    }
    const file = path.join(tempDir, name);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    assets.set(name, file);
  }
  return assets;
}

// ESM のグルーコードを読み込む。
//
// .js が ES モジュールとして扱われるかは最寄りの package.json の type で決まる。
// エンジン側のビルド出力をそのまま指した場合など、"type": "module" の外に置かれた
// ESM のグルーコードは CommonJS として読まれて失敗するため、.mjs の複製を作って読む。
//
// **複製はエンジンのディレクトリに置く。** pthread を使うエンジンのワーカーは
// グルーコード自身の URL を基準に自分を読み直すため、別の場所に置くと見付けられない。
async function importESM(modulePath: string): Promise<LoadedModule> {
  const load = async (file: string) =>
    (await import(pathToFileURL(file).href)).default as EngineFactory;
  try {
    return { factory: await load(modulePath), path: modulePath, cleanup: () => {} };
  } catch (e) {
    if (!modulePath.endsWith(".js")) {
      throw e;
    }
    const copy = modulePath.replace(/\.js$/, `.shogihome-${process.pid}.mjs`);
    const cleanup = () => fs.rmSync(copy, { force: true });
    fs.copyFileSync(modulePath, copy);
    try {
      return { factory: await load(copy), path: copy, cleanup };
    } catch (retried) {
      cleanup();
      throw retried;
    }
  }
}

// 読み込んだグルーコードと、その後始末。
// path は実際に読み込んだファイル (複製した場合はそちら)。
// Emscripten はここからワーカーを起動するため、複製した場合は複製を渡す。
type LoadedModule = {
  factory: EngineFactory;
  path: string;
  cleanup: () => void;
};

export type EngineHandle = {
  manifest: EngineManifest;
  lines: string[];
  command(line: string): void;
  // 条件を満たす行が現れるまで待つ。
  waitFor(matcher: (line: string) => boolean, label?: string): Promise<string>;
  // エンジンを終了し、一時ファイルを片付ける。
  terminate(): void;
};

export async function launchEngine(engineDir: string): Promise<EngineHandle> {
  const manifest = readManifest(engineDir);
  const modulePath = path.join(engineDir, manifest.module);
  const loaded: LoadedModule =
    manifest.moduleFormat === "umd"
      ? {
          factory: evaluateUMD(modulePath, manifest.exportName as string),
          path: modulePath,
          cleanup: () => {},
        }
      : await importESM(modulePath);

  // 起動に失敗した場合も、そこまでに作った一時ファイルを残さない。
  // 起動できなければ terminate() を呼ぶ相手が居ないため、ここで片付ける。
  let tempDir: string | undefined;
  const cleanup = () => {
    loaded.cleanup();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-engine-"));
    const assets = await fetchRemoteAssets(manifest, tempDir);
    const lines: string[] = [];
    const engine: EngineInstance = validateEngineInstance(
      await loaded.factory({
        printErr: (line: string) => lines.push(`ERR ${line}`),
        // Node の Emscripten はファイルとしてしか読めないため、URL ではなくパスを渡す。
        locateFile: (file: string) => assets.get(file) || path.join(engineDir, file),
        mainScriptUrlOrBlob: loaded.path,
      }),
    );
    engine.addMessageListener((line) => lines.push(line));

    return {
      manifest,
      lines,
      command: (line) => engine.postMessage(line),
      async waitFor(matcher, label) {
        for (let i = 0; i < 3000; i++) {
          const found = lines.find(matcher);
          if (found !== undefined) {
            return found;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`${label || "応答"} を待っている間にタイムアウトしました`);
      },
      terminate() {
        engine.terminate();
        cleanup();
      },
    };
  } catch (e) {
    cleanup();
    throw e;
  }
}

// usi コマンドを送り、エンジンが申告するオプションの定義を読み取る。
export async function readEngineOptions(engineDir: string): Promise<USIEngineOption[]> {
  const engine = await launchEngine(engineDir);
  try {
    engine.command("usi");
    await engine.waitFor((line) => line === "usiok", "usiok");
    return engine.lines
      .filter((line) => line.startsWith("option "))
      .map((line, index) => parseOptionCommand(line.substring(7), index))
      .filter((option): option is USIEngineOption => !!option);
  } finally {
    engine.terminate();
  }
}
