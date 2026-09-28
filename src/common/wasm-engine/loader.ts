// WebAssembly エンジンのモジュールが公開するインターフェースと、その読み込み補助。
//
// メソッド名は YaneuraOu の wasm ビルドに合わせてある。将来 YaneuraOu をそのまま
// 載せられるようにするためで、ShogiHome 自身の参照実装 (engines/) もこの形に揃えている。
// 仕様は specs/wasm-engine-abi.md を参照。

// Emscripten の仮想ファイルシステム。マニフェストの dataFiles を使うエンジンだけが公開する。
//
// Emscripten には mkdirTree もあるが、closure コンパイラを通したビルド
// (YaneuraOu の配布物がこれ) では名前が保たれず呼び出せない。
// 名前が残るのは mkdir や writeFile など一部に限られるため、それだけで組み立てる。
export type EngineFS = {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
};

// dataFiles の書き込み先の親ディレクトリを 1 階層ずつ作る。
//
// 既存のディレクトリに対する mkdir は EEXIST の例外になるが、Emscripten の
// ErrnoError が errno を載せるプロパティ名も closure で潰れており判別できない。
// ディレクトリを用意できたかどうかは後続の writeFile が示すので、ここでは失敗を無視する。
export function makeParentDirs(fs: EngineFS, filePath: string): void {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (!dir) {
    return;
  }
  let current = dir.startsWith("/") ? "" : ".";
  for (const segment of dir.split("/")) {
    if (segment === "") {
      continue;
    }
    current += `/${segment}`;
    try {
      fs.mkdir(current);
    } catch {
      // 既に存在する場合を含め、ここでは失敗を無視する。
    }
  }
}

export type EngineMessageListener = (line: string) => void;

// エンジンのモジュールが公開するインターフェース。
export type EngineInstance = {
  // USI コマンドを 1 行渡す。
  postMessage(command: string): void;
  // エンジンの出力を 1 行ずつ受け取るリスナーを登録する。
  addMessageListener(listener: EngineMessageListener): void;
  removeMessageListener(listener: EngineMessageListener): void;
  // エンジンを終了し、内部のスレッドやリソースを解放する。
  terminate(): void;
  FS?: EngineFS;
};

// エンジンのモジュールを生成する関数に渡せるオプション。
// Emscripten の Module オブジェクトの一部で、いずれも省略可能。
export type EngineModuleOptions = {
  printErr?: (line: string) => void;
  locateFile?: (path: string, prefix: string) => string;
  // pthread の Worker がグルーコードを読み直すための URL。
  // Emscripten は自分の位置を document.currentScript や import.meta.url から求めるが、
  // モジュール Worker から UMD の成果物を読む場合はどちらも得られない。
  // 与えないと pthread の Worker が undefined を読み込もうとして落ちる。
  mainScriptUrlOrBlob?: string;
};

export type EngineFactory = (options?: EngineModuleOptions) => Promise<EngineInstance>;

// UMD 形式の成果物がモジュールスコープに置く変数名。
// ソースへ文字列として埋め込むため、識別子として妥当なものに限る。
export const EXPORT_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// UMD (-sEXPORT_ES6 無し) として出力されたグルーコードを、動的 import() で読めるようにする。
//
// Emscripten の UMD 出力は `var <exportName> = (() => {...})()` の後に CommonJS / AMD への
// 代入を試みるだけなので、ES モジュールとして評価しても変数の定義までは問題なく行われる。
// ただし var はモジュールスコープに閉じてグローバルには出ないため、末尾に export 文を足す。
export function wrapUMDSource(source: string, exportName: string): string {
  if (!EXPORT_NAME_PATTERN.test(exportName)) {
    throw new Error(`invalid exportName: ${exportName}`);
  }
  return `${source}\n;export default ${exportName};\n`;
}

const REQUIRED_METHODS = [
  "postMessage",
  "addMessageListener",
  "removeMessageListener",
  "terminate",
] as const;

// エンジンのモジュールが仕様通りのインターフェースを備えているか確認する。
export function validateEngineInstance(value: unknown): EngineInstance {
  const record = value as Record<string, unknown> | null;
  if (typeof record !== "object" || record === null) {
    throw new Error("engine module did not return an object");
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof record[method] !== "function") {
      throw new Error(`engine module does not expose ${method}()`);
    }
  }
  return record as unknown as EngineInstance;
}
