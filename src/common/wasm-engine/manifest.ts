// 組み込み WebAssembly エンジンのマニフェスト (engine.json)。
//
// エンジンは自身のリポジトリでビルドし、成果物と一緒にこのファイルを出力する。
// ShogiHome 側はディレクトリ名を登録するだけでよく、オプション定義を写す必要は無い。
// 仕様は specs/wasm-engine-abi.md を参照。
import { USIEngineOptionType } from "@/common/settings/usi.js";
import { EXPORT_NAME_PATTERN } from "./loader.js";

// マニフェストの abi フィールドが取り得る値。非互換な変更を入れる際に更新する。
export const ENGINE_ABI = "shogihome-wasm-engine/1";

// cross-origin isolation が必要なのに成立していない場合に Worker が返すエラー。
// Worker とメインスレッドの間で例外の型は保てないため、文字列で識別する。
export const CROSS_ORIGIN_ISOLATION_REQUIRED = "cross-origin isolation is required";

export const MANIFEST_FILE_NAME = "engine.json";

// badge の最大文字数。スマホの縦画面でもエンジン名の横に収まる長さにする。
// 省略して全文を後から見せる手段 (マウスオーバーなど) はタッチ端末に無いため、
// 常に全文を表示できる長さに制限する。
export const MAX_BADGE_LENGTH = 8;

// banner に使える画像の拡張子。
// デスクトップ版は画像をカスタムスキーム (user-file:) で読み込むため、その許可と揃える。
export const BANNER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// links[].label の最大文字数。エンジン選択の下に 1 行で並べるリンクの見出しなので短く制限する。
export const MAX_LINK_LABEL_LENGTH = 40;

// description の最大文字数。エンジン選択の下に小さく表示する説明文で、
// ダイアログを埋め尽くさない長さに制限する。
export const MAX_DESCRIPTION_LENGTH = 400;

// グルーコードの出力形式。
// esm は -sEXPORT_ES6=1 の出力で、そのまま動的 import() できる。
// umd は -sEXPORT_ES6 無しの出力 (YaneuraOu の配布物がこれ) で、
// 読み込み時に export 文を足す必要があるため exportName が要る。
export type EngineModuleFormat = "esm" | "umd";

export type EngineManifestOption = {
  name: string;
  type: USIEngineOptionType;
  default?: string | number;
  min?: number;
  max?: number;
  vars?: string[];
};

// モバイルウェブの対局ダイアログ (MobileGameDialog) で選べるレベル。
export type EngineManifestMobileGameLevel = {
  // レベルの選択肢に出す名前 (例: "Lv.1")。棋譜にはプリセットの displayName に添えて残る。
  label: string;
  // このレベルで対局するときに上書きするオプションの値。プリセットの values より優先する。
  values?: { [name: string]: string | number };
};

// モバイルウェブの対局ダイアログ (MobileGameDialog) に並べるための宣言。
// 宣言のあるプリセットだけがエンジンの選択肢に載る。
export type EngineManifestMobileGame = {
  // 弱い順に並べる。1 つ以上。
  levels: EngineManifestMobileGameLevel[];
};

// 1 つの wasm から複数のエンジンを見せるための定義。
// id はそのまま URI になるため、一度公開したら変更してはならない。
export type EngineManifestPreset = {
  id: string;
  displayName: string;
  values?: { [name: string]: string | number };
  tags?: ("game" | "research" | "mate")[];
  mobileGame?: EngineManifestMobileGame;
};

// エンジンとその同梱物のライセンス。ライセンス表示 (renderer/helpers/copyright.ts) に出す。
// 全文は必ずエンジンのディレクトリに同梱する。配布物だけでライセンスの提示を
// 完結させるためで、外部サイトへのリンクだけでは代えられない。
export type EngineManifestLicense = {
  // ライセンスの対象の表示名。省略時はエンジンの name を使う。
  // 評価パラメータや定跡がエンジン本体と別のライセンスの場合に、対象が分かる名前を書く。
  subject?: string;
  // SPDX 識別子 (例: "MIT", "GPL-3.0-or-later")。そのまま表示に使う。
  spdx: string;
  // ライセンス全文のファイル。マニフェストからの相対パス。
  file: string;
  // ソースコードの入手先。コピーレフトのライセンスでは必須。
  source?: string;
};

// 評価パラメータや定跡など、実行時に読み込むファイル。
// url はマニフェストからの相対パスで、Emscripten の仮想ファイルシステム上の path に書き込む。
export type EngineManifestDataFile = {
  url: string;
  path: string;
};

// エンジンを選択したときに表示する Web ページへのリンク。label を見出しとして表示する。
export type EngineManifestLink = {
  label: string;
  url: string;
};

export type EngineManifest = {
  abi: string;
  module: string;
  moduleFormat: EngineModuleFormat;
  // moduleFormat が "umd" のときだけ意味を持つ。
  exportName?: string;
  // wasm と dataFiles の取得先。省略時はエンジンのディレクトリ (engines/<dir>/)。
  // 大きなファイルを配布物に含めず、オブジェクトストレージなどから配信するためのもの。
  // **module とライセンス全文はここの対象外。** 理由は specs/wasm-engine-abi.md を参照。
  assetBaseURL?: string;
  name: string;
  author: string;
  // エンジン選択の一覧で名前の横に小さく添える目印 (例: "65MB")。全プリセットで共有する。
  badge?: string;
  // エンジン選択の一覧で背景に表示するバナー画像。マニフェストからの相対パス。
  // 全プリセットで共有する。ライセンス全文と同じく、assetBaseURL ではなくエンジンの
  // ディレクトリに置く。
  banner?: string;
  // エンジンの情報ボタンからメッセージダイアログで表示する説明文とリンク。
  // 全プリセットで共有する。
  description?: string;
  links?: EngineManifestLink[];
  // スレッドを使うエンジン (-pthread) は SharedArrayBuffer を要求するため、
  // ページが cross-origin isolated でないと起動できない。
  // 宣言しておくと、モジュールを生成する前に確認して即座に失敗できる。
  requiresCrossOriginIsolation?: boolean;
  licenses?: EngineManifestLicense[];
  dataFiles?: EngineManifestDataFile[];
  options?: EngineManifestOption[];
  presets: EngineManifestPreset[];
};

const OPTION_TYPES: USIEngineOptionType[] = [
  "check",
  "spin",
  "combo",
  "button",
  "string",
  "filename",
];

// ディレクトリ名や相対パスに使える文字。
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

// 上位ディレクトリを参照しない相対パスかどうか。
// "." と ".." は使用可能な文字だけで構成されるため、区切りごとに別途弾く必要がある。
export function isSafeRelativePath(text: string): boolean {
  return (
    SAFE_PATH_PATTERN.test(text) &&
    text.split("/").every((segment) => segment !== "." && segment !== "..")
  );
}

function fail(message: string): never {
  throw new Error(`invalid engine manifest: ${message}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

// 最大文字数を超えないことを確かめる。サロゲートペアを 1 文字と数えるため、コードポイント単位で数える。
function asLimitedString(value: unknown, path: string, max: number): string {
  const text = asString(value, path);
  if ([...text].length > max) {
    fail(`${path} must be at most ${max} characters: ${text}`);
  }
  return text;
}

function asSafePath(value: unknown, path: string): string {
  const text = asString(value, path);
  if (!isSafeRelativePath(text)) {
    fail(`${path} must be a relative path without "..": ${text}`);
  }
  return text;
}

// そのままブラウザへ渡したり、アセットの取得先になったりする値なので、
// 文字列の形だけでなく URL として成立していることを確かめる。
// 前方一致の検査では "https://" のようなホストの無い値を通してしまう。
// 元の文字列と解析結果の両方を返す (値は元のまま保ち、追加の検査は URL で行う)。
function asHttpsURL(value: unknown, path: string): { text: string; url: URL } {
  const text = asString(value, path);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    fail(`${path} must be a valid URL: ${text}`);
  }
  if (url.protocol !== "https:" || !url.hostname) {
    fail(`${path} must be an https URL with a host: ${text}`);
  }
  return { text, url };
}

function parseOption(value: unknown, path: string): EngineManifestOption {
  const record = asRecord(value, path);
  const type = asString(record.type, `${path}.type`) as USIEngineOptionType;
  if (!OPTION_TYPES.includes(type)) {
    fail(`${path}.type is unknown: ${type}`);
  }
  const option: EngineManifestOption = {
    name: asString(record.name, `${path}.name`),
    type,
  };
  if (record.default !== undefined) {
    if (typeof record.default !== "string" && typeof record.default !== "number") {
      fail(`${path}.default must be a string or a number`);
    }
    option.default = record.default;
  }
  for (const key of ["min", "max"] as const) {
    if (record[key] !== undefined) {
      if (typeof record[key] !== "number") {
        fail(`${path}.${key} must be a number`);
      }
      option[key] = record[key] as number;
    }
  }
  if (record.vars !== undefined) {
    if (!Array.isArray(record.vars)) {
      fail(`${path}.vars must be an array`);
    }
    option.vars = record.vars.map((v, i) => asString(v, `${path}.vars[${i}]`));
  }
  return option;
}

function parseLicense(value: unknown, path: string): EngineManifestLicense {
  const record = asRecord(value, path);
  const license: EngineManifestLicense = {
    spdx: asString(record.spdx, `${path}.spdx`),
    file: asSafePath(record.file, `${path}.file`),
  };
  if (record.subject !== undefined) {
    license.subject = asString(record.subject, `${path}.subject`);
  }
  if (record.source !== undefined) {
    license.source = asHttpsURL(record.source, `${path}.source`).text;
  }
  return license;
}

function parseLink(value: unknown, path: string): EngineManifestLink {
  const record = asRecord(value, path);
  return {
    label: asLimitedString(record.label, `${path}.label`, MAX_LINK_LABEL_LENGTH),
    // ブラウザで開く URL なので https に限る。
    url: asHttpsURL(record.url, `${path}.url`).text,
  };
}

function parseValues(value: unknown, path: string): { [name: string]: string | number } {
  const record = asRecord(value, path);
  const values: { [name: string]: string | number } = {};
  for (const [name, v] of Object.entries(record)) {
    if (typeof v !== "string" && typeof v !== "number") {
      fail(`${path}.${name} must be a string or a number`);
    }
    values[name] = v;
  }
  return values;
}

function parseMobileGame(value: unknown, path: string): EngineManifestMobileGame {
  const record = asRecord(value, path);
  if (!Array.isArray(record.levels) || record.levels.length === 0) {
    fail(`${path}.levels must be a non-empty array`);
  }
  const levels = record.levels.map((v, i) => {
    const levelPath = `${path}.levels[${i}]`;
    const level = asRecord(v, levelPath);
    const result: EngineManifestMobileGameLevel = {
      label: asString(level.label, `${levelPath}.label`),
    };
    if (level.values !== undefined) {
      result.values = parseValues(level.values, `${levelPath}.values`);
    }
    return result;
  });
  return { levels };
}

function parsePreset(value: unknown, path: string): EngineManifestPreset {
  const record = asRecord(value, path);
  const preset: EngineManifestPreset = {
    id: asSafePath(record.id, `${path}.id`),
    displayName: asString(record.displayName, `${path}.displayName`),
  };
  if (record.values !== undefined) {
    preset.values = parseValues(record.values, `${path}.values`);
  }
  if (record.tags !== undefined) {
    if (!Array.isArray(record.tags)) {
      fail(`${path}.tags must be an array`);
    }
    preset.tags = [];
    for (const tag of record.tags as unknown[]) {
      if (tag !== "game" && tag !== "research" && tag !== "mate") {
        fail(`${path}.tags[] must be one of "game", "research", or "mate"`);
      }
      preset.tags.push(tag);
    }
  }
  if (record.mobileGame !== undefined) {
    preset.mobileGame = parseMobileGame(record.mobileGame, `${path}.mobileGame`);
  }
  return preset;
}

// JSON をマニフェストとして検証する。不正な場合は Error を投げる。
export function parseEngineManifest(json: unknown): EngineManifest {
  const record = asRecord(json, "manifest");
  const abi = asString(record.abi, "manifest.abi");
  if (abi !== ENGINE_ABI) {
    fail(`unsupported abi: ${abi} (expected ${ENGINE_ABI})`);
  }
  if (!Array.isArray(record.presets) || record.presets.length === 0) {
    fail("manifest.presets must be a non-empty array");
  }
  const manifest: EngineManifest = {
    abi,
    module: asSafePath(record.module, "manifest.module"),
    moduleFormat: "esm",
    name: asString(record.name, "manifest.name"),
    author: asString(record.author, "manifest.author"),
    presets: record.presets.map((v, i) => parsePreset(v, `manifest.presets[${i}]`)),
  };
  if (record.moduleFormat !== undefined) {
    const format = asString(record.moduleFormat, "manifest.moduleFormat");
    if (format !== "esm" && format !== "umd") {
      fail(`manifest.moduleFormat is unknown: ${format}`);
    }
    manifest.moduleFormat = format;
  }
  if (manifest.moduleFormat === "umd") {
    // ソースへ埋め込む値なので、識別子として妥当なものだけを受け付ける。
    const exportName = asString(record.exportName, "manifest.exportName");
    if (!EXPORT_NAME_PATTERN.test(exportName)) {
      fail(`manifest.exportName must be an identifier: ${exportName}`);
    }
    manifest.exportName = exportName;
  }
  if (record.assetBaseURL !== undefined) {
    const { text, url } = asHttpsURL(record.assetBaseURL, "manifest.assetBaseURL");
    // 相対パスを解決する基準になるため、末尾が "/" でないと最後の要素が捨てられる
    // ("https://example.com/v1" + "engine.wasm" は "https://example.com/engine.wasm")。
    // 黙って別の場所を指すより、書き間違いとして弾く。
    if (!url.pathname.endsWith("/")) {
      fail(`manifest.assetBaseURL must end with "/": ${text}`);
    }
    // クエリとフラグメントは解決の際に捨てられる。付けても効かないので受け付けない。
    if (url.search || url.hash) {
      fail(`manifest.assetBaseURL must not have a query or fragment: ${text}`);
    }
    manifest.assetBaseURL = text;
  }
  if (record.badge !== undefined) {
    manifest.badge = asLimitedString(record.badge, "manifest.badge", MAX_BADGE_LENGTH);
  }
  if (record.banner !== undefined) {
    const banner = asSafePath(record.banner, "manifest.banner");
    const lower = banner.toLowerCase();
    if (!BANNER_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      fail(`manifest.banner must be one of ${BANNER_EXTENSIONS.join(", ")}: ${banner}`);
    }
    manifest.banner = banner;
  }
  if (record.description !== undefined) {
    manifest.description = asLimitedString(
      record.description,
      "manifest.description",
      MAX_DESCRIPTION_LENGTH,
    );
  }
  if (record.links !== undefined) {
    if (!Array.isArray(record.links)) {
      fail("manifest.links must be an array");
    }
    manifest.links = record.links.map((v, i) => parseLink(v, `manifest.links[${i}]`));
  }
  if (record.requiresCrossOriginIsolation !== undefined) {
    if (typeof record.requiresCrossOriginIsolation !== "boolean") {
      fail("manifest.requiresCrossOriginIsolation must be a boolean");
    }
    manifest.requiresCrossOriginIsolation = record.requiresCrossOriginIsolation;
  }
  if (record.licenses !== undefined) {
    if (!Array.isArray(record.licenses) || record.licenses.length === 0) {
      fail("manifest.licenses must be a non-empty array");
    }
    manifest.licenses = record.licenses.map((v, i) => parseLicense(v, `manifest.licenses[${i}]`));
  }
  if (record.options !== undefined) {
    if (!Array.isArray(record.options)) {
      fail("manifest.options must be an array");
    }
    manifest.options = record.options.map((v, i) => parseOption(v, `manifest.options[${i}]`));
  }
  if (record.dataFiles !== undefined) {
    if (!Array.isArray(record.dataFiles)) {
      fail("manifest.dataFiles must be an array");
    }
    manifest.dataFiles = record.dataFiles.map((v, i) => {
      const path = `manifest.dataFiles[${i}]`;
      const file = asRecord(v, path);
      return {
        url: asSafePath(file.url, `${path}.url`),
        path: asString(file.path, `${path}.path`),
      };
    });
  }

  const ids = new Set<string>();
  for (const preset of manifest.presets) {
    if (ids.has(preset.id)) {
      fail(`duplicated preset id: ${preset.id}`);
    }
    ids.add(preset.id);
  }
  return manifest;
}
