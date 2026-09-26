// デスクトップ版でダウンロードする WebAssembly エンジンのパッケージと、その一覧 (インデックス)。
//
// インデックスはリポジトリの docs/engine-index.json で管理し、GitHub Pages から配信する。
// 本家のエンジンも外部で配信されているエンジンも同じ配列に載せる。
// 仕様は specs/wasm-engine-desktop.md を参照。
//
// **ダウンロードしたグルーコードは Node の権限で動く。** そのためインデックスは
// パッケージを構成する全ファイルの sha256 を持ち、ダウンロードしたものは全て照合する。
import { USIEngine } from "@/common/settings/usi.js";
import { isSafeRelativePath, MANIFEST_FILE_NAME } from "./manifest.js";

export const ENGINE_INDEX_FORMAT = "shogihome-engine-index/1";

// インデックスのファイル名。リポジトリの docs/ 直下に置き、GitHub Pages の直下で配信する。
export const ENGINE_INDEX_FILE_NAME = "engine-index.json";

export type EnginePackageFile = {
  // パッケージのディレクトリからの相対パス。インストール先でもこの位置に置く。
  path: string;
  // 取得先の URL。インデックスではパッケージの URL からの相対でもよいが、
  // parseEngineIndex() が絶対 URL に解決する。
  url: string;
  sha256: string;
  size: number;
};

export type EnginePackage = {
  // パッケージの識別子。インストール先のディレクトリ名にも使う。
  // 外部で配信されるものは "<配布者>.<名前>" のように名前空間を付ける。
  id: string;
  // パッケージの版。内容が変わったら必ず変える。
  version: string;
  name: string;
  author: string;
  // 配布者。本家以外が配信するパッケージで指定する。
  publisher?: string;
  description?: string;
  // 一覧に出すライセンスの SPDX 識別子。全文は engine.json の licenses が指す。
  licenses: string[];
  // パッケージの URL (末尾は "/")。parseEngineIndex() が絶対 URL に解決する。
  packageURL: string;
  files: EnginePackageFile[];
};

export type EngineIndex = {
  format: string;
  engines: EnginePackage[];
  // 検証に失敗して除外した項目の理由。
  errors: string[];
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function fail(message: string): never {
  throw new Error(`invalid engine index: ${message}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : asString(value, path);
}

function asIdentifier(value: unknown, path: string): string {
  const text = asString(value, path);
  if (!isValidEnginePackageIdentifier(text)) {
    fail(`${path} must match ${ID_PATTERN}: ${text}`);
  }
  return text;
}

// パッケージの id と version として妥当かどうか。インストール先のディレクトリ名になる。
export function isValidEnginePackageIdentifier(text: string): boolean {
  return ID_PATTERN.test(text) && !text.includes("..");
}

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

// 取得先として受け付ける URL。https のみ。開発用に localhost の http だけは認める。
export function isAllowedDownloadURL(url: URL): boolean {
  return (
    (url.protocol === "https:" || (url.protocol === "http:" && isLocalhost(url))) && !!url.host
  );
}

function asURL(value: unknown, base: string, path: string): URL {
  const text = asString(value, path);
  let url: URL;
  try {
    url = new URL(text, base);
  } catch {
    fail(`${path} is not a valid URL: ${text}`);
  }
  if (!isAllowedDownloadURL(url)) {
    fail(`${path} must be an https URL: ${text}`);
  }
  if (url.search || url.hash) {
    fail(`${path} must not have query or fragment: ${text}`);
  }
  return url;
}

function parseFile(value: unknown, packageURL: string, path: string): EnginePackageFile {
  const record = asRecord(value, path);
  const filePath = asString(record.path, `${path}.path`);
  if (!isSafeRelativePath(filePath)) {
    fail(`${path}.path must be a safe relative path: ${filePath}`);
  }
  const sha256 = asString(record.sha256, `${path}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    fail(`${path}.sha256 must be a lowercase hex sha256: ${sha256}`);
  }
  const size = record.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    fail(`${path}.size must be a non-negative integer`);
  }
  // url を省略した場合は path をそのまま使う。
  const url = asURL(record.url === undefined ? filePath : record.url, packageURL, `${path}.url`);
  return { path: filePath, url: url.href, sha256, size };
}

function parsePackage(value: unknown, indexURL: string, path: string): EnginePackage {
  const record = asRecord(value, path);
  const packageURL = asURL(record.packageURL, indexURL, `${path}.packageURL`);
  if (!packageURL.pathname.endsWith("/")) {
    fail(`${path}.packageURL must end with "/"`);
  }
  if (!Array.isArray(record.licenses) || record.licenses.length === 0) {
    fail(`${path}.licenses must be a non-empty array`);
  }
  if (!Array.isArray(record.files)) {
    fail(`${path}.files must be an array`);
  }
  const files = record.files.map((file, i) =>
    parseFile(file, packageURL.href, `${path}.files[${i}]`),
  );
  const paths = new Set<string>();
  for (const file of files) {
    // 大文字と小文字を区別しないファイルシステムでも衝突しないようにする。
    const key = file.path.toLowerCase();
    if (paths.has(key)) {
      fail(`${path}.files has duplicated path: ${file.path}`);
    }
    paths.add(key);
  }
  if (!paths.has(MANIFEST_FILE_NAME)) {
    fail(`${path}.files must contain ${MANIFEST_FILE_NAME}`);
  }
  return {
    id: asIdentifier(record.id, `${path}.id`),
    version: asIdentifier(record.version, `${path}.version`),
    name: asString(record.name, `${path}.name`),
    author: asString(record.author, `${path}.author`),
    publisher: asOptionalString(record.publisher, `${path}.publisher`),
    description: asOptionalString(record.description, `${path}.description`),
    licenses: record.licenses.map((license, i) => asString(license, `${path}.licenses[${i}]`)),
    packageURL: packageURL.href,
    files,
  };
}

// インデックスを検証し、URL を絶対 URL に解決する。
//
// **不正な項目は除外し、他の項目には影響させない。** 1 件の誤りで全員がどのエンジンも
// ダウンロードできなくなるのを避けるため。除外した理由は errors に残す。
// 誤りそのものは公開前に単体テスト (src/tests/engines/index.spec.ts) が検出する。
//
// 全体の形式が違う場合 (format や engines の型) は、項目を読み進められないので例外を投げる。
export function parseEngineIndex(json: unknown, indexURL: string): EngineIndex {
  const record = asRecord(json, "index");
  if (record.format !== ENGINE_INDEX_FORMAT) {
    fail(`unsupported format: ${String(record.format)}`);
  }
  if (!Array.isArray(record.engines)) {
    fail("engines must be an array");
  }
  const engines: EnginePackage[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  record.engines.forEach((value, i) => {
    let engine: EnginePackage;
    try {
      engine = parsePackage(value, indexURL, `engines[${i}]`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      return;
    }
    // 同じ id が複数あれば先のものを採る。
    if (ids.has(engine.id)) {
      errors.push(`invalid engine index: engines[${i}].id is duplicated: ${engine.id}`);
      return;
    }
    ids.add(engine.id);
    engines.push(engine);
  });
  return { format: ENGINE_INDEX_FORMAT, engines, errors };
}

export function getEnginePackageSize(files: { size: number }[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

// USIEngine.path がダウンロードした WebAssembly エンジン (engine.json) を指しているかどうか。
// Windows の区切り文字も考慮する。
export function isEngineManifestPath(enginePath: string): boolean {
  return /(^|[\\/])engine\.json$/.test(enginePath);
}

// インストール先のディレクトリ名。
export function getEnginePackageDirName(id: string, version: string): string {
  return `${id}@${version}`;
}

// インストール済みのパッケージ。インストール先の install.json に保存する。
export type InstalledEnginePackage = {
  id: string;
  version: string;
  name: string;
  author: string;
  publisher?: string;
  packageURL: string;
  files: { path: string; sha256: string; size: number }[];
  installedAt: number;
};

// renderer へ渡すインストール済みパッケージの情報。
export type InstalledEnginePackageInfo = InstalledEnginePackage & {
  // USIEngine.path に入れる値 (engine.json のパス)。
  // エンジン一覧の項目がこのパッケージを参照しているかどうかは、これとの一致で判定する。
  enginePath: string;
  // ファイルが欠けていたり、サイズが違ったりする。再インストールで修復できる。
  broken: boolean;
};

// パッケージを構成するファイルのうち、ライセンス表示に使うもの。
export type EnginePackageLicense = {
  subject: string;
  spdx: string;
  source?: string;
  text: string;
};

export type EnginePackageInstallProgress = {
  id: string;
  version: string;
  // 取得を終えた量と全体の量 (バイト)。
  receivedBytes: number;
  totalBytes: number;
  // 取得中のファイル。
  file?: string;
};

// インストールの結果。
export type EnginePackageInstallResult = {
  installed: InstalledEnginePackageInfo;
  // エンジン一覧に追加する項目 (プリセットごとに 1 つ)。
  engines: USIEngine[];
};
