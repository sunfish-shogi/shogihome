import { invoke } from "@/background/headless/invoke.js";
import * as usi from "@/background/usi/index.js";
import * as settings from "@/background/settings.js";
import { Mocked } from "vitest";
import { USIEngines } from "@/common/settings/usi";

vi.mock("@/background/usi/index.js");
vi.mock("@/background/settings.js");

const mockUSI = usi as Mocked<typeof usi>;
const mockSettings = settings as Mocked<typeof settings>;

describe("headless", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invoke/add-engine", async () => {
    const orgUSIEngines = new USIEngines();
    orgUSIEngines.addEngine({
      uri: "es://my-engine1",
      name: "MyTestEngine1",
      defaultName: "TestEngine1",
      author: "TestAuthor1",
      path: "/path/to/engine1",
      options: {},
      enableEarlyPonder: false,
    });
    mockSettings.loadUSIEngines.mockResolvedValue(orgUSIEngines);
    mockSettings.saveUSIEngines.mockResolvedValue();
    mockUSI.getUSIEngineInfo.mockResolvedValue({
      uri: "es://my-engine2",
      name: "MyTestEngine2",
      defaultName: "TestEngine2",
      author: "TestAuthor2",
      path: "/path/to/engine2",
      options: {},
      enableEarlyPonder: false,
    });

    await invoke({
      operation: "addEngine",
      path: "/path/to/engine2",
      name: "MyTestEngine2",
      timeout: 30,
    });

    expect(mockUSI.getUSIEngineInfo).toHaveBeenCalledWith("/path/to/engine2", 30);
    expect(mockSettings.saveUSIEngines).toHaveBeenCalledTimes(1);
    const result = mockSettings.saveUSIEngines.mock.calls[0][0].engineList;
    expect(result).toHaveLength(2);
    expect(result[0].uri).toBe("es://my-engine1");
    expect(result[1].uri).toBe("es://my-engine2");
    expect(result[1].name).toBe("MyTestEngine2");
    expect(result[1].defaultName).toBe("TestEngine2");
    expect(result[1].author).toBe("TestAuthor2");
    expect(result[1].path).toBe("/path/to/engine2");
  });
});
