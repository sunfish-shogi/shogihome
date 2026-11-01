// バナー画像に使える拡張子。優先順に並べる。
// デスクトップ版は画像をカスタムスキーム (user-file:) で読み込むため、その許可と揃える。
//
// WebAssembly エンジンの Worker からも参照されるため、このファイルには依存を持たせないこと。
// (usi.ts を経由すると encoding-japanese や tsshogi が Worker のバンドルに入ってしまう)
export const BANNER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
