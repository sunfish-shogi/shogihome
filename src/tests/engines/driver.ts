// 組み込み WebAssembly エンジンを Node から直接動かすためのヘルパー。
// Worker (src/renderer/wasm-engine/engine.worker.ts) と同じ手順でモジュールを起動する。
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EngineFactory,
  EngineInstance,
  validateEngineInstance,
  wrapUMDSource,
} from "@/renderer/wasm-engine/loader.js";
import { EngineManifest, parseEngineManifest } from "@/renderer/wasm-engine/manifest.js";
import { builtinEngineRoots } from "@plugins/builtin_engines.js";

// 検証の対象はビルドと同じ置き場所に置かれたディレクトリ全て
// (public/engines/ と、ビルドプロファイルの engines.dirs)。
// **engine.json の有無では絞らない。** 置いたのに一覧へ載らないものをここで落とすため。
const engineDirs = new Map<string, string>(
  builtinEngineRoots().flatMap((root) =>
    fs.existsSync(root)
      ? fs
          .readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => [entry.name, path.join(root, entry.name)] as [string, string])
      : [],
  ),
);

// エンジンの成果物が置かれた場所。
export function engineDirPath(dir: string): string {
  const resolved = engineDirs.get(dir);
  if (!resolved) {
    throw new Error(`engine directory not found: ${dir}`);
  }
  return resolved;
}

export type EngineHandle = {
  manifest: EngineManifest;
  command(line: string): void;
  lines: string[];
  // 条件を満たす行が現れるまで待つ。探索はエンジンが自力で進める。
  waitFor(matcher: (line: string) => boolean, label?: string): Promise<string>;
  // bestmove または checkmate が現れるまで待つ。
  waitForResult(): Promise<string>;
  // USI の quit コマンドを送る。
  quit(): void;
  // モジュールの terminate() を呼ぶ。
  terminate(): void;
};

export function listEngineDirs(): string[] {
  return [...engineDirs.keys()].sort();
}

export function readManifest(dir: string): EngineManifest {
  const file = path.join(engineDirPath(dir), "engine.json");
  return parseEngineManifest(JSON.parse(fs.readFileSync(file, "utf8")));
}

// assetBaseURL が宣言されたエンジンは、wasm と評価パラメータが配布物に含まれない
// (specs/wasm-engine-abi.md の「6. (d)」)。ブラウザでは Worker が fetch で取得するが、
// Node の Emscripten はファイルとしてしか読めないため、ここでは一時ディレクトリへ
// 取得して使う。**取得物は URL ごとに残す。** 同じエンジンを何度も起動する
// 適合性テストで、数十 MB の評価パラメータを毎回取り直さないため。
const assetCacheDir = path.join(os.tmpdir(), "shogihome-engine-assets");

// 解決済みの実体のパス (取得できなかった場合は null)。URL をキーにする。
const resolvedAssets = new Map<string, string | null>();

// マニフェストが指すファイルの実体のパスを返す。取得できない場合は null。
//
// file はエンジンのディレクトリからの相対パス。assetBaseURL が宣言されている場合の
// 取得先は remote で指定する (Emscripten がグルーコードの隣から読むファイルは
// ファイル名だけで要求されるため、そちらは basename になる)。
export async function resolveEngineAsset(
  dir: string,
  file: string,
  remote = file,
): Promise<string | null> {
  const manifest = readManifest(dir);
  if (!manifest.assetBaseURL) {
    const local = path.join(engineDirPath(dir), file);
    return fs.existsSync(local) ? local : null;
  }
  const url = new URL(remote, manifest.assetBaseURL).href;
  const cached = resolvedAssets.get(url);
  if (cached !== undefined) {
    return cached;
  }
  // URL ごとに別のファイル名にする。名前だけでは別のエンジンのものと衝突し得る。
  const digest = crypto.createHash("sha256").update(url).digest("hex").substring(0, 16);
  const target = path.join(assetCacheDir, `${digest}-${path.basename(file)}`);
  let resolved: string | null = null;
  if (fs.existsSync(target)) {
    resolved = target;
  } else {
    const response = await fetch(url);
    if (response.ok) {
      fs.mkdirSync(assetCacheDir, { recursive: true });
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      resolved = target;
    }
  }
  resolvedAssets.set(url, resolved);
  return resolved;
}

// Worker では fetch と Blob URL を使う部分を、ここではファイルと data URL で置き換える。
async function importFactory(manifest: EngineManifest, modulePath: string): Promise<EngineFactory> {
  if (manifest.moduleFormat === "umd") {
    const source = wrapUMDSource(
      fs.readFileSync(modulePath, "utf8"),
      manifest.exportName as string,
    );
    const url = `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
    return (await import(url)).default;
  }
  return (await import(pathToFileURL(modulePath).href)).default;
}

export async function launchEngine(dir: string): Promise<EngineHandle> {
  const engineDir = engineDirPath(dir);
  const manifest = readManifest(dir);
  const modulePath = path.join(engineDir, manifest.module);
  const factory = await importFactory(manifest, modulePath);

  // **locateFile は同期なので、要求され得るファイルは先に用意しておく。**
  // Emscripten がグルーコードの隣から読むのは .wasm と (--preload-file の) .data である。
  const assets = new Map<string, string>();
  for (const file of [
    manifest.module.replace(/\.js$/, ".wasm"),
    manifest.module.replace(/\.js$/, ".data"),
  ]) {
    const resolved = await resolveEngineAsset(dir, file, path.basename(file));
    if (resolved) {
      // Emscripten が locateFile へ渡すのはファイル名だけである。
      assets.set(path.basename(file), resolved);
    }
  }

  const lines: string[] = [];
  const engine: EngineInstance = validateEngineInstance(
    await factory({
      printErr: (line: string) => lines.push(`ERR ${line}`),
      locateFile: (file: string) =>
        pathToFileURL(assets.get(file) || path.join(engineDir, file)).href,
    }),
  );
  engine.addMessageListener((line) => lines.push(line));

  // Worker では fetch で取得する部分を、ここではファイルから読み込む。
  for (const file of manifest.dataFiles || []) {
    if (!engine.FS) {
      throw new Error("engine does not expose FS but declares dataFiles");
    }
    const resolved = await resolveEngineAsset(dir, file.url);
    if (!resolved) {
      throw new Error(`data file not found: ${file.url}`);
    }
    const data = fs.readFileSync(resolved);
    const parent = file.path.substring(0, file.path.lastIndexOf("/"));
    if (parent) {
      engine.FS.mkdirTree(parent);
    }
    engine.FS.writeFile(file.path, new Uint8Array(data));
  }

  const handle: EngineHandle = {
    manifest,
    lines,
    command: (line) => engine.postMessage(line),
    async waitFor(matcher, label) {
      for (let i = 0; i < 500; i++) {
        const found = lines.find(matcher);
        if (found !== undefined) {
          return found;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`timeout waiting for ${label || "line"}: ${lines.join(" / ")}`);
    },
    waitForResult() {
      return handle.waitFor(
        (line) => line.startsWith("bestmove ") || line.startsWith("checkmate "),
        "bestmove/checkmate",
      );
    },
    quit: () => engine.postMessage("quit"),
    terminate: () => engine.terminate(),
  };
  return handle;
}

// usi コマンドを送って usiok までの応答を得る。
export async function handshake(engine: EngineHandle): Promise<string[]> {
  engine.command("usi");
  await engine.waitFor((line) => line === "usiok", "usiok");
  const received = [...engine.lines];
  engine.lines.length = 0;
  return received;
}
