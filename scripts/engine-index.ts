// engine-index: デスクトップ版のダウンロード一覧 (src/background/usi/wasm/engine-index.json) を更新する。
// 一覧はアプリに同梱する (オンラインでは配信しない)。
//
// Usage:
//   npx tsx scripts/engine-index.ts add <packageURL> --id <id>
//     [--version <version>] [--description <text>]
//   npx tsx scripts/engine-index.ts verify [--id <id>]
//
// add: エンジンの項目を追加または更新する。
//   <packageURL> は engine.json を置いたディレクトリの URL (末尾は "/")。実際に全ての
//   ファイルを取得して大きさと sha256 を求める。取得先はマニフェストの規則に従う
//   (specs/wasm-engine-abi.md の「6. (d)」)。engine.json・グルーコード・ライセンス全文は
//   パッケージの URL から、.wasm・.data・dataFiles は assetBaseURL (無ければパッケージの URL)
//   から取得する。インストール先ではいずれも engine.json からの相対位置に置かれる。
//
// verify: 一覧が指す全てのファイルを実際の配信先から取得し、存在すること・大きさと sha256 が
//   一致することを確かめる。engine.json が参照するファイル (グルーコード・dataFiles・
//   ライセンス全文) が一覧に載っていることも確かめる。一覧は書き換えない。
//   問題が 1 つでもあれば終了コード 1 で終わる。
//
// add は書き込む前に、一覧全体が実行時と同じ検証を通ることを確かめる。
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
  ENGINE_INDEX_FORMAT,
  EnginePackage,
  EnginePackageFile,
  parseEngineIndex,
  validateManifestLicenses,
} from "@/common/wasm-engine/package.js";

const INDEX_PATH = path.join("src", "background", "usi", "wasm", "engine-index.json");

const err = (text: string) => process.stderr.write(`${text}\n`);

function usage(): never {
  err(
    "Usage: engine-index add <packageURL> --id <id>" +
      " [--version <version>] [--description <text>]",
  );
  err("       engine-index verify [--id <id>]");
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
  const { errors } = parseEngineIndex(index);
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

  // engine.json は取得し直さず、中身を読んだものの大きさと sha256 を使う。取り直すと、その間に
  // 配信中のものが差し替わった場合に、ライセンスやファイルの構成と sha256 が別の版のものになる。
  const files: EnginePackageFile[] = [
    {
      path: MANIFEST_FILE_NAME,
      sha256: sha256(manifestData),
      size: manifestData.byteLength,
    } as EnginePackageFile,
  ];
  const seen = new Set<string>([MANIFEST_FILE_NAME]);
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
  const index = parseEngineIndex(readIndex());
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

    // engine.json が参照するファイルが一覧に載っていること、ライセンスの申告が一覧と
    // 一致していること。どちらもインストール時と同じ確認。
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
      validateManifestLicenses(manifest, pkg);
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
