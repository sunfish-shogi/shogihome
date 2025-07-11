import {
  fetchInitialRecordFileRequest,
  parseHeadlessArgs,
  setInitialFilePath,
} from "@/background/proc/args.js";

describe("args", () => {
  afterEach(() => {
    setInitialFilePath("");
  });

  it("normal", () => {
    process.argv = ["node", "/path/to/record.kif"];
    const request = fetchInitialRecordFileRequest();
    expect(request?.path).toEqual("/path/to/record.kif");
    expect(request?.ply).toBeUndefined();
  });

  it("ShogiGUI-style", () => {
    process.argv = ["node", "/path/to/record.kif", "-n", "123"];
    const request = fetchInitialRecordFileRequest();
    expect(request?.path).toEqual("/path/to/record.kif");
    expect(request?.ply).toBe(123);
  });

  it("KifuBase-style", () => {
    process.argv = ["node", "/path/to/record.kif", "+123"];
    const request = fetchInitialRecordFileRequest();
    expect(request?.path).toEqual("/path/to/record.kif");
    expect(request?.ply).toBe(123);
  });

  it("mac", () => {
    setInitialFilePath("/path/to/record.kif");
    const request = fetchInitialRecordFileRequest();
    expect(request?.path).toEqual("/path/to/record.kif");
    expect(request?.ply).toBeUndefined();
  });

  it("headless/no-op", () => {
    process.argv = ["node", "/path/to/record.kif"];
    const result = parseHeadlessArgs();
    expect(result).toBeNull();
  });

  it("headless/add-engine", () => {
    process.argv = ["node", "--add-engine", "/path/to/engine", "EngineName", "30"];
    const result = parseHeadlessArgs();
    expect(result).toEqual({
      operation: "addEngine",
      path: "/path/to/engine",
      name: "EngineName",
      timeout: 30,
    });
  });

  it("headless/add-engine/few-args", () => {
    process.argv = ["node", "--add-engine", "/path/to/engine"];
    const result = parseHeadlessArgs();
    expect(result).toBeInstanceOf(Error);
  });

  it("headless/add-engine/empty-engine-path", () => {
    process.argv = ["node", "--add-engine", "", "EngineName", "30"];
    const result = parseHeadlessArgs();
    expect(result).toBeInstanceOf(Error);
  });

  it("headless/add-engine/empty-engine-name", () => {
    process.argv = ["node", "--add-engine", "/path/to/engine", "", "30"];
    const result = parseHeadlessArgs();
    expect(result).toBeInstanceOf(Error);
  });

  it("headless/add-engine/invalid-timeout", () => {
    process.argv = ["node", "--add-engine", "/path/to/engine", "EngineName", "invalid"];
    const result = parseHeadlessArgs();
    expect(result).toBeInstanceOf(Error);
  });
});
