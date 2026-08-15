// public/engines/ に配置された WebAssembly エンジンを Node から直接動かすためのヘルパー。
// Worker (src/renderer/wasm-engine/engine.worker.ts) と同じ手順でモジュールを起動する。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EngineFactory,
  EngineInstance,
  validateEngineInstance,
  wrapUMDSource,
} from "@/renderer/wasm-engine/loader.js";
import { EngineManifest, parseEngineManifest } from "@/renderer/wasm-engine/manifest.js";

export const PUBLIC_ENGINES_DIR = path.resolve(import.meta.dirname, "../../../public/engines");

export type EngineHandle = {
  manifest: EngineManifest;
  command(line: string): void;
  poll(): void;
  lines: string[];
  // 条件を満たす行が現れるまで poll しながら待つ。
  waitFor(matcher: (line: string) => boolean, label?: string): Promise<string>;
  // bestmove または checkmate が現れるまで待つ。
  waitForResult(): Promise<string>;
  // USI の quit コマンドを送る。
  quit(): void;
  // モジュールの terminate() を呼ぶ。
  terminate(): void;
};

export function listEngineDirs(): string[] {
  if (!fs.existsSync(PUBLIC_ENGINES_DIR)) {
    return [];
  }
  return fs
    .readdirSync(PUBLIC_ENGINES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function readManifest(dir: string): EngineManifest {
  const file = path.join(PUBLIC_ENGINES_DIR, dir, "engine.json");
  return parseEngineManifest(JSON.parse(fs.readFileSync(file, "utf8")));
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
  const engineDir = path.join(PUBLIC_ENGINES_DIR, dir);
  const manifest = readManifest(dir);
  const modulePath = path.join(engineDir, manifest.module);
  const factory = await importFactory(manifest, modulePath);
  const lines: string[] = [];
  const engine: EngineInstance = validateEngineInstance(
    await factory({
      printErr: (line: string) => lines.push(`ERR ${line}`),
      locateFile: (file: string) => new URL(file, pathToFileURL(modulePath)).href,
    }),
  );
  engine.addMessageListener((line) => lines.push(line));

  // Worker では fetch で取得する部分を、ここではファイルから読み込む。
  for (const file of manifest.dataFiles || []) {
    if (!engine.FS) {
      throw new Error("engine does not expose FS but declares dataFiles");
    }
    const data = fs.readFileSync(path.join(engineDir, file.url));
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
    poll: () => engine.poll?.(),
    async waitFor(matcher, label) {
      for (let i = 0; i < 500; i++) {
        const found = lines.find(matcher);
        if (found !== undefined) {
          return found;
        }
        handle.poll();
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
