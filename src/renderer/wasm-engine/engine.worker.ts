// WebAssembly エンジンを動かす Worker。
//
// エンジンのディレクトリ URL を受け取り、engine.json を読んでモジュールを起動する。
// エンジンとのやり取りは postMessage / addMessageListener で行う
// (specs/wasm-engine-abi.md 版 1。YaneuraOu の wasm ビルドと同じインターフェース)。
//
// 単一スレッドのエンジンは探索を分割実行する必要があるが、その駆動はエンジンの
// モジュールの内側で完結する (参照実装は engines/core/shim.js)。この Worker は
// コマンドを渡して出力を受け取るだけで、思考の進行には関与しない。
import { EngineManifest, MANIFEST_FILE_NAME, parseEngineManifest } from "./manifest.js";
import { EngineFactory, EngineInstance, validateEngineInstance, wrapUMDSource } from "./loader.js";

let engine: EngineInstance | undefined;
// モジュールの読み込みが終わるまでに届いたコマンドを保持する。
const pendingCommands: string[] = [];
let terminated = false;

function post(message: unknown): void {
  self.postMessage(message);
}

function log(message: string): void {
  post({ type: "log", message });
}

function onEngineOutput(line: string): void {
  post({ type: "receive", line });
}

function sendToEngine(line: string): void {
  if (terminated) {
    return;
  }
  if (!engine) {
    pendingCommands.push(line);
    return;
  }
  engine.postMessage(line);
}

function terminate(): void {
  if (terminated) {
    return;
  }
  terminated = true;
  try {
    engine?.terminate();
  } catch {
    // 終了処理の失敗は握り潰す。どのみち Worker ごと破棄される。
  }
  engine = undefined;
  post({ type: "close" });
  self.close();
}

// グルーコードを読み込み、モジュールを生成する関数を取り出す。
async function importFactory(manifest: EngineManifest, moduleURL: string): Promise<EngineFactory> {
  if (manifest.moduleFormat === "umd") {
    // UMD の出力は ES モジュールとして評価しても値をエクスポートしないので、
    // 末尾に export 文を足したものを Blob URL 経由で読み込む。
    const response = await fetch(moduleURL);
    if (!response.ok) {
      throw new Error(`failed to load ${moduleURL}: ${response.status}`);
    }
    const source = wrapUMDSource(await response.text(), manifest.exportName as string);
    const blobURL = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      return (await import(/* @vite-ignore */ blobURL)).default as EngineFactory;
    } finally {
      URL.revokeObjectURL(blobURL);
    }
  }
  return (await import(/* @vite-ignore */ moduleURL)).default as EngineFactory;
}

// 評価パラメータや定跡を取得し、Emscripten の仮想ファイルシステムへ書き込む。
async function loadDataFiles(
  instance: EngineInstance,
  baseURL: string,
  dataFiles: { url: string; path: string }[],
): Promise<void> {
  if (dataFiles.length === 0) {
    return;
  }
  if (!instance.FS) {
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
      instance.FS.mkdirTree(dir);
    }
    instance.FS.writeFile(file.path, data);
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
    const factory = await importFactory(manifest, moduleURL);
    const instance = validateEngineInstance(
      await factory({
        // 標準エラー出力は診断情報として扱い、致命的なエラーとは区別する。
        // Emscripten は MIME が application/wasm でない場合に
        // "falling back to ArrayBuffer instantiation" をここへ書くが、これは回復可能で、
        // エラーとして扱うと起動できたはずのエンジンが使えなくなる。
        // 本当に致命的な場合は例外が Worker の外へ出るので onerror が拾う。
        printErr: (line: string) => log(`stderr: ${line}`),
        // .wasm や .data はグルーコードと同じ場所に置かれる。
        // UMD を Blob URL から読み込む場合は自力で解決できないため、こちらから渡す。
        locateFile: (path: string) => new URL(path, moduleURL).href,
      }),
    );
    instance.addMessageListener(onEngineOutput);
    // データファイルの読み込みはコマンドを処理する前に済ませる。
    await loadDataFiles(instance, baseURL, manifest.dataFiles || []);
    if (terminated) {
      instance.terminate();
      return;
    }
    engine = instance;
    while (pendingCommands.length > 0) {
      sendToEngine(pendingCommands.shift() as string);
    }
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    // 起動に失敗した Worker を残さない。メインスレッド側は close を受けた時点で
    // 閉じたとみなすため、後から terminate が届くことはない。
    terminate();
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
    case "terminate":
      terminate();
      break;
  }
};
