import { CustomImageType, getCustomImageExtensions } from "@/common/settings/image.js";

describe("settings/image", () => {
  it("getCustomImageExtensions", () => {
    expect(getCustomImageExtensions(CustomImageType.GENERAL)).toEqual([
      "png",
      "jpg",
      "jpeg",
      "gif",
      "bmp",
      "webp",
    ]);
    // 駒画像は Jimp で読み込むため WebP を含めない。
    expect(getCustomImageExtensions(CustomImageType.PIECE)).toEqual([
      "png",
      "jpg",
      "jpeg",
      "gif",
      "bmp",
    ]);
  });
});
