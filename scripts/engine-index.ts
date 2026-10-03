// engine-index: デスクトップ版のダウンロード一覧 (docs/engine-index.json) を更新する。
//
// Usage:
//   npx tsx scripts/engine-index.ts sync
//   npx tsx scripts/engine-index.ts add <packageURL> --id <id>
//     [--version <version>] [--description <text>]
//   npx tsx scripts/engine-index.ts verify [--id <id>] [--index-url <url>]
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
// verify: 一覧が指す全てのファイルを実際の配信先から取得し、存在すること・大きさと sha256 が
//   一致することを確かめる。engine.json が参照するファイル (グルーコード・dataFiles・
//   ライセンス全文) が一覧に載っていることも確かめる。一覧は書き換えない。
//   相対 URL は本番の一覧の URL を基準に解決する。--index-url で基準を差し替えれば、
//   開発用のサーバー (scripts/fake-release-api.mjs) などに向けて確かめられる。
//   問題が 1 つでもあれば終了コード 1 で終わる。
//
// sync と add は書き込む前に、一覧全体が実行時と同じ検証を通ることを確かめる。
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
    "       engine-index add <packageURL> --id <id>" +
      " [--version <version>] [--description <text>]",
  );
  err("       engine-index verify [--id <id>] [--index-url <url>]");
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
// 手で書いた description は、指定が無ければ引き継ぐ。
function upsert(index: IndexFile, entry: EnginePackage): void {
  const i = index.engines.findIndex((e) => e.id === entry.id);
  if (i < 0) {
    index.engines.push(entry);
    return;
  }
  const old = index.engines[i];
  index.engines[i] = {
    ...entry,
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
  options: { version?: string; description?: string } = {},
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

// ファイルを取得しながら大きさと sha256 を求める。大きな評価パラメータもあるため、
// 全体をメモリに載せない。存在しなければ undefined を返す。
async function hashRemote(url: string): Promise<{ sha256: string; size: number } | undefined> {
  const response = await fetch(url);
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok || !response.body) {
    throw new Error(`failed to download ${url}: ${response.status}`);
  }
  const hash = crypto.createHash("sha256");
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    hash.update(value);
    size += value.byteLength;
  }
  return { sha256: hash.digest("hex"), size };
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
    const hashed = await hashRemote(file.url);
    if (!hashed) {
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
      ...hashed,
    } as EnginePackageFile);
  }

  const index = readIndex();
  upsert(index, buildEntry(manifest, args.id, packageURL, sortFiles(files), args));
  writeIndex(index);
}

// ---- verify ----

function parseOptions(argv: string[]): { [key: string]: string } {
  const options: { [key: string]: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) {
      usage();
    }
    options[argv[i].substring(2)] = argv[i + 1];
    i++;
  }
  return options;
}

type VerifiedFile = { ok: true; data?: Buffer } | { ok: false; reason: string };

// ファイルを取得しながら大きさと sha256 を確かめる。大きな評価パラメータもあるため、
// 全体をメモリに載せずにストリームで処理し、宣言より大きくなった時点で打ち切る。
// keepData が真なら、確かめた内容そのものを返す (engine.json の中身の確認に使う)。
async function verifyRemoteFile(file: EnginePackageFile, keepData = false): Promise<VerifiedFile> {
  let response: Response;
  try {
    response = await fetch(file.url);
  } catch (e) {
    return { ok: false, reason: `request failed: ${e instanceof Error ? e.message : e}` };
  }
  if (!response.ok || !response.body) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }
  const hash = crypto.createHash("sha256");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > file.size) {
      await reader.cancel();
      return { ok: false, reason: `size exceeds ${file.size} bytes` };
    }
    hash.update(value);
    if (keepData) {
      chunks.push(value);
    }
  }
  if (size !== file.size) {
    return { ok: false, reason: `size mismatch: expected ${file.size}, actual ${size}` };
  }
  const actual = hash.digest("hex");
  if (actual !== file.sha256) {
    return { ok: false, reason: `sha256 mismatch: expected ${file.sha256}, actual ${actual}` };
  }
  return keepData ? { ok: true, data: Buffer.concat(chunks) } : { ok: true };
}

async function verify(argv: string[]): Promise<void> {
  const options = parseOptions(argv);
  const indexURL = options["index-url"] || INDEX_URL;
  const index = parseEngineIndex(readIndex(), indexURL);
  const problems: string[] = [...index.errors];

  const packages = options.id ? index.engines.filter((e) => e.id === options.id) : index.engines;
  if (options.id && packages.length === 0) {
    problems.push(`engine not found in the index: ${options.id}`);
  }

  for (const pkg of packages) {
    err(`${pkg.id}@${pkg.version} (${pkg.packageURL})`);
    // 検証済みの engine.json の内容。取り直すと検証していない内容を見るおそれがあるため保持する。
    let manifestData: Buffer | undefined;
    for (const file of pkg.files) {
      const isManifest = file.path === MANIFEST_FILE_NAME;
      const result = await verifyRemoteFile(file, isManifest);
      if (result.ok && isManifest) {
        manifestData = result.data;
      }
      err(`  ${result.ok ? "OK  " : "FAIL"} ${file.path}${result.ok ? "" : `: ${result.reason}`}`);
      if (!result.ok) {
        problems.push(`${pkg.id}: ${file.path}: ${result.reason} (${file.url})`);
      }
    }

    // engine.json が参照するファイルが一覧に載っていること。インストール時と同じ確認。
    try {
      if (!manifestData) {
        throw new Error(`${MANIFEST_FILE_NAME} could not be verified`);
      }
      const manifest = parseEngineManifest(JSON.parse(manifestData.toString("utf8")));
      const listed = new Set(pkg.files.map((file) => file.path));
      const required = [
        manifest.module,
        ...(manifest.dataFiles || []).map((file) => file.url),
        ...(manifest.licenses || []).map((license) => license.file),
      ];
      for (const file of required) {
        if (!listed.has(file)) {
          problems.push(`${pkg.id}: ${file} is referenced by ${MANIFEST_FILE_NAME} but not listed`);
        }
      }
    } catch (e) {
      problems.push(`${pkg.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (problems.length) {
    err(`\n${problems.length} problem(s) found:`);
    for (const problem of problems) {
      err(`  - ${problem}`);
    }
    process.exit(1);
  }
  err(`\nverified ${packages.length} engine(s)`);
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
    case "verify":
      await verify(rest);
      break;
    default:
      usage();
  }
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
