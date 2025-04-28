import child_process from "node:child_process";
import { getTailCommand, tailLogFile } from "@/background/log.js";
import { LogType } from "@/common/log.js";

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getTailCommand", () => {
    it("win", () => {
      vi.stubGlobal("process", { platform: "win32" });
      expect(getTailCommand(LogType.APP)).match(
        /^Get-Content -Path ".*app-.*\.log" -Wait -Tail 10$/,
      );
    });

    it("darwin", () => {
      vi.stubGlobal("process", { platform: "darwin" });
      expect(getTailCommand(LogType.APP)).match(/^tail -f ".*app-.*\.log"$/);
    });
  });

  describe("tailLogFile", () => {
    it("win", () => {
      vi.stubGlobal("process", { platform: "win32" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spy = vi.spyOn(child_process, "spawn").mockReturnValueOnce({} as any);
      tailLogFile(LogType.APP);
      expect(spy).toBeCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe("powershell.exe");
      expect(spy.mock.calls[0][1]).toHaveLength(2);
      expect(spy.mock.calls[0][1][0]).toBe("-Command");
      expect(spy.mock.calls[0][1][1]).match(
        /^start-process powershell '-NoExit','-Command "Get-Content -Path \\".*app-.*\.log\\" -Wait -Tail 10"'$/,
      );
    });

    it("darwin", () => {
      vi.stubGlobal("process", { platform: "darwin" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spy = vi.spyOn(child_process, "spawn").mockReturnValueOnce({} as any);
      tailLogFile(LogType.APP);
      expect(spy).toBeCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe("osascript");
      expect(spy.mock.calls[0][1]).toHaveLength(4);
      expect(spy.mock.calls[0][1][0]).toBe("-e");
      expect(spy.mock.calls[0][1][1]).match(
        /^tell app "Terminal" to do script "tail -f \\".*app-.*\.log\\""$/,
      );
      expect(spy.mock.calls[0][1][2]).toBe("-e");
      expect(spy.mock.calls[0][1][3]).match(/^tell app "Terminal" to activate$/);
    });
  });
});
