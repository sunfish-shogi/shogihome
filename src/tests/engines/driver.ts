// public/engines/ に配置された WebAssembly エンジンを Node から直接動かすためのヘルパー。
// Worker (src/renderer/wasm-engine/engine.worker.ts) と同じ手順でモジュールを起動する。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EngineManifest, parseEngineManifest } from "@/renderer/wasm-engine/manifest.js";

export const PUBLIC_ENGINES_DIR = path.resolve(import.meta.dirname, "../../../public/engines");

type EmscriptenFS = {
  mkdirTree(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
};

type EngineModule = {
  ccall(name: string, returnType: string | null, argTypes: string[], args: unknown[]): unknown;
  FS?: EmscriptenFS;
};

export type EngineHandle = {
  manifest: EngineManifest;
  command(line: string): void;
  poll(): void;
  lines: string[];
  // 条件を満たす行が現れるまで poll しながら待つ。
  waitFor(matcher: (line: string) => boolean, label?: string): Promise<string>;
  // bestmove または checkmate が現れるまで待つ。
  waitForResult(): Promise<string>;
  quit(): void;
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

export async function launchEngine(dir: string): Promise<EngineHandle> {
  const engineDir = path.join(PUBLIC_ENGINES_DIR, dir);
  const manifest = readManifest(dir);
  const imported = await import(pathToFileURL(path.join(engineDir, manifest.module)).href);
  const lines: string[] = [];
  const module: EngineModule = await imported.default({
    print: (line: string) => lines.push(line),
    printErr: (line: string) => lines.push(`ERR ${line}`),
  });

  // Worker では fetch で取得する部分を、ここではファイルから読み込む。
  for (const file of manifest.dataFiles || []) {
    if (!module.FS) {
      throw new Error("engine does not expose FS but declares dataFiles");
    }
    const data = fs.readFileSync(path.join(engineDir, file.url));
    const parent = file.path.substring(0, file.path.lastIndexOf("/"));
    if (parent) {
      module.FS.mkdirTree(parent);
    }
    module.FS.writeFile(file.path, new Uint8Array(data));
  }

  module.ccall("usi_init", null, [], []);

  const handle: EngineHandle = {
    manifest,
    lines,
    command: (line) => module.ccall("usi_command", null, ["string"], [line]),
    poll: () => module.ccall("usi_poll", null, [], []),
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
    quit: () => module.ccall("usi_command", null, ["string"], ["quit"]),
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
