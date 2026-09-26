// engine-index: デスクトップ版のダウンロード一覧 (docs/engine-index.json) を更新する。
//
// Usage:
//   npx tsx scripts/engine-index.ts sync
//   npx tsx scripts/engine-index.ts add <packageURL> --id <id> [--publisher <name>]
//     [--version <version>] [--description <text>]
//
// sync: 本家のエンジンの項目を、配信物 (docs/webapp/engines/<dir>/) に合わせて作り直す。
//   npm run release が Web 版をビルドした直後に実行する。ハッシュを配信中のファイルから
//   求めるため、public/engines/ を更新しても Web 版をリリースするまで一覧は変わらない。
//   (一覧だけが先に新しいファイルを指すと、誰もインストールできなくなる。)
//
// add: 外部で配信されているエンジンの項目を追加または更新する。
//   <packageURL> は engine.json を置いたディレクトリの URL (末尾は "/")。実際に全ての
//   ファイルを取得して大きさと sha256 を求める。取得先はマニフェストの規則に従う
//   (specs/wasm-engine-abi.md の「6. (d)」)。engine.json・グルーコード・ライセンス全文は
//   パッケージの URL から、.wasm・.data・dataFiles は assetBaseURL (無ければパッケージの URL)
//   から取得する。インストール先ではいずれも engine.json からの相対位置に置かれる。
//
// どちらも書き込む前に、一覧全体が実行時と同じ検証を通ることを確かめる。
// 仕様は specs/wasm-engine-desktop.md を参照。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  EngineManifest,
  MANIFEST_FILE_NAME,
  parseEngineManifest,
} from "@/common/wasm-engine/manifest.js";
import {
  ENGINE_INDEX_FILE_NAME,
  ENGINE_INDEX_FORMAT,
  EnginePackage,
  EnginePackageFile,
  parseEngineIndex,
} from "@/common/wasm-engine/package.js";

const INDEX_PATH = path.join("docs", ENGINE_INDEX_FILE_NAME);
// 本家のエンジンの配信物。一覧からの相対 URL もこれと同じ形になる。
const BUILTIN_ENGINES_DIR = path.join("docs", "webapp", "engines");
const BUILTIN_PACKAGE_URL_PREFIX = "webapp/engines/";
// 検証のときに相対 URL を解決する基準。実際の配信先。
const INDEX_URL = `https://sunfish-shogi.github.io/shogihome/${ENGINE_INDEX_FILE_NAME}`;

const err = (text: string) => process.stderr.write(`${text}\n`);

function usage(): never {
  err("Usage: engine-index sync");
  err(
    "       engine-index add <packageURL> --id <id> [--publisher <name>]" +
      " [--version <version>] [--description <text>]",
  );
  process.exit(1);
}

type IndexFile = { format: string; engines: EnginePackage[] };

function readIndex(): IndexFile {
  if (!fs.existsSync(INDEX_PATH)) {
    return { format: ENGINE_INDEX_FORMAT, engines: [] };
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
}

function writeIndex(index: IndexFile): void {
  const { errors } = parseEngineIndex(index, INDEX_URL);
  if (errors.length) {
    throw new Error(`the engine index is invalid:\n${errors.join("\n")}`);
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
  err(`updated ${INDEX_PATH}`);
}

// 同じ id の項目を置き換える。無ければ末尾に加える。
// 手で書いた description と publisher は、指定が無ければ引き継ぐ。
function upsert(index: IndexFile, entry: EnginePackage): void {
  const i = index.engines.findIndex((e) => e.id === entry.id);
  if (i < 0) {
    index.engines.push(entry);
    return;
  }
  const old = index.engines[i];
  index.engines[i] = {
    ...entry,
    publisher: entry.publisher ?? old.publisher,
    description: entry.description ?? old.description,
  };
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// 版は内容から決める。ファイルが 1 つでも変われば別の版になる。
function versionOf(files: EnginePackageFile[]): string {
  const text = files.map((file) => `${file.path}:${file.sha256}\n`).join("");
  return sha256(Buffer.from(text)).substring(0, 16);
}

function sortFiles(files: EnginePackageFile[]): EnginePackageFile[] {
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function buildEntry(
  manifest: EngineManifest,
  id: string,
  packageURL: string,
  files: EnginePackageFile[],
  options: { version?: string; publisher?: string; description?: string } = {},
): EnginePackage {
  const entry: EnginePackage = {
    id,
    version: options.version || versionOf(files),
    name: manifest.name,
    author: manifest.author,
    licenses: (manifest.licenses || []).map((license) => license.spdx),
    packageURL,
    files,
  };
  if (options.publisher) {
    entry.publisher = options.publisher;
  }
  if (options.description) {
    entry.description = options.description;
  }
  return entry;
}

// ---- sync ----

function listLocalFiles(dir: string): string[] {
  return (
    fs
      .readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
      .map((file) => file.split(path.sep).join("/"))
      // .DS_Store などの隠しファイルは配らない。
      .filter((file) => !file.split("/").some((segment) => segment.startsWith(".")))
  );
}

function sync(): void {
  const index = readIndex();
  const dirs = fs.existsSync(BUILTIN_ENGINES_DIR)
    ? fs
        .readdirSync(BUILTIN_ENGINES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .filter((e) => fs.existsSync(path.join(BUILTIN_ENGINES_DIR, e.name, MANIFEST_FILE_NAME)))
        .map((e) => e.name)
        .sort()
    : [];

  // 配信物から消えた本家のエンジンは一覧からも消す。
  index.engines = index.engines.filter(
    (entry) =>
      !entry.packageURL.startsWith(BUILTIN_PACKAGE_URL_PREFIX) ||
      dirs.includes(
        entry.packageURL.substring(BUILTIN_PACKAGE_URL_PREFIX.length, entry.packageURL.length - 1),
      ),
  );

  for (const dir of dirs) {
    const engineDir = path.join(BUILTIN_ENGINES_DIR, dir);
    const manifest = parseEngineManifest(
      JSON.parse(fs.readFileSync(path.join(engineDir, MANIFEST_FILE_NAME), "utf8")),
    );
    // wasm や評価パラメータが外部にある場合は、ここでは中身を確かめられない。
    // 外部のエンジンと同じく add で登録する。
    if (manifest.assetBaseURL) {
      err(`skip ${dir}: assetBaseURL is declared (use "add" instead)`);
      continue;
    }
    const files = sortFiles(
      listLocalFiles(engineDir).map((file) => {
        const data = fs.readFileSync(path.join(engineDir, file));
        return { path: file, sha256: sha256(data), size: data.byteLength } as EnginePackageFile;
      }),
    );
    upsert(index, buildEntry(manifest, dir, `${BUILTIN_PACKAGE_URL_PREFIX}${dir}/`, files));
  }
  writeIndex(index);
}

// ---- add ----

function parseAddArgs(argv: string[]) {
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

// パッケージを構成するファイル。required が偽のものは存在すれば含める。
function listRemoteFiles(manifest: EngineManifest, packageURL: string) {
  const assetBaseURL = manifest.assetBaseURL || packageURL;
  const moduleDir = path.posix.dirname(manifest.module);
  const besideModule = (extension: string) => {
    const name = path.posix.basename(manifest.module.replace(/\.m?js$/, extension));
    return moduleDir === "." ? name : `${moduleDir}/${name}`;
  };
  // Emscripten が locateFile へ渡すのはファイル名だけなので、assetBaseURL の直下にある。
  const asset = (extension: string) => {
    const local = besideModule(extension);
    return {
      path: local,
      url: manifest.assetBaseURL
        ? new URL(path.posix.basename(local), assetBaseURL).href
        : new URL(local, packageURL).href,
    };
  };
  const inPackage = (file: string) => ({ path: file, url: new URL(file, packageURL).href });
  return [
    { ...inPackage(MANIFEST_FILE_NAME), required: true },
    { ...inPackage(manifest.module), required: true },
    // 古い Emscripten の pthread ビルドが出力するスレッド用のスクリプト。常にグルーコードの隣。
    { ...inPackage(besideModule(".worker.js")), required: false },
    { ...asset(".wasm"), required: true },
    { ...asset(".data"), required: false },
    ...(manifest.dataFiles || []).map((file) => ({
      path: file.url,
      url: new URL(file.url, assetBaseURL).href,
      required: true,
    })),
    ...(manifest.licenses || []).map((license) => ({ ...inPackage(license.file), required: true })),
  ];
}

async function add(argv: string[]): Promise<void> {
  const args = parseAddArgs(argv);
  const packageURL = new URL(args.packageURL).href;
  if (!packageURL.endsWith("/")) {
    throw new Error("packageURL must end with '/'");
  }
  const manifestData = await download(new URL(MANIFEST_FILE_NAME, packageURL).href);
  if (!manifestData) {
    throw new Error(`${MANIFEST_FILE_NAME} not found: ${packageURL}`);
  }
  const manifest = parseEngineManifest(JSON.parse(manifestData.toString("utf8")));

  const files: EnginePackageFile[] = [];
  const seen = new Set<string>();
  for (const file of listRemoteFiles(manifest, packageURL)) {
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

  const index = readIndex();
  upsert(index, buildEntry(manifest, args.id, packageURL, sortFiles(files), args));
  writeIndex(index);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "sync":
      sync();
      break;
    case "add":
      await add(rest);
      break;
    default:
      usage();
  }
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
