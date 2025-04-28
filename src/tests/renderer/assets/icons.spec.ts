import { exists } from "@/background/helpers/file.js";
import { iconSourceMap } from "@/renderer/assets/icons.js";

describe("assets/icons", () => {
  describe("checkIconFilePaths", () => {
    Object.values(iconSourceMap).forEach((source) => {
      it(`shouldExists:${source}`, async () => {
        expect(await exists(`public/${source}`)).toBeTruthy();
      });
    });
  });
});
