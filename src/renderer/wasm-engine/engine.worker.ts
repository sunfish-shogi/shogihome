// WebAssembly エンジンを動かす Worker。
//
// エンジンのディレクトリ URL を受け取り、engine.json を読んでモジュールを起動する。
// Emscripten の標準入力は同期的で扱いづらいため、エンジン側は
// usi_init / usi_command / usi_poll をエクスポートし、こちらから明示的に呼び出す。
// エンジンの標準出力は Module.print に渡ってくるので、1 行ずつメインスレッドへ中継する。
import { MANIFEST_FILE_NAME, parseEngineManifest } from "./manifest.js";

// Emscripten が -sMODULARIZE -sEXPORT_ES6 で出力するファクトリ関数の型。
type EmscriptenFS = {
  mkdirTree(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
};
type EmscriptenModule = {
  ccall(name: string, returnType: string | null, argTypes: string[], args: unknown[]): unknown;
  FS?: EmscriptenFS;
};
type EmscriptenModuleFactory = (options: {
  print: (line: string) => void;
  printErr: (line: string) => void;
}) => Promise<EmscriptenModule>;

// 思考中に usi_poll を呼ぶ間隔 (ミリ秒)。
const POLL_INTERVAL_MS = 10;

let engineModule: EmscriptenModule | undefined;
// モジュールの読み込みが終わるまでに届いたコマンドを保持する。
const pendingCommands: string[] = [];
let pollTimer: ReturnType<typeof setInterval> | undefined;
// bestmove / checkmate をまだ受け取っていない状態かどうか。
let awaitingResult = false;

function post(message: unknown): void {
  self.postMessage(message);
}

function log(message: string): void {
  post({ type: "log", message });
}

function onEngineOutput(line: string): void {
  if (line.startsWith("bestmove ") || line.startsWith("checkmate ")) {
    awaitingResult = false;
    stopPolling();
  }
  post({ type: "receive", line });
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function startPolling(): void {
  if (pollTimer !== undefined || !engineModule) {
    return;
  }
  pollTimer = setInterval(() => {
    engineModule?.ccall("usi_poll", null, [], []);
  }, POLL_INTERVAL_MS);
}

function sendToEngine(line: string): void {
  if (!engineModule) {
    pendingCommands.push(line);
    return;
  }
  // 思考の開始を伴うコマンドは、結果が出るまで usi_poll を回す必要がある。
  const needsResult = line === "go" || line.startsWith("go ") || line.startsWith("ponderhit");
  if (needsResult) {
    awaitingResult = true;
  }
  engineModule.ccall("usi_command", null, ["string"], [line]);
  // 同期的に結果が出た場合 (stop 直後や go mate など) は awaitingResult が下りている。
  if (awaitingResult) {
    startPolling();
  }
}

// 評価パラメータや定跡を取得し、Emscripten の仮想ファイルシステムへ書き込む。
async function loadDataFiles(
  module: EmscriptenModule,
  baseURL: string,
  dataFiles: { url: string; path: string }[],
): Promise<void> {
  if (dataFiles.length === 0) {
    return;
  }
  if (!module.FS) {
    throw new Error(
      "engine does not expose FS: add FS to -sEXPORTED_RUNTIME_METHODS to use dataFiles",
    );
  }
  for (const file of dataFiles) {
    const url = new URL(file.url, baseURL).href;
    log(`loading data file: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`failed to load ${url}: ${response.status}`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    if (dir) {
      module.FS.mkdirTree(dir);
    }
    module.FS.writeFile(file.path, data);
    log(`loaded data file: ${file.path} (${data.byteLength} bytes)`);
  }
}

async function launch(baseURL: string): Promise<void> {
  try {
    const manifestURL = new URL(MANIFEST_FILE_NAME, baseURL).href;
    const response = await fetch(manifestURL);
    if (!response.ok) {
      throw new Error(`failed to load ${manifestURL}: ${response.status}`);
    }
    const manifest = parseEngineManifest(await response.json());
    const moduleURL = new URL(manifest.module, baseURL).href;
    const imported = (await import(/* @vite-ignore */ moduleURL)) as {
      default: EmscriptenModuleFactory;
    };
    const module = await imported.default({
      print: onEngineOutput,
      printErr: (line: string) => post({ type: "error", message: line }),
    });
    // データファイルの読み込みはコマンドを処理する前に済ませる。
    await loadDataFiles(module, baseURL, manifest.dataFiles || []);
    module.ccall("usi_init", null, [], []);
    engineModule = module;
    while (pendingCommands.length > 0) {
      sendToEngine(pendingCommands.shift() as string);
    }
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    post({ type: "close" });
  }
}

self.onmessage = (event: MessageEvent) => {
  const data = event.data as { type: string; baseURL?: string; line?: string };
  switch (data.type) {
    case "launch":
      if (data.baseURL) {
        launch(data.baseURL);
      }
      break;
    case "send":
      if (data.line !== undefined) {
        sendToEngine(data.line);
      }
      break;
  }
};
