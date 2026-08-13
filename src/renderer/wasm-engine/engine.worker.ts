// WebAssembly エンジンを動かす Worker。
//
// Emscripten の標準入力は同期的で扱いづらいため、エンジン側は
// usi_init / usi_command / usi_poll をエクスポートし、こちらから明示的に呼び出す。
// エンジンの標準出力は Module.print に渡ってくるので、1 行ずつメインスレッドへ中継する。

// Emscripten が -sMODULARIZE -sEXPORT_ES6 で出力するファクトリ関数の型。
type EmscriptenModule = {
  ccall(name: string, returnType: string | null, argTypes: string[], args: unknown[]): unknown;
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

async function launch(moduleURL: string): Promise<void> {
  try {
    const imported = (await import(/* @vite-ignore */ moduleURL)) as {
      default: EmscriptenModuleFactory;
    };
    engineModule = await imported.default({
      print: onEngineOutput,
      printErr: (line: string) => post({ type: "error", message: line }),
    });
    engineModule.ccall("usi_init", null, [], []);
    while (pendingCommands.length > 0) {
      sendToEngine(pendingCommands.shift() as string);
    }
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    post({ type: "close" });
  }
}

self.onmessage = (event: MessageEvent) => {
  const data = event.data as { type: string; moduleURL?: string; line?: string };
  switch (data.type) {
    case "launch":
      if (data.moduleURL) {
        launch(data.moduleURL);
      }
      break;
    case "send":
      if (data.line !== undefined) {
        sendToEngine(data.line);
      }
      break;
  }
};
