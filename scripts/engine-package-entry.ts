// engine-package-entry: 外部で配信されている WebAssembly エンジンを、デスクトップ版の
// ダウンロード一覧 (engines/index.json) に載せるための項目を作る。
//
// Usage:
//   npx tsx scripts/engine-package-entry.ts <packageURL> --id <id> [--publisher <name>]
//     [--version <version>] [--description <text>]
//
// <packageURL> は engine.json を置いたディレクトリの URL (末尾は "/")。
// 実際に全てのファイルを取得して大きさと sha256 を求め、項目を標準出力に書く。
// 出力を plugins/external_engines.json の engines に加えれば、次の Web 版のビルドで
// インデックスに載る (specs/wasm-engine-desktop.md)。
//
// 取得先はマニフェストの規則に従う (specs/wasm-engine-abi.md の「6. (d)」)。
// engine.json・グルーコード・ライセンス全文はパッケージの URL から、.wasm・.data・dataFiles は
// assetBaseURL (無ければパッケージの URL) から取得する。インストール先ではいずれも
// engine.json からの相対位置に置かれる。
import crypto from "node:crypto";
import path from "node:path";
import { EngineManifest, parseEngineManifest } from "@/common/wasm-engine/manifest.js";
import {
  ENGINE_INDEX_FORMAT,
  EnginePackage,
  EnginePackageFile,
  parseEngineIndex,
} from "@/common/wasm-engine/package.js";

const err = (text: string) => process.stderr.write(`${text}\n`);

function usage(): never {
  err(
    "Usage: engine-package-entry <packageURL> --id <id> [--publisher <name>]" +
      " [--version <version>] [--description <text>]",
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const options: { [key: string]: string } = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined) {
        usage();
      }
      options[argv[i].substring(2)] = value;
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length !== 1 || !options.id) {
    usage();
  }
  return { packageURL: positional[0], ...options } as {
    packageURL: string;
    id: string;
    publisher?: string;
    version?: string;
    description?: string;
  };
}

async function download(url: string): Promise<Buffer | undefined> {
  const response = await fetch(url);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`failed to download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// パッケージを構成するファイル。required が偽のものは存在すれば含める。
function listFiles(manifest: EngineManifest, packageURL: string) {
  const assetBaseURL = manifest.assetBaseURL || packageURL;
  const moduleDir = path.posix.dirname(manifest.module);
  const sibling = (extension: string) => {
    const name = path.posix.basename(manifest.module.replace(/\.m?js$/, extension));
    return {
      path: moduleDir === "." ? name : `${moduleDir}/${name}`,
      // Emscripten が locateFile へ渡すのはファイル名だけなので、assetBaseURL の直下にある。
      url: manifest.assetBaseURL
        ? new URL(name, assetBaseURL).href
        : new URL(moduleDir === "." ? name : `${moduleDir}/${name}`, packageURL).href,
    };
  };
  return [
    { path: "engine.json", url: new URL("engine.json", packageURL).href, required: true },
    { path: manifest.module, url: new URL(manifest.module, packageURL).href, required: true },
    // 古い Emscripten の pthread ビルドが出力するスレッド用のスクリプト。常にグルーコードの隣。
    {
      ...sibling(".worker.js"),
      url: new URL(sibling(".worker.js").path, packageURL).href,
      required: false,
    },
    { ...sibling(".wasm"), required: true },
    { ...sibling(".data"), required: false },
    ...(manifest.dataFiles || []).map((file) => ({
      path: file.url,
      url: new URL(file.url, assetBaseURL).href,
      required: true,
    })),
    ...(manifest.licenses || []).map((license) => ({
      path: license.file,
      url: new URL(license.file, packageURL).href,
      required: true,
    })),
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageURL = new URL(args.packageURL).href;
  if (!packageURL.endsWith("/")) {
    throw new Error("packageURL must end with '/'");
  }
  const manifestData = await download(new URL("engine.json", packageURL).href);
  if (!manifestData) {
    throw new Error(`engine.json not found: ${packageURL}`);
  }
  const manifest = parseEngineManifest(JSON.parse(manifestData.toString("utf8")));

  const files: EnginePackageFile[] = [];
  const seen = new Set<string>();
  for (const file of listFiles(manifest, packageURL)) {
    if (seen.has(file.path)) {
      continue;
    }
    seen.add(file.path);
    err(`downloading ${file.url}`);
    const data = await download(file.url);
    if (!data) {
      if (file.required) {
        throw new Error(`not found: ${file.url}`);
      }
      continue;
    }
    // パッケージの URL からの相対で表せるものは url を省く。
    const relative = file.url === new URL(file.path, packageURL).href;
    files.push({
      path: file.path,
      ...(relative ? {} : { url: file.url }),
      sha256: sha256(data),
      size: data.byteLength,
    } as EnginePackageFile);
  }

  // 版の算出をビルドのプラグイン (plugins/builtin_engines.ts) と揃えるため、パスの順に並べる。
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  const version =
    args.version ||
    sha256(Buffer.from(files.map((file) => `${file.path}:${file.sha256}\n`).join(""))).substring(
      0,
      16,
    );
  const entry: EnginePackage = {
    id: args.id,
    version,
    name: manifest.name,
    author: manifest.author,
    publisher: args.publisher,
    description: args.description,
    licenses: (manifest.licenses || []).map((license) => license.spdx),
    packageURL,
    files,
  };
  // 実行時と同じ検証を通しておく。
  parseEngineIndex({ format: ENGINE_INDEX_FORMAT, engines: [entry] }, packageURL);
  process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
