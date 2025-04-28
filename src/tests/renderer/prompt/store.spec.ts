import api, { API } from "@/renderer/ipc/api.js";
import { CommandType } from "@/common/advanced/command.js";
import { Store } from "@/renderer/prompt/store.js";
import { Mocked } from "vitest";
import { PromptTarget } from "@/common/advanced/prompt.js";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

describe("prompt/store", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        toString: () => "file://foo/bar/?target=csa&session=123&name=test-server%3A4081",
      },
      setTimeout: vi.fn().mockImplementation((fn) => {
        fn();
        return 0; // FIXME: これだとバッファリングのテストにならない。
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("getters", () => {
    const store = new Store();
    expect(store.target).toBe(PromptTarget.CSA);
    expect(store.sessionID).toBe(123);
    expect(store.name).toBe("test-server:4081");
  });

  it("history", async () => {
    mockAPI.setupPrompt.mockResolvedValueOnce({
      discarded: 3,
      commands: [
        { type: CommandType.SEND, command: "foo", dateTime: "t1", timeMs: 10 },
        { type: CommandType.RECEIVE, command: "bar", dateTime: "t2", timeMs: 20 },
        { type: CommandType.SEND, command: "baz", dateTime: "t3", timeMs: 30 },
      ],
    });
    const store = new Store();
    await store.setup();
    expect(mockAPI.setupPrompt).nthCalledWith(1, PromptTarget.CSA, 123);

    vi.stubGlobal("Math", {
      random: vi.fn().mockReturnValue(0),
      floor: vi.fn().mockReturnValueOnce(444).mockReturnValueOnce(555).mockReturnValueOnce(666),
    });
    store.onCommand({ type: CommandType.RECEIVE, command: "qux", dateTime: "t4", timeMs: 40 });
    store.onCommand({ type: CommandType.RECEIVE, command: "quux", dateTime: "t5", timeMs: 50 });
    store.onCommand({ type: CommandType.SEND, command: "corge", dateTime: "t6", timeMs: 60 });
    expect(store.history).toStrictEqual({
      discarded: 3,
      commands: [
        { id: 0, type: CommandType.SEND, command: "foo", dateTime: "t1", timeMs: 10 },
        { id: 1, type: CommandType.RECEIVE, command: "bar", dateTime: "t2", timeMs: 20 },
        { id: 2, type: CommandType.SEND, command: "baz", dateTime: "t3", timeMs: 30 },
        { id: 3, type: CommandType.RECEIVE, command: "qux", dateTime: "t4", timeMs: 40 },
        { id: 4, type: CommandType.RECEIVE, command: "quux", dateTime: "t5", timeMs: 50 },
        { id: 5, type: CommandType.SEND, command: "corge", dateTime: "t6", timeMs: 60 },
      ],
    });
  });

  it("invokeCommand", () => {
    mockAPI.invokePromptCommand.mockResolvedValueOnce();
    const store = new Store();
    store.invokeCommand(CommandType.SEND, "foo");
    expect(mockAPI.invokePromptCommand).nthCalledWith(
      1,
      PromptTarget.CSA,
      123,
      CommandType.SEND,
      "foo",
    );
  });
});
