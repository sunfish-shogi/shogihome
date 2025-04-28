import api, { API } from "@/renderer/ipc/api.js";
import { Store } from "@/renderer/layout/store.js";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api.js");

const mockAPI = api as Mocked<API>;

describe("renderer/layout/store", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("selectProfile", () => {
    const store = new Store();
    store.selectProfile("es://layout-profile/foo");
    expect(mockAPI.updateLayoutProfileList).toBeCalledTimes(1);
    expect(mockAPI.updateLayoutProfileList.mock.calls[0][0]).toBe("es://layout-profile/foo");
  });

  it("addCustomProfile", () => {
    const store = new Store();
    store.addCustomProfile();
    expect(mockAPI.updateLayoutProfileList).toBeCalledTimes(1);
    expect(store.customLayoutProfiles.length).toBe(1);
    store.addCustomProfile({
      uri: "es://layout-profile/foo",
      name: "foo",
      components: [
        { type: "Board", left: 0, top: 0, width: 100, height: 100 },
        { type: "Record", left: 0, top: 0, width: 100, height: 100 },
      ],
    });
    expect(mockAPI.updateLayoutProfileList).toBeCalledTimes(2);
    expect(store.customLayoutProfiles.length).toBe(2);
    expect(store.customLayoutProfiles[1].uri).toBe("es://layout-profile/foo");
    expect(store.customLayoutProfiles[1].components.length).toBe(2);
  });

  it("duplicateCustomProfile", () => {
    const store = new Store();
    store.addCustomProfile({
      uri: "es://layout-profile/foo",
      name: "foo",
      components: [
        { type: "Board", left: 0, top: 0, width: 100, height: 100 },
        { type: "Record", left: 0, top: 0, width: 100, height: 100 },
      ],
    });
    store.duplicateCustomProfile("es://layout-profile/foo");
    expect(mockAPI.updateLayoutProfileList).toBeCalledTimes(2);
    expect(store.customLayoutProfiles.length).toBe(2);
    expect(store.customLayoutProfiles[1].components.length).toBe(2);
  });

  it("removeCustomProfile", () => {
    const store = new Store();
    store.addCustomProfile({
      uri: "es://layout-profile/foo",
      name: "foo",
      components: [
        { type: "Board", left: 0, top: 0, width: 100, height: 100 },
        { type: "Record", left: 0, top: 0, width: 100, height: 100 },
      ],
    });
    store.addCustomProfile({
      uri: "es://layout-profile/bar",
      name: "bar",
      components: [
        { type: "Board", left: 0, top: 0, width: 100, height: 100 },
        { type: "Record", left: 0, top: 0, width: 100, height: 100 },
      ],
    });
    store.removeCustomProfile("es://layout-profile/foo");
    expect(mockAPI.updateLayoutProfileList).toBeCalledTimes(3);
    expect(store.customLayoutProfiles.length).toBe(1);
    expect(store.customLayoutProfiles[0].uri).toBe("es://layout-profile/bar");
  });

  it("updateCustomProfile", () => {
    const store = new Store();
    store.addCustomProfile({
      uri: "es://layout-profile/foo",
      name: "foo",
      components: [
        { type: "Board", left: 0, top: 0, width: 100, height: 100 },
        { type: "Record", left: 0, top: 0, width: 100, height: 100 },
      ],
    });
    store.updateCustomProfile("es://layout-profile/foo", {
      uri: "es://layout-profile/foo",
      name: "bar",
      components: [
        { type: "Board", left: 0, top: 0, width: 100, height: 100 },
        { type: "Record", left: 0, top: 0, width: 100, height: 100 },
        { type: "Comment", left: 0, top: 0, width: 100, height: 100 },
      ],
    });
    expect(mockAPI.updateLayoutProfileList).toBeCalledTimes(2);
    expect(store.customLayoutProfiles.length).toBe(1);
    expect(store.customLayoutProfiles[0].name).toBe("bar");
    expect(store.customLayoutProfiles[0].components.length).toBe(3);
  });
});
