// WebAssembly エンジンを動かす utility プロセスのエントリ。
//
// background が utilityProcess.fork() で起動する (process.ts)。1 プロセスで 1 エンジンを動かし、
// USI の行を parentPort 経由で中継する。utility プロセスは ELECTRON_RUN_AS_NODE を使わないため、
// Fuses の runAsNode を無効にしたままで動く。
//
// **このファイルはアプリに同梱される。** 読み込むエンジンのコードは launch で渡された
// engine.json が指すダウンロード済みのファイルだけで、その検証はインストール時に済んでいる
// (install.ts)。
import { EngineInstance } from "@/common/wasm-engine/loader.js";
import { launchWasmEngine } from "./runner.js";
import { WasmEngineHostRequest, WasmEngineHostResponse } from "./protocol.js";

const port = process.parentPort;

let engine: EngineInstance | undefined;
// エンジンの起動が終わるまでに届いたコマンドを保持する。
const pendingCommands: string[] = [];
let terminated = false;

function post(message: WasmEngineHostResponse): void {
  port.postMessage(message);
}

function exit(code: number): never {
  process.exit(code);
}

function terminate(): void {
  if (terminated) {
    return;
  }
  terminated = true;
  try {
    engine?.terminate();
  } catch {
    // どのみちプロセスごと終了する。
  }
  engine = undefined;
  exit(0);
}

function send(line: string): void {
  if (terminated) {
    return;
  }
  if (!engine) {
    pendingCommands.push(line);
    return;
  }
  engine.postMessage(line);
  // WebAssembly エンジンは quit でプロセスを終了しない (specs/wasm-engine-abi.md)。
  // プロセス型のエンジンと同じく quit で終わるよう、ここで後始末をする。
  if (line === "quit") {
    terminate();
  }
}

async function launch(manifestPath: string): Promise<void> {
  try {
    engine = await launchWasmEngine(manifestPath, {
      onReceive: (line) => post({ type: "receive", line }),
      onLog: (message) => post({ type: "log", message }),
    });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    exit(1);
  }
  if (terminated) {
    engine.terminate();
    return;
  }
  while (pendingCommands.length > 0) {
    send(pendingCommands.shift() as string);
  }
}

// エンジンの内部で abort した場合など。親には閉じたことが伝わる。
process.on("uncaughtException", (e) => {
  post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  exit(1);
});

port.on("message", (event) => {
  const request = event.data as WasmEngineHostRequest;
  switch (request.type) {
    case "launch":
      launch(request.manifestPath);
      break;
    case "send":
      send(request.line);
      break;
    case "terminate":
      terminate();
      break;
  }
});
