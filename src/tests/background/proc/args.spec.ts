import { parseProcessArgs } from "@/background/proc/args.js";
import { ProcessArgs } from "@/common/ipc/process.js";
import * as settings from "@/background/settings.js";
import { Mocked } from "vitest";

vi.mock("@/background/settings.js");

const mockSettings = settings as Mocked<typeof settings>;

describe("args", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("normal", () => {
    const args = parseProcessArgs(["node", "/path/to/record.kif"]);
    expect(args).not.toBeInstanceOf(Error);
    expect(args).toEqual({
      type: "gui",
      path: "/path/to/record.kif",
      ply: undefined,
      layoutProfile: undefined,
    });
  });

  it("ShogiGUI-style", () => {
    const args = parseProcessArgs(["node", "/path/to/record.kif", "-n", "123"]) as ProcessArgs;
    expect(args.path).toEqual("/path/to/record.kif");
    expect(args.ply).toBe(123);
  });

  it("KifuBase-style", () => {
    const args = parseProcessArgs(["node", "/path/to/record.kif", "+123"]) as ProcessArgs;
    expect(args.path).toEqual("/path/to/record.kif");
    expect(args.ply).toBe(123);
  });

  it("custom-layout-profile", () => {
    mockSettings.loadLayoutProfileListSync.mockReturnValue({
      profiles: [
        {
          uri: "es://layout-profile/test",
          name: "Test Layout Profile",
          components: [],
        },
      ],
    });
    const args = parseProcessArgs([
      "node",
      "/path/to/record.kif",
      "--layout-profile",
      "es://layout-profile/test",
    ]) as ProcessArgs;
    expect(args).not.toBeInstanceOf(Error);
    expect(args).toEqual({
      type: "gui",
      path: "/path/to/record.kif",
      ply: undefined,
      layoutProfile: {
        uri: "es://layout-profile/test",
        name: "Test Layout Profile",
        components: [],
      },
    });

    const error = parseProcessArgs([
      "node",
      "/path/to/record.kif",
      "--layout-profile",
      "es://layout-profile/invalid",
    ]);
    expect(error).toBeInstanceOf(Error);
  });

  it("headless/add-engine", () => {
    const args = parseProcessArgs([
      "node",
      "--add-engine",
      "/path/to/engine",
      "EngineName",
      "30",
    ]) as ProcessArgs;
    expect(args).toEqual({
      type: "headless",
      operation: "addEngine",
      path: "/path/to/engine",
      name: "EngineName",
      timeout: 30,
    });
  });

  it("headless/add-engine/with-options", () => {
    const args = parseProcessArgs([
      "node",
      "--add-engine",
      "/path/to/engine",
      "EngineName",
      "30",
      "test-base64-options",
    ]) as ProcessArgs;
    expect(args).toEqual({
      type: "headless",
      operation: "addEngine",
      path: "/path/to/engine",
      name: "EngineName",
      timeout: 30,
      engineOptionsBase64: "test-base64-options",
    });
  });

  it("headless/add-engine/few-args", () => {
    const args = parseProcessArgs(["node", "--add-engine", "/path/to/engine"]);
    expect(args).toBeInstanceOf(Error);
  });

  it("headless/add-engine/empty-engine-path", () => {
    const args = parseProcessArgs(["node", "--add-engine", "", "EngineName", "30"]);
    expect(args).toBeInstanceOf(Error);
  });

  it("headless/add-engine/empty-engine-name", () => {
    const args = parseProcessArgs(["node", "--add-engine", "/path/to/engine", "", "30"]);
    expect(args).toBeInstanceOf(Error);
  });

  it("headless/add-engine/invalid-timeout", () => {
    const args = parseProcessArgs([
      "node",
      "--add-engine",
      "/path/to/engine",
      "EngineName",
      "invalid",
    ]);
    expect(args).toBeInstanceOf(Error);
  });
});
