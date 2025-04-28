import { fetchInitialRecordFileRequest, setInitialFilePath } from "@/background/proc/args.js";

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
});
