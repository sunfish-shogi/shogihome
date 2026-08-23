// Web 版に組み込まれている WebAssembly エンジンのカタログ。
//
// 実体は public/engines/<dir>/ に置かれたビルド済みの成果物で、エンジン自身が出力した
// engine.json (マニフェスト) から名前やオプション定義を読み取る。
// エンジンを追加する場合は成果物を public/engines/<dir>/ に置き、
// BUILTIN_ENGINE_DIRS に <dir> を追加するだけでよい。
import {
  emptyUSIEngine,
  getPredefinedUSIEngineTag,
  USIEngine,
  USIEngineOption,
  USIEngineOptions,
} from "@/common/settings/usi.js";
import { t } from "@/common/i18n/index.js";
import * as uri from "@/common/uri.js";
import {
  CROSS_ORIGIN_ISOLATION_REQUIRED,
  EngineManifest,
  isSafeRelativePath,
  MANIFEST_FILE_NAME,
  parseEngineManifest,
} from "./manifest.js";

// 読み込む組み込みエンジンのディレクトリ名。
export const BUILTIN_ENGINE_DIRS = ["basic"];

// public/ からエンジンのディレクトリまでの相対パス。USIEngine.path にもこの形で入る。
export const ENGINE_DIR_PREFIX = "engines/";

// USIEngine.path として許可する形式。任意の URL を Worker に読み込ませないための制限。
const ENGINE_PATH_PATTERN = /^engines\/([A-Za-z0-9._-]+)\/$/;

export function isBuiltinEnginePath(path: string): boolean {
  const matched = ENGINE_PATH_PATTERN.exec(path);
  // "." と ".." は使用可能な文字だけで構成されるため別途弾く。
  return !!matched && isSafeRelativePath(matched[1]);
}

export function enginePathOf(dir: string): string {
  return `${ENGINE_DIR_PREFIX}${dir}/`;
}

// エンジンのディレクトリの絶対 URL を返す。
// Vite の base が "./" のため、ドキュメントの URL を基準に解決する。
export function resolveEngineDirURL(path: string): string {
  if (!isBuiltinEnginePath(path)) {
    throw new Error(`invalid engine path: ${path}`);
  }
  return new URL(path, document.baseURI).href;
}

// 表示名を ShogiHome の i18n で上書きする。
// TypeScript 実装の簡易エンジン (Lv. 1) と区別できるように、強さをレベルで名前に含める。
// モバイル表示のボタン (MobileGameMenu.vue) と同じ表記に揃えてある。
// 探索の深さ (Depth) はオプションで変更できるため、名前には含めない。
const DISPLAY_NAME_OVERRIDES: { [presetID: string]: () => string } = {
  "basic-level2-static-rook-v1": () => `ShogiHome Lv. 2 (${t.staticRook})`,
  "basic-level2-ranging-rook-v1": () => `ShogiHome Lv. 2 (${t.rangingRook})`,
  "basic-level3-static-rook-v1": () => `ShogiHome Lv. 3 (${t.staticRook})`,
  "basic-level3-ranging-rook-v1": () => `ShogiHome Lv. 3 (${t.rangingRook})`,
};

export function builtinEngineURI(presetID: string): string {
  return `${uri.ES_USI_ENGINE_PREFIX}builtin/${presetID}`;
}

const manifestCache = new Map<string, Promise<EngineManifest>>();

export async function loadEngineManifest(dir: string): Promise<EngineManifest> {
  const cached = manifestCache.get(dir);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const url = new URL(MANIFEST_FILE_NAME, resolveEngineDirURL(enginePathOf(dir))).href;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`failed to load ${url}: ${response.status}`);
    }
    return parseEngineManifest(await response.json());
  })();
  manifestCache.set(dir, promise);
  promise.catch(() => manifestCache.delete(dir));
  return promise;
}

// USI の予約オプション。エンジンが宣言していない場合に補完する。
// セッション側 (session.ts) の onUSIOk と同じ内容にしている。
const USI_HASH_OPTION_ORDER = 1;
const USI_PONDER_OPTION_ORDER = 2;
const USER_DEFINED_OPTION_ORDER_START = 100;

function buildOptions(manifest: EngineManifest, preset: string): USIEngineOptions {
  const options: USIEngineOptions = {};
  manifest.options?.forEach((src, index) => {
    const option = {
      ...src,
      order: USER_DEFINED_OPTION_ORDER_START + index,
    } as USIEngineOption;
    if (option.type === "combo" && !option.vars) {
      option.vars = [];
    }
    options[option.name] = option;
  });
  if (!options["USI_Hash"]) {
    options["USI_Hash"] = {
      name: "USI_Hash",
      type: "spin",
      order: USI_HASH_OPTION_ORDER,
      default: 32,
    };
  }
  if (!options["USI_Ponder"]) {
    options["USI_Ponder"] = {
      name: "USI_Ponder",
      type: "check",
      order: USI_PONDER_OPTION_ORDER,
      default: "true",
    };
  }
  const values = manifest.presets.find((p) => p.id === preset)?.values || {};
  for (const [name, value] of Object.entries(values)) {
    const option = options[name];
    if (option && option.type !== "button") {
      option.value = value as never;
    }
  }
  return options;
}

export function buildUSIEngines(dir: string, manifest: EngineManifest): USIEngine[] {
  return manifest.presets.map((preset) => ({
    ...emptyUSIEngine(),
    uri: builtinEngineURI(preset.id),
    name: (DISPLAY_NAME_OVERRIDES[preset.id] || (() => preset.displayName))(),
    defaultName: manifest.name,
    author: manifest.author,
    path: enginePathOf(dir),
    options: buildOptions(manifest, preset.id),
    tags: [getPredefinedUSIEngineTag("game")],
  }));
}

// エンジンの成果物は事前キャッシュされないため、初めて使うときはネットワークから
// 取得する (specs/wasm-engine.md の「キャッシュ」を参照)。オフラインでの失敗は
// 起こり得る事象なので、内部エラーをそのまま見せず対処の分かる文言にする。
//
// fetch はネットワークに到達できない場合に TypeError を投げる。
// これは 404 などのサーバー応答とは区別される。
export function isNetworkError(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}

// 読み込み失敗をユーザーに見せる文言へ変換する。
export function describeEngineLoadError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (isNetworkError(error)) {
    return `${t.failedToLoadBuiltinEngine} ${t.builtinEngineRequiresOnline}`;
  }
  // Worker が起動前の確認で断った場合。原因が確定しているものだけを言い換える。
  // 再読み込みすれば Service Worker の制御下に入り、isolated になる。
  // (初回アクセスや、その待ち時間の打ち切りでこの状態になる)
  if (detail.includes(CROSS_ORIGIN_ISOLATION_REQUIRED)) {
    return `${t.failedToLoadBuiltinEngine} ${t.builtinEngineRequiresReload}`;
  }
  // それ以外は原因を特定できないので、内容をそのまま添える。
  // 起動タイムアウトのように、それ自体が対処を示している文言もある。
  return `${t.failedToLoadBuiltinEngine} ${detail}`;
}

// 組み込みエンジンの一覧を返す。web.ts の loadUSIEngines() から使う。
// 読み込みに失敗したエンジンは一覧から除外し、他のエンジンには影響させない。
export async function loadBuiltinUSIEngines(
  onError?: (error: Error) => void,
): Promise<USIEngine[]> {
  const engines: USIEngine[] = [];
  for (const dir of BUILTIN_ENGINE_DIRS) {
    try {
      engines.push(...buildUSIEngines(dir, await loadEngineManifest(dir)));
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
  return engines;
}
