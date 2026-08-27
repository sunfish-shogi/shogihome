// @vitest-environment node
//
// engines/core/shim.js が組み立てるインターフェースを検証する。
//
// シムは --pre-js として wasm に焼き込まれるため、通常は Emscripten でビルドしないと
// 動かせない。しかし中身は素の JavaScript で、Emscripten の Module を模した
// オブジェクトを渡せばそのまま評価できる。探索の分割実行を駆動するタイマーは
// このシムが持っているので、ここで直接確かめておく。
import fs from "node:fs";
import path from "node:path";

const SHIM_PATH = path.resolve(import.meta.dirname, "../../../engines/core/shim.js");
const source = fs.readFileSync(SHIM_PATH, "utf8");

type FakeModule = {
  // シムが生やすもの。
  print(line: string): void;
  postMessage(command: string): void;
  addMessageListener(listener: (line: string) => void): void;
  removeMessageListener(listener: (line: string) => void): void;
  terminate(): void;
  // 検査用。
  commands: string[];
  pollCount: number;
};

// usi_poll の戻り値を poll() で決める。0 は「進めるものが無い」。
function install(poll: () => number = () => 0): FakeModule {
  const module = {
    commands: [] as string[],
    pollCount: 0,
    ccall(name: string, _returnType: unknown, _argTypes: unknown, args: unknown[]) {
      if (name === "usi_command") {
        module.commands.push(String(args[0]));
        return undefined;
      }
      if (name === "usi_poll") {
        module.pollCount++;
        return poll();
      }
      throw new Error(`unexpected ccall: ${name}`);
    },
  } as unknown as FakeModule;
  // --pre-js は Module がスコープに居る状態で評価される。
  new Function("Module", source)(module);
  return module;
}

describe("engines/core/shim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("postMessage が usi_command を呼ぶこと", () => {
    const module = install();
    module.postMessage("position startpos");
    expect(module.commands).toEqual(["position startpos"]);
  });

  it("usi_poll が 0 を返すまで回り、返したら止まること", () => {
    let remaining = 3;
    const module = install(() => (remaining-- > 0 ? 1 : 0));
    module.postMessage("go btime 1000 wtime 1000");
    // コマンドを渡した時点ではまだ発火していない。
    expect(module.pollCount).toBe(0);
    vi.advanceTimersByTime(30);
    expect(module.pollCount).toBe(3);
    // 4 回目が 0 を返してタイマーが止まる。
    vi.advanceTimersByTime(10);
    expect(module.pollCount).toBe(4);
    vi.advanceTimersByTime(1000);
    expect(module.pollCount).toBe(4);
  });

  it("進めるものが無いコマンドでは回り続けないこと", () => {
    const module = install();
    module.postMessage("isready");
    vi.advanceTimersByTime(1000);
    expect(module.pollCount).toBe(1);
  });

  // go ponder / go infinite は stop や ponderhit を待つだけなので一度止まる。
  // それらのコマンドが届いたら再び回り始めなければならない。
  it("止まった後にコマンドが届けば再び回り始めること", () => {
    let busy = false;
    const module = install(() => (busy ? 1 : 0));
    module.postMessage("go ponder btime 1000 wtime 1000");
    vi.advanceTimersByTime(1000);
    expect(module.pollCount).toBe(1);

    busy = true;
    module.postMessage("ponderhit btime 1000 wtime 1000");
    vi.advanceTimersByTime(30);
    expect(module.pollCount).toBe(4);
  });

  it("print がリスナーへ流れ、解除できること", () => {
    const module = install();
    const lines: string[] = [];
    const listener = (line: string) => lines.push(line);
    module.addMessageListener(listener);
    module.print("info depth 1");
    module.removeMessageListener(listener);
    module.print("bestmove 7g7f");
    expect(lines).toEqual(["info depth 1"]);
  });

  it("terminate が quit を送り、以後は何もしないこと", () => {
    const module = install(() => 1);
    const lines: string[] = [];
    module.addMessageListener((line) => lines.push(line));
    module.postMessage("go btime 600000 wtime 600000");
    vi.advanceTimersByTime(20);
    const polledBeforeTerminate = module.pollCount;
    expect(polledBeforeTerminate).toBeGreaterThan(0);

    module.terminate();
    expect(module.commands).toEqual(["go btime 600000 wtime 600000", "quit"]);
    // 終了後の出力は仕様で禁じられている。
    module.print("bestmove 7g7f");
    expect(lines).toEqual([]);
    // 思考中でもタイマーは止まる。
    vi.advanceTimersByTime(1000);
    expect(module.pollCount).toBe(polledBeforeTerminate);
    // 以後のコマンドは無視する。
    module.postMessage("usi");
    expect(module.commands).toEqual(["go btime 600000 wtime 600000", "quit"]);
  });
});
