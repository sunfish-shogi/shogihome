// public/engines/ に commit された WebAssembly エンジンを Node から動かすヘルパー。
//
// ベンチマークや自己対局のスクリプトから使う。Emscripten は不要で、
// commit 済みの成果物をそのまま読み込む (src/tests/engines/driver.ts と同じ手順)。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = path.resolve(import.meta.dirname, "..", "..");
export const PUBLIC_ENGINES_DIR = path.join(rootDir, "public", "engines");

// エンジンを起動し、usi と isready を済ませた状態のハンドルを返す。
// options は setoption で送るオプションの名前と値の組。
//
// dir は public/engines/ 配下のディレクトリ名。絶対パスを渡すこともできる。
// 改良の前後をビルドごと比較したい場合は、古い成果物を別の場所に置いて指定する。
export async function launchEngine(dir = "basic", options = {}) {
  const engineDir = path.isAbsolute(dir) ? dir : path.join(PUBLIC_ENGINES_DIR, dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(engineDir, "engine.json"), "utf8"));
  const modulePath = path.join(engineDir, manifest.module);
  const factory = (await import(pathToFileURL(modulePath).href)).default;

  const lines = [];
  const engine = await factory({
    printErr: (line) => lines.push(`ERR ${line}`),
    locateFile: (file) => new URL(file, pathToFileURL(modulePath)).href,
  });
  engine.addMessageListener((line) => lines.push(line));

  const handle = {
    manifest,
    lines,
    send(command) {
      engine.postMessage(command);
    },
    // 条件を満たす行が現れるまで poll しながら待つ。
    async waitFor(matcher, timeoutMs = 60000) {
      const limit = Date.now() + timeoutMs;
      for (;;) {
        const found = lines.find(matcher);
        if (found !== undefined) {
          return found;
        }
        if (Date.now() > limit) {
          throw new Error(`timeout: ${lines.slice(-5).join(" / ")}`);
        }
        engine.poll?.();
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    },
    // position と go を送り、bestmove とその直前の info を返す。
    async search(position, goCommand = "go btime 600000 wtime 600000 byoyomi 30000") {
      lines.length = 0;
      const started = Date.now();
      handle.send(position);
      handle.send(goCommand);
      const result = await handle.waitFor((line) => line.startsWith("bestmove "));
      const info = lines.filter((line) => line.startsWith("info ")).pop() || "";
      const field = (name) => {
        const matched = new RegExp(`\\b${name} (-?\\d+)`).exec(info);
        return matched ? Number(matched[1]) : undefined;
      };
      const scoreMate = field("score mate");
      return {
        elapsedMs: Date.now() - started,
        bestMove: result.substring("bestmove ".length).split(" ")[0],
        depth: field("depth"),
        // info の nodes は反復深化の累計。打ち切られた反復のぶんは含まれない。
        nodes: field("nodes"),
        scoreCP: field("score cp"),
        scoreMate,
        // 評価値の表示用。詰みは "mate N" と表す。
        score: scoreMate !== undefined ? `mate ${scoreMate}` : field("score cp"),
        errors: lines.filter((line) => line.startsWith("ERR ")),
      };
    },
    terminate() {
      engine.terminate();
    },
  };

  handle.send("usi");
  await handle.waitFor((line) => line === "usiok");
  for (const [name, value] of Object.entries(options)) {
    handle.send(`setoption name ${name} value ${value}`);
  }
  handle.send("isready");
  await handle.waitFor((line) => line === "readyok");
  handle.send("usinewgame");
  lines.length = 0;
  return handle;
}

// "Depth=5,Style=ranging_rook" のような指定をオプションの組に変換する。
export function parseOptions(text) {
  const options = {};
  for (const entry of (text || "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 0) {
      throw new Error(`オプションの指定が不正です (名前=値 の形式で指定してください): ${trimmed}`);
    }
    options[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return options;
}

// コマンドライン引数を --name value / --name=value の形で読む。
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const index = token.indexOf("=");
    if (index >= 0) {
      args[token.slice(2, index)] = token.slice(index + 1);
    } else {
      args[token.slice(2)] = argv[i + 1]?.startsWith("--") ? "" : (argv[++i] ?? "");
    }
  }
  return args;
}
