import { PlayerSettings, validatePlayerSettings } from "@/common/settings/player.js";

describe("settings/player", () => {
  describe("validate", () => {
    it("human/ok", () => {
      expect(
        validatePlayerSettings({
          name: "人",
          uri: "es://human",
        }),
      ).toBeUndefined();
    });

    it("human/empty-name", () => {
      expect(
        validatePlayerSettings({
          name: "",
          uri: "es://human",
        }),
      ).toBeInstanceOf(Error);
    });

    it("human/empty-uri", () => {
      expect(
        validatePlayerSettings({
          name: "人",
          uri: "",
        }),
      ).toBeInstanceOf(Error);
    });

    it("usi/ok", () => {
      expect(
        validatePlayerSettings({
          name: "my engine",
          uri: "es://usi-engine/test",
          usi: {
            uri: "es://usi-engine/test",
            name: "my engine",
            defaultName: "test engine",
            author: "test author",
            path: "path/to/engine",
            options: {
              USI_Ponder: {
                name: "USI_Ponder",
                type: "check",
                order: 0,
                default: "true",
                value: "false",
              },
            },
            enableEarlyPonder: false,
          },
        }),
      ).toBeUndefined();
    });

    it("usi/invalid-option-value", () => {
      expect(
        validatePlayerSettings({
          name: "my engine",
          uri: "es://usi-engine/test",
          usi: {
            uri: "es://usi-engine/test",
            name: "my engine",
            defaultName: "test engine",
            author: "test author",
            path: "path/to/engine",
            options: {
              USI_Ponder: {
                name: "USI_Ponder",
                type: "check",
                order: 0,
                default: "true",
                value: "INVALID",
              },
            },
            enableEarlyPonder: false,
          },
        } as unknown as PlayerSettings),
      ).toBeInstanceOf(Error);
    });
  });
});
