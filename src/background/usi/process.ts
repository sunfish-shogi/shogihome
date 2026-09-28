import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface as readline, Interface as Readline } from "node:readline";
import path from "node:path";

const isWin = process.platform === "win32";

// EngineProcess (engine.ts) から見たエンジンのプロセス。
// プロセス型のエンジン (ChildProcess) と WebAssembly エンジン (wasm/process-electron.ts) がある。
export interface EngineProcessHandle {
  readonly pid: number | undefined;
  on(event: "receive", listener: (line: string) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  send(line: string): void;
  kill(): void;
}

export class ChildProcess implements EngineProcessHandle {
  private handle: ChildProcessWithoutNullStreams;
  private readline: Readline | null = null;

  constructor(cmd: string) {
    const options = {
      cwd: path.dirname(cmd),
    };
    if (isWin && (cmd.endsWith(".bat") || cmd.endsWith(".cmd"))) {
      this.handle = spawn("cmd.exe", ["/c", cmd], options);
    } else {
      this.handle = spawn(cmd, options);
    }
    this.handle.on("close", this.onClose.bind(this));
  }

  get pid(): number | undefined {
    return this.handle.pid;
  }

  on(event: "receive", listener: (line: string) => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this {
    switch (event) {
      case "receive":
        if (this.readline === null) {
          this.readline = readline(this.handle.stdout);
        }
        this.readline.on("line", listener);
        break;
      case "close":
        this.handle.on("close", (code, signal) => {
          this.onClose();
          listener(code, signal);
        });
        break;
      default:
        this.handle.on(event, listener);
        break;
    }
    return this;
  }

  send(line: string): void {
    this.handle.stdin.write(line + "\n");
  }

  kill(): void {
    this.onClose();
    this.handle.kill();
  }

  private onClose() {
    if (this.readline !== null) {
      this.readline.close();
    }
  }
}
