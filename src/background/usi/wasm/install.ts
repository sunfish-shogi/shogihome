// WebAssembly エンジンのパッケージのダウンロードとインストール。
//
// 一覧 (インデックス) は Web 版の配信物の engines/index.json で、本家のエンジンと外部で
// 配信されているエンジンが載る。パッケージは <engines>/<id>@<version>/ に置き、
// USIEngine.path にはその engine.json のパスを入れる。仕様は specs/wasm-engine-desktop.md。
//
// **ダウンロードしたものは全てインデックスの sha256 と照合する。** グルーコードは
// utility プロセスで Node の権限を持って動き、wasm や評価パラメータもその入力になるため。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ReadableStream as NodeReadableStream } from "node:stream/web";
import { net } from "electron";
import {
  EngineIndex,
  EnginePackage,
  EnginePackageFile,
  EnginePackageInstallProgress,
  EnginePackageInstallResult,
  EnginePackageLicense,
  getEnginePackageDirName,
  InstalledEnginePackage,
  InstalledEnginePackageInfo,
  isValidEnginePackageIdentifier,
  parseEngineIndex,
} from "@/common/wasm-engine/package.js";
import { MANIFEST_FILE_NAME, parseEngineManifest } from "@/common/wasm-engine/manifest.js";
import { applyPresetValues } from "@/common/wasm-engine/preset.js";
import { getPredefinedUSIEngineTag, USIEngine } from "@/common/settings/usi.js";
import * as uri from "@/common/uri.js";
import { ghioDomain, ghRepository } from "@/common/links/github.js";
import { t } from "@/common/i18n/index.js";
import { getAppPath } from "@/background/proc/path-electron.js";
import { getPortableExeDir, isDevelopment, isProduction, isTest } from "@/background/proc/env.js";
import { getAppVersion } from "@/background/helpers/electron.js";
import { getAppLogger } from "@/background/log.js";
import { getRelativeEnginePath, resolveEnginePath } from "@/background/usi/path.js";
import { getUSIEngineInfo, isEnginePathInUse } from "@/background/usi/index.js";

const INSTALL_FILE_NAME = "install.json";
const TEMP_DIR_PREFIX = ".tmp-";
const TRASH_DIR_PREFIX = ".trash-";

// 進捗を renderer へ送る間隔。
const PROGRESS_INTERVAL_MS = 200;

export function getEngineIndexURL(): string {
  // 本番では環境変数による差し替えを受け付けない。
  if (!isProduction() && process.env.SHOGIHOME_ENGINE_INDEX_URL) {
    return process.env.SHOGIHOME_ENGINE_INDEX_URL;
  }
  if (isDevelopment() || isTest()) {
    // 開発時は Vite の開発サーバーがインデックスを配信する (plugins/builtin_engines.ts)。
    return "http://localhost:5173/engines/index.json";
  }
  return `https://${ghioDomain}/${ghRepository}/webapp/engines/index.json`;
}

// パッケージの置き場所。ポータブル版では他の設定と同じく実行ファイルの隣に置く。
export function getEnginePackagesDir(): string {
  return path.join(getPortableExeDir() || getAppPath("userData"), "engines");
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// Chromium のネットワークスタック (net.fetch) を使う。
// OS のプロキシ設定や、企業が配布したルート証明書がそのまま効く。
let fetchImpl: Fetch = (url, init) => net.fetch(url, init);

export function setFetchForTesting(fetch: Fetch): void {
  fetchImpl = fetch;
}

function request(url: string, signal?: AbortSignal): Promise<Response> {
  return fetchImpl(url, {
    signal,
    // 配信側 (Cloudflare など) の設定でアプリからの取得を許可できるよう、名乗っておく。
    headers: { "User-Agent": `ShogiHome/${getAppVersion()}` },
  });
}

let lastIndex: EngineIndex | undefined;

export async function fetchEngineIndex(): Promise<EngineIndex> {
  const url = getEngineIndexURL();
  getAppLogger().info("fetch engine index: %s", url);
  const response = await request(url);
  if (!response.ok) {
    throw new Error(`${t.failedToFetchEngineList}: ${url}: ${response.status}`);
  }
  lastIndex = parseEngineIndex(await response.json(), url);
  return lastIndex;
}

async function getPackage(id: string): Promise<EnginePackage> {
  const pkg = (lastIndex || (await fetchEngineIndex())).engines.find((e) => e.id === id);
  if (!pkg) {
    throw new Error(`engine package not found: ${id}`);
  }
  return pkg;
}

function getManifestFile(pkg: { files: EnginePackageFile[] }): EnginePackageFile {
  return pkg.files.find((file) => file.path === MANIFEST_FILE_NAME) as EnginePackageFile;
}

function newHashMismatchError(file: string): Error {
  return new Error(`${t.downloadedFileIsCorrupted}: ${file}`);
}

// 小さなファイルを取得して照合し、中身を返す。
async function downloadSmallFile(file: EnginePackageFile, signal?: AbortSignal): Promise<Buffer> {
  const response = await request(file.url, signal);
  if (!response.ok) {
    throw new Error(`failed to download ${file.url}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength !== file.size || sha256(data) !== file.sha256) {
    throw newHashMismatchError(file.path);
  }
  return data;
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ダウンロードする前に表示するライセンス。engine.json とライセンス全文だけを取得する。
export async function fetchEnginePackageLicenses(id: string): Promise<EnginePackageLicense[]> {
  const pkg = await getPackage(id);
  const manifest = parseEngineManifest(
    JSON.parse((await downloadSmallFile(getManifestFile(pkg))).toString("utf8")),
  );
  const licenses: EnginePackageLicense[] = [];
  for (const license of manifest.licenses || []) {
    const file = pkg.files.find((f) => f.path === license.file);
    if (!file) {
      throw new Error(`license file is not listed in the engine index: ${license.file}`);
    }
    licenses.push({
      subject: license.subject || manifest.name,
      spdx: license.spdx,
      source: license.source,
      text: (await downloadSmallFile(file)).toString("utf8"),
    });
  }
  return licenses;
}

function readInstallFile(dir: string): InstalledEnginePackage | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, INSTALL_FILE_NAME), "utf8"));
  } catch {
    return undefined;
  }
}

function isBroken(dir: string, pkg: InstalledEnginePackage): boolean {
  for (const file of pkg.files) {
    try {
      if (fs.statSync(path.join(dir, file.path)).size !== file.size) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function toInfo(dir: string, pkg: InstalledEnginePackage): InstalledEnginePackageInfo {
  return {
    ...pkg,
    enginePath: getRelativeEnginePath(path.join(dir, MANIFEST_FILE_NAME)),
    broken: isBroken(dir, pkg),
  };
}

export async function listInstalledEnginePackages(): Promise<InstalledEnginePackageInfo[]> {
  const root = getEnginePackagesDir();
  if (!fs.existsSync(root)) {
    return [];
  }
  const packages: InstalledEnginePackageInfo[] = [];
  for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const dir = path.join(root, entry.name);
    const pkg = readInstallFile(dir);
    if (!pkg || entry.name !== getEnginePackageDirName(pkg.id, pkg.version)) {
      continue;
    }
    packages.push(toInfo(dir, pkg));
  }
  return packages.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : b.installedAt - a.installedAt,
  );
}

// インストール済みのファイルを sha256 から引く。同じ内容のファイルはダウンロードせずに複製する。
// (更新で評価パラメータが変わらない場合など、大きなファイルを取り直さないため)
async function collectLocalFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const pkg of await listInstalledEnginePackages()) {
    const dir = path.join(getEnginePackagesDir(), getEnginePackageDirName(pkg.id, pkg.version));
    for (const file of pkg.files) {
      files.set(file.sha256, path.join(dir, file.path));
    }
  }
  return files;
}

// ストリームを書き出しながら大きさと sha256 を確かめる。
async function writeVerified(
  source: Readable,
  dest: string,
  file: EnginePackageFile,
  onData: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const hash = crypto.createHash("sha256");
  let size = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _, callback) {
      size += chunk.byteLength;
      if (size > file.size) {
        callback(newHashMismatchError(file.path));
        return;
      }
      hash.update(chunk);
      onData(chunk.byteLength);
      callback(null, chunk);
    },
  });
  await pipeline(source, verifier, fs.createWriteStream(dest), { signal });
  if (size !== file.size || hash.digest("hex") !== file.sha256) {
    throw newHashMismatchError(file.path);
  }
}

async function copyLocalFile(
  src: string,
  dest: string,
  file: EnginePackageFile,
  onData: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    await writeVerified(fs.createReadStream(src), dest, file, onData, signal);
    return true;
  } catch (e) {
    if (signal?.aborted) {
      throw e;
    }
    // 手元のファイルが壊れていた場合などは、ダウンロードに切り替える。
    getAppLogger().warn("failed to reuse local file: %s: %s", src, e);
    return false;
  }
}

async function downloadFile(
  file: EnginePackageFile,
  dest: string,
  onData: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await request(file.url, signal);
  if (!response.ok || !response.body) {
    throw new Error(`failed to download ${file.url}: ${response.status}`);
  }
  const body = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
  await writeVerified(body, dest, file, onData, signal);
}

// Windows ではセキュリティソフトが書き込み直後のファイルを検査のために掴み、
// rename が EPERM や EBUSY で失敗することがある。少し待って繰り返す。
async function renameWithRetry(src: string, dest: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.promises.rename(src, dest);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** i));
    }
  }
}

function removeDir(dir: string): Promise<void> {
  return fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5 });
}

function randomSuffix(): string {
  return crypto.randomBytes(4).toString("hex");
}

// 実行中のインストール。キャンセルに使う。
const installations = new Map<string, AbortController>();

export function cancelEnginePackageInstall(id: string): void {
  installations.get(id)?.abort();
}

// パッケージを取得して検証し、インストール先へ置く。
// 同じ版が既にある場合は置き換える (壊れたファイルの修復を兼ねる)。
async function installFiles(
  pkg: EnginePackage,
  onProgress: (progress: EnginePackageInstallProgress) => void,
  signal: AbortSignal,
): Promise<string> {
  const root = getEnginePackagesDir();
  const dirName = getEnginePackageDirName(pkg.id, pkg.version);
  const tempDir = path.join(root, `${TEMP_DIR_PREFIX}${dirName}-${randomSuffix()}`);
  const localFiles = await collectLocalFiles();
  const totalBytes = pkg.files.reduce((sum, file) => sum + file.size, 0);
  let receivedBytes = 0;
  let lastNotified = 0;
  const notify = (file?: string, force = false) => {
    const now = Date.now();
    if (force || now - lastNotified >= PROGRESS_INTERVAL_MS) {
      lastNotified = now;
      onProgress({ id: pkg.id, version: pkg.version, receivedBytes, totalBytes, file });
    }
  };

  await fs.promises.mkdir(tempDir, { recursive: true });
  try {
    for (const file of pkg.files) {
      const dest = path.join(tempDir, file.path);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      const start = receivedBytes;
      const onData = (bytes: number) => {
        receivedBytes += bytes;
        notify(file.path);
      };
      notify(file.path, true);
      const local = localFiles.get(file.sha256);
      if (local && (await copyLocalFile(local, dest, file, onData, signal))) {
        continue;
      }
      receivedBytes = start;
      getAppLogger().info("download engine file: %s", file.url);
      await downloadFile(file, dest, onData, signal);
    }
    notify(undefined, true);

    // 取得したマニフェストが仕様を満たしていることと、グルーコードが揃っていることを確かめる。
    const manifest = parseEngineManifest(
      JSON.parse(await fs.promises.readFile(path.join(tempDir, MANIFEST_FILE_NAME), "utf8")),
    );
    const listed = new Set(pkg.files.map((file) => file.path));
    const required = [
      manifest.module,
      ...(manifest.dataFiles || []).map((file) => file.url),
      ...(manifest.licenses || []).map((license) => license.file),
    ];
    for (const file of required) {
      if (!listed.has(file)) {
        throw new Error(`${file} is not listed in the engine index`);
      }
    }

    const installed: InstalledEnginePackage = {
      id: pkg.id,
      version: pkg.version,
      name: pkg.name,
      author: pkg.author,
      publisher: pkg.publisher,
      packageURL: pkg.packageURL,
      files: pkg.files.map((file) => ({ path: file.path, sha256: file.sha256, size: file.size })),
      installedAt: Date.now(),
    };
    await fs.promises.writeFile(
      path.join(tempDir, INSTALL_FILE_NAME),
      JSON.stringify(installed, null, 2),
    );

    const dest = path.join(root, dirName);
    if (fs.existsSync(dest)) {
      if (isEnginePathInUse(path.join(dest, MANIFEST_FILE_NAME))) {
        throw new Error(t.engineIsInUse);
      }
      const trash = path.join(root, `${TRASH_DIR_PREFIX}${dirName}-${randomSuffix()}`);
      await renameWithRetry(dest, trash);
      await renameWithRetry(tempDir, dest);
      await removeDir(trash).catch((e) => {
        getAppLogger().warn("failed to remove old engine files: %s: %s", trash, e);
      });
    } else {
      await renameWithRetry(tempDir, dest);
    }
    return dest;
  } catch (e) {
    await removeDir(tempDir).catch(() => {});
    throw e;
  }
}

// インストールしたエンジンを一度起動し、プリセットごとのエンジン一覧の項目を作る。
async function buildUSIEngines(enginePath: string, timeoutSeconds: number): Promise<USIEngine[]> {
  const base = await getUSIEngineInfo(enginePath, timeoutSeconds);
  const manifest = parseEngineManifest(
    JSON.parse(await fs.promises.readFile(resolveEnginePath(enginePath), "utf8")),
  );
  return manifest.presets.map((preset) => {
    const options = structuredClone(base.options);
    applyPresetValues(options, preset);
    return {
      ...structuredClone(base),
      uri: uri.issueEngineURI(),
      // プリセットごとに別のエンジンとして並ぶため、既定の名前もプリセットのものにする。
      name: preset.displayName,
      defaultName: preset.displayName,
      options,
      tags: preset.tags?.map(getPredefinedUSIEngineTag),
    };
  });
}

export async function installEnginePackage(
  id: string,
  timeoutSeconds: number,
  onProgress: (progress: EnginePackageInstallProgress) => void,
): Promise<EnginePackageInstallResult> {
  if (installations.has(id)) {
    throw new Error(`already installing: ${id}`);
  }
  const controller = new AbortController();
  installations.set(id, controller);
  try {
    const pkg = await getPackage(id);
    getAppLogger().info("install engine package: %s@%s from %s", id, pkg.version, pkg.packageURL);
    const dir = await installFiles(pkg, onProgress, controller.signal);
    const installed = toInfo(dir, readInstallFile(dir) as InstalledEnginePackage);
    const engines = await buildUSIEngines(installed.enginePath, timeoutSeconds);
    return { installed, engines };
  } finally {
    installations.delete(id);
  }
}

export async function uninstallEnginePackage(id: string, version: string): Promise<void> {
  if (!isValidEnginePackageIdentifier(id) || !isValidEnginePackageIdentifier(version)) {
    throw new Error(`invalid engine package: ${id}@${version}`);
  }
  const dir = path.join(getEnginePackagesDir(), getEnginePackageDirName(id, version));
  if (isEnginePathInUse(path.join(dir, MANIFEST_FILE_NAME))) {
    throw new Error(t.engineIsInUse);
  }
  getAppLogger().info("uninstall engine package: %s", dir);
  await removeDir(dir);
}

// 残骸とみなすまでの時間。macOS では複数のインスタンスを起動できるため、
// 別のインスタンスがインストール中のものを消さないよう、古いものだけを対象にする。
const STALE_TEMP_DIR_MS = 24 * 60 * 60 * 1000;

// 中断したインストールの残骸を消す。起動時に呼ぶ。
export async function cleanupEnginePackagesDir(): Promise<void> {
  const root = getEnginePackagesDir();
  if (!fs.existsSync(root)) {
    return;
  }
  for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !(entry.name.startsWith(TEMP_DIR_PREFIX) || entry.name.startsWith(TRASH_DIR_PREFIX))
    ) {
      continue;
    }
    const dir = path.join(root, entry.name);
    const stat = await fs.promises.stat(dir).catch(() => undefined);
    if (stat && Date.now() - stat.mtimeMs > STALE_TEMP_DIR_MS) {
      await removeDir(dir).catch((e) => {
        getAppLogger().warn("failed to remove %s: %s", entry.name, e);
      });
    }
  }
}
