// Web 版に組み込まれている WebAssembly エンジンのカタログ。
//
// エンジンを追加する場合は public/engines/<name>/ にビルド済みの成果物を置き、
// BUILTIN_ENGINES にエントリを追加する。
import {
  emptyUSIEngine,
  getPredefinedUSIEngineTag,
  USIEngine,
  USIEngineOptions,
} from "@/common/settings/usi.js";
import * as uri from "@/common/uri.js";

export type BuiltinEngineSpec = {
  // USIEngine.path に格納する識別子。実体のファイルパスではない。
  path: string;
  // 保存済みの対局設定と対応付けるため、時刻ベースではなく固定値を用いる。
  uri: string;
  // public/ からの相対パス。
  moduleFile: string;
  // エンジンが id name で返す名前。
  defaultName: string;
  author: string;
  // 一覧に表示する名前を返す。i18n を参照するため関数にしている。
  displayName: () => string;
  // 起動後に setoption で設定する値。
  optionValues: { [name: string]: string | number };
};

const BASIC_ENGINE_MODULE_FILE = "engines/basic/basic.js";
const BASIC_ENGINE_AUTHOR = "Kubo, Ryosuke";
const BASIC_ENGINE_DEFAULT_NAME = "ShogiHome Basic Engine";

export const BUILTIN_BASIC_STATIC_ROOK_URI = `${uri.ES_USI_ENGINE_PREFIX}builtin/basic-static-rook-v1`;
export const BUILTIN_BASIC_RANGING_ROOK_URI = `${uri.ES_USI_ENGINE_PREFIX}builtin/basic-ranging-rook-v1`;
export const BUILTIN_BASIC_RANDOM_URI = `${uri.ES_USI_ENGINE_PREFIX}builtin/basic-random`;

export const BUILTIN_ENGINES: BuiltinEngineSpec[] = [
  {
    path: "wasm:basic/v1?style=static_rook",
    uri: BUILTIN_BASIC_STATIC_ROOK_URI,
    moduleFile: BASIC_ENGINE_MODULE_FILE,
    defaultName: BASIC_ENGINE_DEFAULT_NAME,
    author: BASIC_ENGINE_AUTHOR,
    displayName: () => uri.basicEngineName(uri.ES_BASIC_ENGINE_STATIC_ROOK_V1),
    optionValues: { Style: "static_rook" },
  },
  {
    path: "wasm:basic/v1?style=ranging_rook",
    uri: BUILTIN_BASIC_RANGING_ROOK_URI,
    moduleFile: BASIC_ENGINE_MODULE_FILE,
    defaultName: BASIC_ENGINE_DEFAULT_NAME,
    author: BASIC_ENGINE_AUTHOR,
    displayName: () => uri.basicEngineName(uri.ES_BASIC_ENGINE_RANGING_ROOK_V1),
    optionValues: { Style: "ranging_rook" },
  },
  {
    path: "wasm:basic/v1?style=random",
    uri: BUILTIN_BASIC_RANDOM_URI,
    moduleFile: BASIC_ENGINE_MODULE_FILE,
    defaultName: BASIC_ENGINE_DEFAULT_NAME,
    author: BASIC_ENGINE_AUTHOR,
    displayName: () => uri.basicEngineName(uri.ES_BASIC_ENGINE_RANDOM),
    optionValues: { Style: "random" },
  },
];

export function findBuiltinEngine(path: string): BuiltinEngineSpec | undefined {
  return BUILTIN_ENGINES.find((engine) => engine.path === path);
}

// public/ に置いた成果物の絶対 URL を返す。
// Vite の base が "./" のため、ドキュメントの URL を基準に解決する。
export function resolveModuleURL(spec: BuiltinEngineSpec): string {
  return new URL(spec.moduleFile, document.baseURI).href;
}

// エンジンが usi コマンドで返すオプション定義。
// 実体は engines/basic/engine.cpp の optionDefinitions() にあり、ここはその写し。
// オプションダイアログの再取得ボタンを押すと、エンジンから取得した内容で更新される。
function basicEngineOptions(): USIEngineOptions {
  return {
    USI_Hash: { name: "USI_Hash", type: "spin", order: 1, default: 32 },
    Style: {
      name: "Style",
      type: "combo",
      order: 100,
      default: "static_rook",
      vars: ["static_rook", "ranging_rook", "random"],
    },
    MinimumThinkingTime: {
      name: "MinimumThinkingTime",
      type: "spin",
      order: 101,
      default: 500,
      min: 0,
      max: 60000,
    },
    USI_Ponder: { name: "USI_Ponder", type: "check", order: 102, default: "false" },
  };
}

function buildUSIEngine(spec: BuiltinEngineSpec): USIEngine {
  const options = basicEngineOptions();
  for (const [name, value] of Object.entries(spec.optionValues)) {
    const option = options[name];
    if (option && option.type !== "button") {
      option.value = value as never;
    }
  }
  return {
    ...emptyUSIEngine(),
    uri: spec.uri,
    name: spec.displayName(),
    defaultName: spec.defaultName,
    author: spec.author,
    path: spec.path,
    options,
    tags: [getPredefinedUSIEngineTag("game")],
  };
}

// 組み込みエンジンの一覧を返す。web.ts の loadUSIEngines() から使う。
export function defaultBuiltinUSIEngines(): USIEngine[] {
  return BUILTIN_ENGINES.map(buildUSIEngine);
}
