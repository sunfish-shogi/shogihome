import { Move, Record } from "tsshogi";
import api, { API } from "@/renderer/ipc/api.js";
import { ResearchManager } from "@/renderer/store/research.js";
import {
  researchSettings,
  researchSettingsMax5Seconds,
  researchSettingsSecondaryEngines,
} from "@/tests/mock/research.js";
import { Mocked } from "vitest";
import { USIEngine, USIEngineOption } from "@/common/settings/usi.js";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

describe("store/research", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("unlimited", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGoInfinite.mockResolvedValue();
    mockAPI.usiStop.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch(researchSettings);
    expect(mockAPI.usiLaunch).toBeCalledWith(researchSettings.usi, 10);
    expect(mockAPI.usiReady).toBeCalledTimes(1);
    const record = new Record();
    manager.updatePosition(record);
    vi.runOnlyPendingTimers(); // 遅延実行
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(1);
    expect(mockAPI.usiGoInfinite).toBeCalledWith(100, "position startpos");

    // 時間制限が無いので stop コマンドは送信されない。
    vi.runOnlyPendingTimers();
    expect(mockAPI.usiStop).toBeCalledTimes(0);

    record.append(record.position.createMoveByUSI("7g7f") as Move);
    manager.updatePosition(record);
    vi.runOnlyPendingTimers(); // 遅延実行
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(2);
    expect(mockAPI.usiGoInfinite).toBeCalledWith(100, "position startpos moves 7g7f");
  });

  it("max5Seconds", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGoInfinite.mockResolvedValue();
    mockAPI.usiStop.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch(researchSettingsMax5Seconds);
    const record = new Record();
    manager.updatePosition(record);
    vi.runOnlyPendingTimers(); // 遅延実行
    expect(mockAPI.usiStop).toBeCalledTimes(0);

    // 時間制限があるので stop コマンドが送信される。
    vi.runOnlyPendingTimers();
    expect(mockAPI.usiStop).toBeCalledTimes(1);
  });

  it("secondaryEngines", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValue(100);
    mockAPI.usiGoInfinite.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch(researchSettingsSecondaryEngines);
    expect(mockAPI.usiLaunch).toBeCalledTimes(3);
    expect(mockAPI.usiReady).toBeCalledTimes(3);
    const record = new Record();
    manager.updatePosition(record);
    vi.runOnlyPendingTimers(); // 遅延実行
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(3);
    record.append(record.position.createMoveByUSI("7g7f") as Move);
    manager.updatePosition(record);
    vi.runOnlyPendingTimers(); // 遅延実行
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(6);
  });

  it("pause", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(101);
    mockAPI.usiLaunch.mockResolvedValueOnce(102);
    mockAPI.usiLaunch.mockResolvedValueOnce(103);
    mockAPI.usiGoInfinite.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch(researchSettingsSecondaryEngines);
    const record = new Record();
    manager.updatePosition(record);
    vi.runOnlyPendingTimers();
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(3);
    // all sessions are unpaused
    expect(manager.isPaused(101)).toBeFalsy();
    expect(manager.isPaused(102)).toBeFalsy();
    expect(manager.isPaused(103)).toBeFalsy();
    // pause 102
    manager.pause(102);
    expect(manager.isPaused(101)).toBeFalsy();
    expect(manager.isPaused(102)).toBeTruthy();
    expect(manager.isPaused(103)).toBeFalsy();
    // update position
    record.append(record.position.createMoveByUSI("7g7f") as Move);
    manager.updatePosition(record);
    vi.runOnlyPendingTimers();
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(5);
    // unpause 102
    manager.unpause(102);
    expect(manager.isPaused(101)).toBeFalsy();
    expect(manager.isPaused(102)).toBeFalsy();
    expect(manager.isPaused(103)).toBeFalsy();
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(6);
  });

  it("multiPV", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(101);
    mockAPI.usiGoInfinite.mockResolvedValue();
    mockAPI.usiStop.mockResolvedValue();
    mockAPI.usiSetOption.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch({
      ...researchSettings,
      usi: {
        ...(researchSettings.usi as USIEngine),
        options: {
          MultiPV: {
            name: "MultiPV",
            order: 1,
            type: "spin",
            default: 1,
            value: 4,
          } as USIEngineOption,
        },
      },
    });
    const record = new Record();
    manager.updatePosition(record);
    vi.runOnlyPendingTimers();
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(1);
    expect(mockAPI.usiStop).not.toBeCalled();
    expect(manager.getMultiPV(101)).toBe(4);

    vi.useRealTimers();
    manager.setMultiPV(101, 2);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(2);
    expect(mockAPI.usiStop).toBeCalledTimes(1);
    expect(manager.getMultiPV(101)).toBe(2);
  });

  it("multiPV not available", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(101);
    mockAPI.usiGoInfinite.mockResolvedValue();
    mockAPI.usiStop.mockResolvedValue();
    mockAPI.usiSetOption.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch(researchSettings); // without MultiPV option
    const record = new Record();
    manager.updatePosition(record);
    vi.runOnlyPendingTimers();
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(1);
    expect(mockAPI.usiStop).not.toBeCalled();
    expect(manager.getMultiPV(101)).toBeUndefined();

    vi.useRealTimers();
    manager.setMultiPV(101, 2); // should be ignored
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockAPI.usiGoInfinite).toBeCalledTimes(1);
    expect(mockAPI.usiStop).toBeCalledTimes(0);
    expect(manager.getMultiPV(101)).toBeUndefined();
  });

  it("overrideMultiPV", async () => {
    vi.useFakeTimers();
    mockAPI.usiLaunch.mockResolvedValueOnce(101);
    mockAPI.usiGoInfinite.mockResolvedValue();
    mockAPI.usiStop.mockResolvedValue();
    mockAPI.usiSetOption.mockResolvedValue();
    const manager = new ResearchManager();
    await manager.launch({
      ...researchSettings,
      overrideMultiPV: true,
      multiPV: 4,
      usi: {
        ...(researchSettings.usi as USIEngine),
        options: {
          MultiPV: {
            name: "MultiPV",
            order: 1,
            type: "spin",
            default: 1,
            value: 1,
          } as USIEngineOption,
        },
      },
    });
    expect(mockAPI.usiLaunch).toBeCalledTimes(1);
    expect(mockAPI.usiLaunch.mock.calls[0][0].options["MultiPV"]).toStrictEqual({
      name: "MultiPV",
      order: 1,
      type: "spin",
      default: 1,
      value: 4,
    });
    expect(manager.getMultiPV(101)).toBe(4);
  });
});
