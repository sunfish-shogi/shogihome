// background と WebAssembly エンジンの utility プロセス (host.ts) の間のメッセージ。

export type WasmEngineHostRequest =
  { type: "launch"; manifestPath: string } | { type: "send"; line: string } | { type: "terminate" };

export type WasmEngineHostResponse =
  | { type: "receive"; line: string }
  | { type: "log"; message: string }
  | { type: "error"; message: string };
