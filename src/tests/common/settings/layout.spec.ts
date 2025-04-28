import {
  appendCustomLayoutProfile,
  deserializeLayoutProfile,
  duplicateCustomLayoutProfile,
  emptyLayoutProfileList,
  LayoutProfile,
  LayoutProfileList,
  removeCustomLayoutProfile,
  serializeLayoutProfile,
} from "@/common/settings/layout.js";

describe("common/settings/layout", () => {
  it("appendCustomLayout", () => {
    const config = emptyLayoutProfileList();

    // append new profile
    const uri1 = appendCustomLayoutProfile(config);
    expect(uri1).match(/^es:\/\/layout-profile\//);
    expect(config.profiles.length).toBe(1);
    expect(config.profiles[0].uri).toBe(uri1);
    expect(config.profiles[0].components.length).toBe(7);

    // append existing profile
    const uri2 = appendCustomLayoutProfile(config, {
      uri: "es://layout-profile/existing-profile",
      name: "Existing Profile",
      components: [
        { type: "Board", left: 10, top: 10, width: 100, height: 100 },
        { type: "Record", left: 10, top: 10, width: 100, height: 100 },
      ],
    });
    expect(uri2).toBe("es://layout-profile/existing-profile");
    expect(config.profiles.length).toBe(2);
    expect(config.profiles[1].uri).toBe(uri2);
    expect(config.profiles[1].components.length).toBe(2);
  });

  it("duplicateCustomLayoutProfile", () => {
    const config: LayoutProfileList = {
      profiles: [
        {
          uri: "es://layout-profile/foo",
          name: "foo",
          components: [
            { type: "Board", left: 10, top: 10, width: 100, height: 100 },
            { type: "Record", left: 10, top: 10, width: 100, height: 100 },
          ],
        },
        {
          uri: "es://layout-profile/bar",
          name: "bar",
          components: [
            { type: "Record", left: 10, top: 10, width: 100, height: 100 },
            { type: "Analytics", left: 10, top: 10, width: 100, height: 100 },
          ],
        },
        {
          uri: "es://layout-profile/baz",
          name: "baz",
          components: [
            { type: "Board", left: 10, top: 10, width: 100, height: 100 },
            { type: "Record", left: 10, top: 10, width: 100, height: 100 },
          ],
        },
      ],
    };

    const uri = duplicateCustomLayoutProfile(config, "es://layout-profile/bar");
    expect(uri).match(/^es:\/\/layout-profile\//);
    expect(config.profiles.length).toBe(4);
    expect(config.profiles[3].name).toBe("bar (Copy)");
    expect(config.profiles[3].components.length).toBe(2);
    expect(config.profiles[3].components[0].type).toBe("Record");
    expect(config.profiles[3].components[1].type).toBe("Analytics");
  });

  it("removeCustomLayoutProfile", () => {
    const config: LayoutProfileList = {
      profiles: [
        {
          uri: "es://layout-profile/foo",
          name: "foo",
          components: [
            { type: "Board", left: 10, top: 10, width: 100, height: 100 },
            { type: "Record", left: 10, top: 10, width: 100, height: 100 },
          ],
        },
        {
          uri: "es://layout-profile/bar",
          name: "bar",
          components: [
            { type: "Record", left: 10, top: 10, width: 100, height: 100 },
            { type: "Analytics", left: 10, top: 10, width: 100, height: 100 },
          ],
        },
        {
          uri: "es://layout-profile/baz",
          name: "baz",
          components: [
            { type: "Board", left: 10, top: 10, width: 100, height: 100 },
            { type: "Record", left: 10, top: 10, width: 100, height: 100 },
          ],
        },
      ],
    };
    removeCustomLayoutProfile(config, "es://layout-profile/bar");
    expect(config.profiles.length).toBe(2);
    expect(config.profiles[0].name).toBe("foo");
    expect(config.profiles[1].name).toBe("baz");
  });

  it("serialize/deserialize", () => {
    const profile: LayoutProfile = {
      uri: "es://layout-profile/foo",
      name: "foo",
      components: [
        { type: "Board", left: 10, top: 10, width: 100, height: 100 },
        { type: "Record", left: 10, top: 10, width: 100, height: 100 },
      ],
    };
    const data = serializeLayoutProfile(profile);
    expect(data).match(/^{.*}$/);
    const deserialized = deserializeLayoutProfile(data);
    expect(deserialized.name).toBe(profile.name);
    expect(deserialized.components).toStrictEqual(profile.components);
  });
});
