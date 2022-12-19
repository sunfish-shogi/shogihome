import { Clock } from "@/store/clock";

describe("store/clock", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("simple", () => {
    const setting = {
      timeMs: 300 * 1e3,
      byoyomi: 0,
      increment: 0,
      onBeepShort: jest.fn(),
      onBeepUnlimited: jest.fn(),
      onStopBeep: jest.fn(),
      onTimeout: jest.fn(),
    };
    const clock = new Clock();
    clock.setup(setting);
    clock.start();
    // 5:00
    expect(clock.timeMs).toBe(300 * 1e3);
    expect(clock.byoyomi).toBe(0);
    expect(setting.onStopBeep).toBeCalledTimes(1);
    jest.advanceTimersByTime(239 * 1e3);
    // 1:01
    expect(clock.timeMs).toBe(61 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(0);
    jest.advanceTimersByTime(1 * 1e3);
    // 1:00
    expect(clock.timeMs).toBe(60 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(1);
    jest.advanceTimersByTime(29 * 1e3);
    // 0:31
    expect(clock.timeMs).toBe(31 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(1);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:30
    expect(clock.timeMs).toBe(30 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(2);
    jest.advanceTimersByTime(20 * 1e3);
    // 0:10
    expect(clock.timeMs).toBe(10 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(4);
    jest.advanceTimersByTime(4 * 1e3);
    // 0:06
    expect(clock.timeMs).toBe(6 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onBeepUnlimited).toBeCalledTimes(0);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:05
    expect(clock.timeMs).toBe(5 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onBeepUnlimited).toBeCalledTimes(1);
    jest.advanceTimersByTime(4 * 1e3);
    // 0:01
    expect(clock.timeMs).toBe(1 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onStopBeep).toBeCalledTimes(1);
    expect(setting.onTimeout).toBeCalledTimes(0);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:00
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onStopBeep).toBeCalledTimes(2);
    expect(setting.onTimeout).toBeCalledTimes(1);
  });

  it("byoyomi", () => {
    const setting = {
      timeMs: 300 * 1e3,
      byoyomi: 60,
      increment: 0,
      onBeepShort: jest.fn(),
      onBeepUnlimited: jest.fn(),
      onStopBeep: jest.fn(),
      onTimeout: jest.fn(),
    };
    const clock = new Clock();
    clock.setup(setting);
    clock.start();
    // 5:00 - 60
    expect(clock.timeMs).toBe(300 * 1e3);
    expect(clock.byoyomi).toBe(60);
    expect(setting.onStopBeep).toBeCalledTimes(1);
    jest.advanceTimersByTime(299 * 1e3);
    // 0:01 - 60
    expect(clock.timeMs).toBe(1 * 1e3);
    expect(clock.byoyomi).toBe(60);
    expect(setting.onBeepShort).toBeCalledTimes(0);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:00 - 60
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(60);
    expect(setting.onBeepShort).toBeCalledTimes(1);
    jest.advanceTimersByTime(29 * 1e3);
    // 0:00 - 31
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(31);
    expect(setting.onBeepShort).toBeCalledTimes(1);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:00 - 30
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(30);
    expect(setting.onBeepShort).toBeCalledTimes(2);
    jest.advanceTimersByTime(20 * 1e3);
    // 0:00 - 10
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(10);
    expect(setting.onBeepShort).toBeCalledTimes(4);
    jest.advanceTimersByTime(4 * 1e3);
    // 0:00 - 06
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(6);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onBeepUnlimited).toBeCalledTimes(0);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:00 - 05
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(5);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onBeepUnlimited).toBeCalledTimes(1);
    jest.advanceTimersByTime(4 * 1e3);
    // 0:00 - 01
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(1);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onStopBeep).toBeCalledTimes(1);
    expect(setting.onTimeout).toBeCalledTimes(0);
    jest.advanceTimersByTime(1 * 1e3);
    // 0:00 - 00
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(0);
    expect(setting.onBeepShort).toBeCalledTimes(8);
    expect(setting.onStopBeep).toBeCalledTimes(2);
    expect(setting.onTimeout).toBeCalledTimes(1);
  });

  it("increment", () => {
    const setting = {
      timeMs: 300 * 1e3,
      byoyomi: 0,
      increment: 5,
      onBeepShort: jest.fn(),
      onBeepUnlimited: jest.fn(),
      onStopBeep: jest.fn(),
      onTimeout: jest.fn(),
    };
    const clock = new Clock();
    clock.setup(setting);
    clock.start();
    // 5:00
    expect(clock.timeMs).toBe(300 * 1e3);
    expect(clock.byoyomi).toBe(0);
    expect(setting.onStopBeep).toBeCalledTimes(1);
    jest.advanceTimersByTime(200 * 1e3);
    // 1:40
    expect(clock.timeMs).toBe(100 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(0);
    clock.stop();
    // 1:45
    expect(clock.timeMs).toBe(105 * 1e3);
    expect(setting.onStopBeep).toBeCalledTimes(2);
    clock.start();
    expect(setting.onStopBeep).toBeCalledTimes(3);
    jest.advanceTimersByTime(47 * 1e3);
    // 0:58
    expect(clock.timeMs).toBe(58 * 1e3);
    expect(setting.onBeepShort).toBeCalledTimes(1);
    clock.stop();
    // 1:03
    expect(clock.timeMs).toBe(63 * 1e3);
    expect(setting.onStopBeep).toBeCalledTimes(4);
  });
});
