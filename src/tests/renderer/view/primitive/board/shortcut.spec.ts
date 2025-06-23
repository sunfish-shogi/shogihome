import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";

describe("shortcut", () => {
  describe("record", () => {
    it("vertical", () => {
      const shortcutKeys = getRecordShortcutKeys("vertical");
      expect(shortcutKeys.Back).toBe("ArrowUp");
      expect(shortcutKeys.Forward).toBe("ArrowDown");
      expect(shortcutKeys.Begin).toBe("ArrowLeft");
      expect(shortcutKeys.End).toBe("ArrowRight");
    });

    it("horizontal", () => {
      const shortcutKeys = getRecordShortcutKeys("horizontal");
      expect(shortcutKeys.Back).toBe("ArrowLeft");
      expect(shortcutKeys.Forward).toBe("ArrowRight");
      expect(shortcutKeys.Begin).toBe("ArrowUp");
      expect(shortcutKeys.End).toBe("ArrowDown");
    });
  });
});
