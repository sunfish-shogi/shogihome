import { CommandHistory, CommandType, addCommand } from "@/common/advanced/command.js";

describe("advanced/prompt", () => {
  it("addCommand", () => {
    const history = {
      discarded: 0,
      commands: [],
    } as CommandHistory;
    addCommand(
      history,
      [
        { type: CommandType.SEND, command: "test01", dateTime: "t1", timeMs: 10 },
        { type: CommandType.RECEIVE, command: "test02", dateTime: "t2", timeMs: 20 },
        { type: CommandType.RECEIVE, command: "test03", dateTime: "t3", timeMs: 30 },
        { type: CommandType.SEND, command: "test04", dateTime: "t4", timeMs: 40 },
        { type: CommandType.SEND, command: "test05", dateTime: "t5", timeMs: 50 },
        { type: CommandType.RECEIVE, command: "test06", dateTime: "t6", timeMs: 60 },
      ],
      10,
      5,
    );
    expect(history.discarded).toBe(0);
    expect(history.commands).toHaveLength(6);
    expect(history.commands[0].command).toBe("test01");
    expect(history.commands[5].command).toBe("test06");
    addCommand(
      history,
      [
        { type: CommandType.RECEIVE, command: "test07", dateTime: "t7", timeMs: 70 },
        { type: CommandType.SEND, command: "test08", dateTime: "t8", timeMs: 80 },
        { type: CommandType.SEND, command: "test09", dateTime: "t9", timeMs: 90 },
        { type: CommandType.RECEIVE, command: "test10", dateTime: "t10", timeMs: 100 },
        { type: CommandType.RECEIVE, command: "test11", dateTime: "t11", timeMs: 110 },
        { type: CommandType.SEND, command: "test12", dateTime: "t12", timeMs: 120 },
      ],
      10,
      5,
    );
    expect(history.discarded).toBe(5);
    expect(history.commands).toHaveLength(7);
    expect(history.commands[0].command).toBe("test06");
    expect(history.commands[6].command).toBe("test12");
  });
});
