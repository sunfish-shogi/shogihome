// @vitest-environment node
//
// public/engines/ に置かれた全てのエンジンが specs/wasm-engine-abi.md の仕様を
// 満たしていることを確認する。エンジンを追加すると自動的に検証対象になる。
import fs from "node:fs";
import path from "node:path";
import { parseOptionCommand } from "@/renderer/wasm-engine/protocol.js";
import { Position } from "tsshogi";
import {
  handshake,
  launchEngine,
  listEngineDirs,
  PUBLIC_ENGINES_DIR,
  readManifest,
} from "./driver.js";

const engineDirs = listEngineDirs();

describe("engines/conformance", () => {
  it("エンジンが 1 つ以上配置されていること", () => {
    expect(engineDirs.length).toBeGreaterThan(0);
  });

  describe.each(engineDirs)("%s", (dir) => {
    it("マニフェストと成果物が揃っていること", () => {
      const manifest = readManifest(dir);
      const engineDir = path.join(PUBLIC_ENGINES_DIR, dir);
      expect(fs.existsSync(path.join(engineDir, manifest.module))).toBeTruthy();
      // Emscripten の出力は <module>.js と同じ場所に .wasm を置く。
      const wasm = manifest.module.replace(/\.js$/, ".wasm");
      expect(fs.existsSync(path.join(engineDir, wasm))).toBeTruthy();
      for (const file of manifest.dataFiles || []) {
        expect(fs.existsSync(path.join(engineDir, file.url)), file.url).toBeTruthy();
      }
    });

    it("usi と isready に応答すること", async () => {
      const engine = await launchEngine(dir);
      const received = await handshake(engine);
      expect(received).toContain(`id name ${engine.manifest.name}`);
      expect(received).toContain(`id author ${engine.manifest.author}`);
      expect(received[received.length - 1]).toBe("usiok");

      engine.command("isready");
      await engine.waitFor((line) => line === "readyok", "readyok");
      engine.quit();
    }, 30000);

    it("マニフェストのオプション定義がエンジンの申告と一致すること", async () => {
      const engine = await launchEngine(dir);
      const received = await handshake(engine);
      const declared = received
        .filter((line) => line.startsWith("option "))
        .map((line, index) => parseOptionCommand(line.substring(7), index));
      for (const option of engine.manifest.options || []) {
        const actual = declared.find((o) => o?.name === option.name);
        expect(actual, `option ${option.name} がエンジンから申告されていない`).toBeTruthy();
        expect(actual?.type, `option ${option.name} の型`).toBe(option.type);
      }
      engine.quit();
    }, 30000);

    it("プリセットのオプション値を受け付けること", async () => {
      for (const preset of readManifest(dir).presets) {
        const engine = await launchEngine(dir);
        await handshake(engine);
        for (const [name, value] of Object.entries(preset.values || {})) {
          engine.command(`setoption name ${name} value ${value}`);
        }
        engine.command("isready");
        await engine.waitFor((line) => line === "readyok", "readyok");
        // 不正なオプションでエンジンが落ちていないことを確認する。
        expect(engine.lines.filter((line) => line.startsWith("ERR "))).toEqual([]);
        engine.quit();
      }
    }, 30000);

    it("go が合法手または resign を返すこと", async () => {
      const engine = await launchEngine(dir);
      await handshake(engine);
      engine.command("isready");
      await engine.waitFor((line) => line === "readyok", "readyok");
      engine.command("usinewgame");
      engine.lines.length = 0;
      engine.command("position startpos");
      engine.command("go btime 10000 wtime 10000 byoyomi 1000");
      const result = await engine.waitForResult();
      expect(result.startsWith("bestmove ")).toBeTruthy();
      const usiMove = result.substring("bestmove ".length).split(" ")[0];
      if (usiMove !== "resign" && usiMove !== "win") {
        const position = new Position();
        const move = position.createMoveByUSI(usiMove);
        expect(move, `不正な指し手の表記: ${usiMove}`).toBeTruthy();
        expect(position.doMove(move!), `非合法手: ${usiMove}`).toBeTruthy();
      }
      engine.quit();
    }, 30000);

    it("stop で即座に bestmove を返すこと", async () => {
      const engine = await launchEngine(dir);
      await handshake(engine);
      engine.command("isready");
      await engine.waitFor((line) => line === "readyok", "readyok");
      engine.lines.length = 0;
      engine.command("position startpos");
      // 長い持ち時間を与えても stop で打ち切れること。
      engine.command("go btime 600000 wtime 600000 byoyomi 300000");
      engine.command("stop");
      const result = await engine.waitForResult();
      expect(result.startsWith("bestmove ")).toBeTruthy();
      engine.quit();
    }, 30000);

    it("terminate の後に出力しないこと", async () => {
      const engine = await launchEngine(dir);
      await handshake(engine);
      engine.command("isready");
      await engine.waitFor((line) => line === "readyok", "readyok");
      engine.command("position startpos");
      engine.command("go btime 600000 wtime 600000 byoyomi 300000");
      // 思考中でも terminate() で打ち切れ、以後は何も出力しないこと。
      engine.terminate();
      engine.lines.length = 0;
      for (let i = 0; i < 20; i++) {
        engine.poll();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(engine.lines).toEqual([]);
    }, 30000);

    it("quit の後に出力しないこと", async () => {
      const engine = await launchEngine(dir);
      await handshake(engine);
      engine.command("isready");
      await engine.waitFor((line) => line === "readyok", "readyok");
      engine.command("position startpos");
      engine.command("go btime 600000 wtime 600000 byoyomi 300000");
      engine.quit();
      engine.lines.length = 0;
      for (let i = 0; i < 20; i++) {
        engine.poll();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(engine.lines).toEqual([]);
    }, 30000);
  });

  // プリセットの ID は URI になるため、リポジトリ全体で一意でなければならない。
  it("プリセットの ID が一意であること", () => {
    const ids = new Set<string>();
    for (const dir of engineDirs) {
      for (const preset of readManifest(dir).presets) {
        expect(ids.has(preset.id), `重複したプリセット ID: ${preset.id}`).toBeFalsy();
        ids.add(preset.id);
      }
    }
  });

  // カタログに登録されていないエンジンは一覧に出ない。
  it("配置したエンジンがカタログに登録されていること", async () => {
    const { BUILTIN_ENGINE_DIRS } = await import("@/renderer/wasm-engine/catalog.js");
    for (const dir of engineDirs) {
      expect(BUILTIN_ENGINE_DIRS, `${dir} が BUILTIN_ENGINE_DIRS に無い`).toContain(dir);
    }
    for (const dir of BUILTIN_ENGINE_DIRS) {
      expect(engineDirs, `${dir} の成果物が public/engines/ に無い`).toContain(dir);
    }
  });

  // 意図せず巨大な成果物を commit していないか確認する。
  it("成果物のサイズが妥当であること", () => {
    const LIMIT_MB = 8;
    for (const dir of engineDirs) {
      const engineDir = path.join(PUBLIC_ENGINES_DIR, dir);
      let total = 0;
      const walk = (target: string) => {
        for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
          const child = path.join(target, entry.name);
          if (entry.isDirectory()) {
            walk(child);
          } else {
            total += fs.statSync(child).size;
          }
        }
      };
      walk(engineDir);
      expect(
        total,
        `${dir} が ${LIMIT_MB}MB を超えている。大きなデータファイルは配置方法を再検討すること`,
      ).toBeLessThan(LIMIT_MB * 1024 * 1024);
    }
  });
});
