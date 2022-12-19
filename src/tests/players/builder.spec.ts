import { defaultPlayerBuilder } from "@/players/builder";
import { HumanPlayer } from "@/players/human";
import { USIPlayer } from "@/players/usi";
import api, { API } from "@/ipc/api";
import * as uri from "@/uri";

jest.mock("@/ipc/api");

const mockAPI = api as jest.Mocked<API>;

describe("builder", () => {
  it("human", async () => {
    const player = await defaultPlayerBuilder().build({
      name: "人",
      uri: uri.ES_HUMAN,
    });
    expect(player).toBeInstanceOf(HumanPlayer);
  });

  it("usi", async () => {
    mockAPI.usiLaunch.mockResolvedValue(Promise.resolve(123));
    const setting = {
      name: "USI Engine",
      uri: "es://usi-engine/test",
      usi: {
        uri: "es://usi-engine/test",
        name: "Engine Test",
        defaultName: "engine-test",
        author: "author-test",
        path: "path-test",
        options: {},
      },
    };
    const player = await defaultPlayerBuilder().build(setting);
    expect(player).toBeInstanceOf(USIPlayer);
    expect(mockAPI.usiLaunch).toBeCalledWith(setting.usi, 10);
  });
});
