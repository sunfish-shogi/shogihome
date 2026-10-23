// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchWasmEngine } from "@/background/usi/wasm/runner.js";
import { EngineModuleOptions } from "@/common/wasm-engine/loader.js";
import { PUBLIC_ENGINES_DIR } from "@plugins/builtin_engines.js";

// デスクトップ版の utility プロセスと同じ手順で、本家のエンジンを Node 上で起動する。
describe("background/usi/wasm/runner", () => {
  it("usi と isready に応答すること", async () => {
    const lines: string[] = [];
    const logs: string[] = [];
    const engine = await launchWasmEngine(
      path.join(PUBLIC_ENGINES_DIR, "sunfish4-lite", "engine.json"),
      {
        onReceive: (line) => lines.push(line),
        onLog: (message) => logs.push(message),
      },
    );
    const waitFor = async (expected: string) => {
      for (let i = 0; i < 500 && !lines.includes(expected); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(lines).toContain(expected);
    };
    try {
      engine.postMessage("usi");
      await waitFor("usiok");
      expect(lines.some((line) => line.startsWith("id name "))).toBeTruthy();
      engine.postMessage("isready");
      await waitFor("readyok");
      // dataFiles の評価パラメータが読み込まれていること。
      expect(logs.some((log) => log.startsWith("loaded data file: /eval.bin"))).toBeTruthy();
    } finally {
      engine.terminate();
    }
  }, 20000);

  it("argv をブラウザと同じ値にしてモジュールを生成すること", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-wasm-runner-"));
    try {
      fs.writeFileSync(
        path.join(dir, "engine.json"),
        JSON.stringify({
          abi: "shogihome-wasm-engine/1",
          module: "engine.mjs",
          name: "Fake",
          author: "Fake",
          presets: [{ id: "fake", displayName: "Fake" }],
        }),
      );
      // 受け取ったオプションをそのまま返すだけのモジュール。
      fs.writeFileSync(
        path.join(dir, "engine.mjs"),
        "export default async (options) => ({ options, postMessage() {}," +
          " addMessageListener() {}, removeMessageListener() {}, terminate() {} });\n",
      );
      const engine = await launchWasmEngine(path.join(dir, "engine.json"), {
        onReceive: () => {},
        onLog: () => {},
      });
      const options = (engine as unknown as { options: EngineModuleOptions }).options;
      expect(options.thisProgram).toBe("./this.program");
      expect(options.arguments).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("存在しないエンジン", async () => {
    await expect(
      launchWasmEngine(path.join(PUBLIC_ENGINES_DIR, "not-exists", "engine.json"), {
        onReceive: () => {},
        onLog: () => {},
      }),
    ).rejects.toThrow();
  });
});
