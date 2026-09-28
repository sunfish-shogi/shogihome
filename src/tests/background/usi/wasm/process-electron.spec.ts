// @vitest-environment node
import { EventEmitter } from "node:events";
import { utilityProcess } from "electron";
import { WasmEngineProcess } from "@/background/usi/wasm/process-electron.js";
import * as log from "@/background/log.js";
import { getNopLogger } from "@/tests/mock/log.js";
import { Mocked } from "vitest";

vi.mock("electron", () => ({ utilityProcess: { fork: vi.fn() } }));
vi.mock("@/background/log.js");
vi.mock("@/background/proc/env.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/background/proc/env.js")>()),
  getWasmEngineHostPath: () => "/host.js",
}));

const mockLog = log as Mocked<typeof log>;

class FakeUtilityProcess extends EventEmitter {
  pid = 1234;
  stdout = null;
  stderr = null;
  postMessage = vi.fn();
  kill = vi.fn();
}

describe("background/usi/wasm/process-electron", () => {
  let fake: FakeUtilityProcess;

  beforeEach(() => {
    mockLog.getUSILogger.mockReturnValue(getNopLogger());
    fake = new FakeUtilityProcess();
    vi.mocked(utilityProcess.fork).mockReturnValue(fake as never);
  });

  it("launch", () => {
    new WasmEngineProcess("/engines/a@1/engine.json");
    expect(utilityProcess.fork).toBeCalledWith(
      "/host.js",
      [],
      expect.objectContaining({ cwd: "/engines/a@1" }),
    );
    expect(fake.postMessage).toBeCalledWith({
      type: "launch",
      manifestPath: "/engines/a@1/engine.json",
    });
  });

  // V8 の続行できないエラーで utility プロセスが error を発生させても、background プロセスを
  // 落とさずに、エンジンのエラーと終了として伝える。
  it("fatalError", () => {
    const engine = new WasmEngineProcess("/engines/a@1/engine.json");
    const onError = vi.fn();
    const onClose = vi.fn();
    engine.on("error", onError);
    engine.on("close", onClose);
    expect(() => fake.emit("error", "FatalError", "v8::Foo", "{}")).not.toThrow();
    expect(onError).toBeCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/FatalError at v8::Foo/);
    fake.emit("exit", 134);
    expect(onClose).toBeCalledWith(134, null);
  });
});
