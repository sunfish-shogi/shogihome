// ダウンロードした WebAssembly エンジンを utility プロセスで動かす。
//
// EngineProcess (engine.ts) からはプロセス型のエンジンの ChildProcess と同じに見える。
// utility プロセスは Electron 自身の実行ファイルを --type=utility で起動したもので、
// ELECTRON_RUN_AS_NODE を使わない。そのため Fuses の runAsNode を無効にしたまま使え、
// OS に依存する実行ファイルを同梱する必要も無い。
import path from "node:path";
import { utilityProcess, UtilityProcess } from "electron";
import { isEngineManifestPath } from "@/common/wasm-engine/package.js";
import { getWasmEngineHostPath } from "@/background/proc/env.js";
import { getUSILogger } from "@/background/log.js";
import { EngineProcessHandle } from "@/background/usi/process.js";
import { WasmEngineHostRequest, WasmEngineHostResponse } from "./protocol.js";

// USIEngine.path が engine.json を指していれば WebAssembly エンジンとして扱う。
export function isWasmEnginePath(enginePath: string): boolean {
  return isEngineManifestPath(enginePath);
}

// kill() で terminate を依頼してから強制終了するまでの猶予。
// 探索の途中で制御を返さないエンジンはメッセージを処理できないため、待ち続けない。
const TERMINATE_GRACE_MS = 1000;

type ReceiveListener = (line: string) => void;
type ErrorListener = (err: Error) => void;
type CloseListener = (code: number | null, signal: NodeJS.Signals | null) => void;

export class WasmEngineProcess implements EngineProcessHandle {
  private handle: UtilityProcess;
  private closed = false;
  private receiveListeners: ReceiveListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private closeListeners: CloseListener[] = [];

  constructor(manifestPath: string) {
    this.handle = utilityProcess.fork(getWasmEngineHostPath(), [], {
      cwd: path.dirname(manifestPath),
      serviceName: `ShogiHome WebAssembly Engine (${path.basename(path.dirname(manifestPath))})`,
      stdio: "pipe",
    });
    // グルーコードが console へ書いたものはログに残す。USI の出力は parentPort で届く。
    this.handle.stdout?.on("data", (data) => {
      getUSILogger().info("wasm-engine stdout: %s", String(data).trimEnd());
    });
    this.handle.stderr?.on("data", (data) => {
      getUSILogger().info("wasm-engine stderr: %s", String(data).trimEnd());
    });
    this.handle.on("message", (message: WasmEngineHostResponse) => {
      switch (message.type) {
        case "receive":
          for (const listener of this.receiveListeners) {
            listener(message.line);
          }
          break;
        case "log":
          getUSILogger().info("wasm-engine: %s", message.message);
          break;
        case "error":
          this.emitError(new Error(message.message));
          break;
      }
    });
    this.handle.on("exit", (code) => {
      this.emitClose(code);
    });
    this.post({ type: "launch", manifestPath });
  }

  get pid(): number | undefined {
    return this.handle.pid;
  }

  on(event: "receive", listener: ReceiveListener): this;
  on(event: "error", listener: ErrorListener): this;
  on(event: "close", listener: CloseListener): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this {
    switch (event) {
      case "receive":
        this.receiveListeners.push(listener);
        break;
      case "error":
        this.errorListeners.push(listener);
        break;
      case "close":
        this.closeListeners.push(listener);
        break;
    }
    return this;
  }

  send(line: string): void {
    this.post({ type: "send", line });
  }

  kill(): void {
    if (this.closed) {
      return;
    }
    // スレッドを持つエンジンが自前の後始末をできるよう、まず terminate() を依頼する。
    this.post({ type: "terminate" });
    const handle = this.handle;
    setTimeout(() => handle.kill(), TERMINATE_GRACE_MS);
  }

  private post(message: WasmEngineHostRequest): void {
    if (this.closed) {
      return;
    }
    this.handle.postMessage(message);
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private emitClose(code: number | null): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const listener of this.closeListeners) {
      listener(code, null);
    }
  }
}
