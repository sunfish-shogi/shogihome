// カスタム画像の用途
export enum CustomImageType {
  // 背景・盤・駒台など、レンダラーがカスタムスキーム (user-file:) で直接表示する画像
  GENERAL = "general",
  // 駒画像 (Jimp で読み込んで切り出す)
  PIECE = "piece",
}

// 背景・盤・駒台の画像として選択できる拡張子。
// カスタムスキーム (user-file:) で許可している拡張子と揃える。
const generalImageExtensions = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];

// 駒画像として選択できる拡張子。
// Jimp の標準デコーダが WebP に対応していないため WebP は含めない。
// TIFF は Jimp で読めるが、プレビューを表示できないため含めない。
const pieceImageExtensions = ["png", "jpg", "jpeg", "gif", "bmp"];

export function getCustomImageExtensions(type: CustomImageType): string[] {
  switch (type) {
    case CustomImageType.PIECE:
      return pieceImageExtensions;
    default:
      return generalImageExtensions;
  }
}
