import { Clock } from "@/renderer/store/clock.js";

describe("store/clock", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("simple", () => {
    const settings = {
      timeMs: 300 * 1e3,
      byoyomi: 0,
      increment: 0,
      onBeepShort: vi.fn(),
      onBeepUnlimited: vi.fn(),
      onStopBeep: vi.fn(),
      onTimeout: vi.fn(),
    };
    const clock = new Clock();
    clock.setup(settings);
    clock.start();
    // 5:00
    expect(clock.timeMs).toBe(300 * 1e3);
    expect(clock.byoyomi).toBe(0);
    expect(settings.onStopBeep).toBeCalledTimes(1);
    vi.advanceTimersByTime(239 * 1e3);
    // 1:01
    expect(clock.timeMs).toBe(61 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(0);
    vi.advanceTimersByTime(1 * 1e3);
    // 1:00
    expect(clock.timeMs).toBe(60 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(1);
    vi.advanceTimersByTime(29 * 1e3);
    // 0:31
    expect(clock.timeMs).toBe(31 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(1);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:30
    expect(clock.timeMs).toBe(30 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(2);
    vi.advanceTimersByTime(20 * 1e3);
    // 0:10
    expect(clock.timeMs).toBe(10 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(4);
    vi.advanceTimersByTime(4 * 1e3);
    // 0:06
    expect(clock.timeMs).toBe(6 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onBeepUnlimited).toBeCalledTimes(0);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:05
    expect(clock.timeMs).toBe(5 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onBeepUnlimited).toBeCalledTimes(1);
    vi.advanceTimersByTime(4 * 1e3);
    // 0:01
    expect(clock.timeMs).toBe(1 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onStopBeep).toBeCalledTimes(1);
    expect(settings.onTimeout).toBeCalledTimes(0);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:00
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onStopBeep).toBeCalledTimes(2);
    expect(settings.onTimeout).toBeCalledTimes(1);
  });

  it("byoyomi", () => {
    const settings = {
      timeMs: 300 * 1e3,
      byoyomi: 60,
      increment: 0,
      onBeepShort: vi.fn(),
      onBeepUnlimited: vi.fn(),
      onStopBeep: vi.fn(),
      onTimeout: vi.fn(),
    };
    const clock = new Clock();
    clock.setup(settings);
    clock.start();
    // 5:00 - 60
    expect(clock.timeMs).toBe(300 * 1e3);
    expect(clock.byoyomi).toBe(60);
    expect(settings.onStopBeep).toBeCalledTimes(1);
    vi.advanceTimersByTime(299 * 1e3);
    // 0:01 - 60
    expect(clock.timeMs).toBe(1 * 1e3);
    expect(clock.byoyomi).toBe(60);
    expect(settings.onBeepShort).toBeCalledTimes(0);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:00 - 60
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(60);
    expect(settings.onBeepShort).toBeCalledTimes(1);
    vi.advanceTimersByTime(29 * 1e3);
    // 0:00 - 31
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(31);
    expect(settings.onBeepShort).toBeCalledTimes(1);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:00 - 30
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(30);
    expect(settings.onBeepShort).toBeCalledTimes(2);
    vi.advanceTimersByTime(20 * 1e3);
    // 0:00 - 10
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(10);
    expect(settings.onBeepShort).toBeCalledTimes(4);
    vi.advanceTimersByTime(4 * 1e3);
    // 0:00 - 06
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(6);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onBeepUnlimited).toBeCalledTimes(0);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:00 - 05
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(5);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onBeepUnlimited).toBeCalledTimes(1);
    vi.advanceTimersByTime(4 * 1e3);
    // 0:00 - 01
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(1);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onStopBeep).toBeCalledTimes(1);
    expect(settings.onTimeout).toBeCalledTimes(0);
    vi.advanceTimersByTime(1 * 1e3);
    // 0:00 - 00
    expect(clock.timeMs).toBe(0 * 1e3);
    expect(clock.byoyomi).toBe(0);
    expect(settings.onBeepShort).toBeCalledTimes(8);
    expect(settings.onStopBeep).toBeCalledTimes(2);
    expect(settings.onTimeout).toBeCalledTimes(1);
  });

  it("increment", () => {
    const settings = {
      timeMs: 300 * 1e3,
      byoyomi: 0,
      increment: 5,
      onBeepShort: vi.fn(),
      onBeepUnlimited: vi.fn(),
      onStopBeep: vi.fn(),
      onTimeout: vi.fn(),
    };
    const clock = new Clock();
    clock.setup(settings);
    clock.start();
    // 5:00
    expect(clock.timeMs).toBe(300 * 1e3);
    expect(clock.byoyomi).toBe(0);
    expect(settings.onStopBeep).toBeCalledTimes(1);
    vi.advanceTimersByTime(200 * 1e3);
    // 1:40
    expect(clock.timeMs).toBe(100 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(0);
    clock.stop();
    // 1:45
    expect(clock.timeMs).toBe(105 * 1e3);
    expect(settings.onStopBeep).toBeCalledTimes(2);
    clock.start();
    expect(settings.onStopBeep).toBeCalledTimes(3);
    vi.advanceTimersByTime(47 * 1e3);
    // 0:58
    expect(clock.timeMs).toBe(58 * 1e3);
    expect(settings.onBeepShort).toBeCalledTimes(1);
    clock.stop();
    // 1:03
    expect(clock.timeMs).toBe(63 * 1e3);
    expect(settings.onStopBeep).toBeCalledTimes(4);
  });
});
