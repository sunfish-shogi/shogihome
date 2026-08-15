// エンジンとの行単位の入出力を抽象化する。
// Web 版では Worker 上の WebAssembly エンジンが実体になる。
// (Electron 版は子プロセスの標準入出力を使うが、そちらは src/background/usi/ が担当する。)
import { resolveEngineDirURL } from "./catalog.js";

export interface EngineTransport {
  on(event: "receive", listener: (line: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  send(line: string): void;
  close(): void;
}

// USIEngine.path を受け取ってトランスポートを生成する。テストではモックに差し替える。
export type EngineTransportFactory = (path: string) => EngineTransport;

type ReceiveListener = (line: string) => void;
type ErrorListener = (error: Error) => void;
type CloseListener = () => void;

// terminate() を送ってから Worker を強制終了するまでの猶予。
// 探索の途中で制御を返さないエンジンはメッセージを処理できないため、待ち続けない。
const TERMINATE_GRACE_MS = 1000;

// Worker 上で Emscripten モジュールを動かし、その標準出力を行単位で中継する。
export class WasmEngineTransport implements EngineTransport {
  private worker: Worker;
  private closed = false;
  private receiveListeners: ReceiveListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private closeListeners: CloseListener[] = [];

  constructor(
    baseURL: string,
    private onLog?: (message: string) => void,
  ) {
    this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type: string; line?: string; message?: string };
      switch (data.type) {
        case "receive":
          if (data.line !== undefined) {
            for (const listener of this.receiveListeners) {
              listener(data.line);
            }
          }
          break;
        case "error":
          this.emitError(new Error(data.message || "unknown engine error"));
          break;
        case "log":
          // データファイルの読み込み状況など、USI のやり取りに含まれない情報。
          this.onLog?.(data.message || "");
          break;
        case "close":
          this.emitClose();
          break;
      }
    };
    this.worker.onerror = (event: ErrorEvent) => {
      this.emitError(new Error(event.message || "failed to start engine worker"));
      this.emitClose();
    };
    this.worker.postMessage({ type: "launch", baseURL });
  }

  on(event: "receive", listener: ReceiveListener): this;
  on(event: "error", listener: ErrorListener): this;
  on(event: "close", listener: CloseListener): this;
  on(event: string, listener: unknown): this {
    switch (event) {
      case "receive":
        this.receiveListeners.push(listener as ReceiveListener);
        break;
      case "error":
        this.errorListeners.push(listener as ErrorListener);
        break;
      case "close":
        this.closeListeners.push(listener as CloseListener);
        break;
    }
    return this;
  }

  send(line: string): void {
    if (this.closed) {
      return;
    }
    this.worker.postMessage({ type: "send", line });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    // スレッドを持つエンジンが自前の後始末をできるよう、まず terminate() を依頼する。
    // 応答が無ければ猶予後に Worker ごと止める。
    this.worker.postMessage({ type: "terminate" });
    const worker = this.worker;
    setTimeout(() => worker.terminate(), TERMINATE_GRACE_MS);
    this.emitClose();
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private emitClose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const listener of this.closeListeners) {
      listener();
    }
  }
}

export function createWasmEngineTransportFactory(
  onLog?: (message: string) => void,
): EngineTransportFactory {
  return (path) => new WasmEngineTransport(resolveEngineDirURL(path), onLog);
}
