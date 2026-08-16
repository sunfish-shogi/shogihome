// 組み込み WebAssembly エンジンのマニフェスト (engine.json)。
//
// エンジンは自身のリポジトリでビルドし、成果物と一緒にこのファイルを出力する。
// ShogiHome 側はディレクトリ名を登録するだけでよく、オプション定義を写す必要は無い。
// 仕様は specs/wasm-engine-abi.md を参照。
import { USIEngineOptionType } from "@/common/settings/usi.js";
import { EXPORT_NAME_PATTERN } from "./loader.js";

// マニフェストの abi フィールドが取り得る値。非互換な変更を入れる際に更新する。
export const ENGINE_ABI = "shogihome-wasm-engine/1";

export const MANIFEST_FILE_NAME = "engine.json";

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

// 1 つの wasm から複数のエンジンを見せるための定義。
// id はそのまま URI になるため、一度公開したら変更してはならない。
export type EngineManifestPreset = {
  id: string;
  displayName: string;
  values?: { [name: string]: string | number };
};

// 評価パラメータや定跡など、実行時に読み込むファイル。
// url はマニフェストからの相対パスで、Emscripten の仮想ファイルシステム上の path に書き込む。
export type EngineManifestDataFile = {
  url: string;
  path: string;
};

export type EngineManifest = {
  abi: string;
  module: string;
  moduleFormat: EngineModuleFormat;
  // moduleFormat が "umd" のときだけ意味を持つ。
  exportName?: string;
  name: string;
  author: string;
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

function asSafePath(value: unknown, path: string): string {
  const text = asString(value, path);
  if (!isSafeRelativePath(text)) {
    fail(`${path} must be a relative path without "..": ${text}`);
  }
  return text;
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

function parsePreset(value: unknown, path: string): EngineManifestPreset {
  const record = asRecord(value, path);
  const preset: EngineManifestPreset = {
    id: asSafePath(record.id, `${path}.id`),
    displayName: asString(record.displayName, `${path}.displayName`),
  };
  if (record.values !== undefined) {
    const values = asRecord(record.values, `${path}.values`);
    preset.values = {};
    for (const [name, v] of Object.entries(values)) {
      if (typeof v !== "string" && typeof v !== "number") {
        fail(`${path}.values.${name} must be a string or a number`);
      }
      preset.values[name] = v;
    }
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
