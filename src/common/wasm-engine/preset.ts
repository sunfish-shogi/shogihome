// マニフェストのプリセットをエンジンのオプションへ反映する。
// Web 版の組み込みエンジン (renderer/wasm-engine/catalog.ts) と、デスクトップ版で
// ダウンロードしたエンジン (background/usi/wasm/install.ts) の両方から使う。
import { USIEngineOptions } from "@/common/settings/usi.js";
import { EngineManifestPreset } from "./manifest.js";

// プリセットの値は value (ユーザーが編集した値) ではなく default に入れる。
// このプリセットにとっての「エンジンの既定値」がそれであり、オプション画面の
// 「エンジンの既定値に戻す」が戻す先にもなる。value に入れると、リセットで
// 素のエンジンの既定値まで戻ってしまい、プリセットの意味が無くなる。
// (value を空にしておくことで、ユーザーが編集したかどうかの区別も保てる。)
//
// エンジンが宣言していないオプションの値は無視する。
export function applyPresetValues(options: USIEngineOptions, preset?: EngineManifestPreset): void {
  for (const [name, value] of Object.entries(preset?.values || {})) {
    const option = options[name];
    if (option && option.type !== "button") {
      option.default = value as never;
    }
  }
}
