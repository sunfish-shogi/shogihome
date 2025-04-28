import { ArgumentsParser } from "@/command/common/arguments.js";
import process from "node:process";

vi.mock("process");

const neverFunc = (): never => {
  throw new Error("never");
};

describe("command/common/arguments", () => {
  afterEach(() => {
    process.argv.length = 2;
    vi.clearAllMocks();
  });

  it("parse", async () => {
    process.argv = [
      "node",
      "test-command",
      "--opt1",
      "value1",
      "--opt3",
      "value3",
      "--num1",
      "123",
      "--num3",
      "456",
      "--flag1",
      "arg1",
      "arg2",
    ];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    const opt1 = parser.value("opt1", "option 1", "default1");
    const opt2 = parser.value("opt2", "option 2", "default2");
    const opt3 = parser.valueOrNull("opt3", "option 3");
    const opt4 = parser.valueOrNull("opt4", "option 4");
    const num1 = parser.number("num1", "number 1", 1);
    const num2 = parser.number("num2", "number 2", 2);
    const num3 = parser.numberOrNull("num3", "number 3");
    const num4 = parser.numberOrNull("num4", "number 4");
    const flag1 = parser.flag("flag1", "flag 1");
    const flag2 = parser.flag("flag2", "flag 2");
    parser.parse();
    expect(opt1()).toBe("value1");
    expect(opt2()).toBe("default2");
    expect(opt3()).toBe("value3");
    expect(opt4()).toBeNull();
    expect(num1()).toBe(123);
    expect(num2()).toBe(2);
    expect(num3()).toBe(456);
    expect(num4()).toBeNull();
    expect(flag1()).toBeTruthy();
    expect(flag2()).toBeFalsy();
    expect(parser.args).toEqual(["arg1", "arg2"]);
  });

  it("not number", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(neverFunc);
    process.argv = ["node", "test-command", "--num1", "foo"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.number("num1", "number 1", 1);
    expect(() => parser.parse()).toThrow();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("restrictions: list: ok", async () => {
    process.argv = ["node", "test-command", "--opt1", "foo"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.value("opt1", "option 1", "default1", ["foo", "bar"]);
    parser.parse();
  });

  it("restrictions: list: error", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(neverFunc);
    process.argv = ["node", "test-command", "--opt1", "baz"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.value("opt1", "option 1", "default1", ["foo", "bar"]);
    expect(() => parser.parse()).toThrow();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("restrictions: min: ok", async () => {
    process.argv = ["node", "test-command", "--num1", "100"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.number("num1", "number 1", 1, { min: 100, max: 200 });
    parser.parse();
  });

  it("restrictions: min: error", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(neverFunc);
    process.argv = ["node", "test-command", "--num1", "99"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.number("num1", "number 1", 1, { min: 100, max: 200 });
    expect(() => parser.parse()).toThrow();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("restrictions: max: ok", async () => {
    process.argv = ["node", "test-command", "--num1", "200"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.number("num1", "number 1", 1, { min: 100, max: 200 });
    parser.parse();
  });

  it("restrictions: max: error", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(neverFunc);
    process.argv = ["node", "test-command", "--num1", "201"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.number("num1", "number 1", 1, { min: 100, max: 200 });
    expect(() => parser.parse()).toThrow();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("unknown option", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(neverFunc);
    process.argv = ["node", "test-command", "--opt", "foo"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    expect(() => parser.parse()).toThrow();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("bare args", async () => {
    process.argv = ["node", "test-command", "--", "--opt", "foo"];
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.parse();
    expect(parser.args).toEqual(["--opt", "foo"]);
  });

  it("help", async () => {
    const parser = new ArgumentsParser("test-command", "<arg1> <arg2>");
    parser.value("opt1", "option 1", "default1");
    parser.value("opt2", "option 2", "default2");
    parser.flag("flag1", "flag 1");
    parser.flag("flag2", "flag 2");
    expect(parser.help).toBe(
      "Usage:\n" +
        "  test-command [options] <arg1> <arg2>\n" +
        "\n" +
        "Options:\n" +
        "  --opt1 VALUE\n" +
        "      option 1\n" +
        "      (default: default1)\n" +
        "  --opt2 VALUE\n" +
        "      option 2\n" +
        "      (default: default2)\n" +
        "  --flag1\n" +
        "      flag 1\n" +
        "  --flag2\n" +
        "      flag 2\n",
    );
  });
});
