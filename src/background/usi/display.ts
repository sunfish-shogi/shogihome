import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  BANNER_EXTENSIONS,
  getUSIEngineOptionCurrentValue,
  USIEngine,
  USIEngineBanner,
  USIEngineBannerSource,
  USIEngines,
} from "@/common/settings/usi.js";
import { isEngineManifestPath } from "@/common/wasm-engine/package.js";
import { parseEngineManifest } from "@/common/wasm-engine/manifest.js";
import { getAppLogger } from "@/background/log.js";
import { resolveEnginePath } from "@/background/usi/path.js";

// エンジン選択の一覧で表示するための情報。
// バナー画像は file: URL にしてある。
export type EngineDisplayInfo = Pick<USIEngine, "banners" | "description" | "links">;

const DISPLAY_INFO_KEYS = ["banners", "description", "links"] as const;

// 以前のバージョンで保存されていた表示用の項目。読み込み時に取り除く。
const LEGACY_DISPLAY_INFO_KEYS = ["banner"];

// バナー画像を探すディレクトリを決めるエンジンオプション。
const BANNER_DIR_OPTIONS = ["EvalDir", "BookDir"] as const;

// 指定したディレクトリから banner.* を探す。
// 大文字・小文字は区別せず、複数ある場合は BANNER_EXTENSIONS の順で最初のものを返す。
async function findBannerFile(dir: string): Promise<string | undefined> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  for (const ext of BANNER_EXTENSIONS) {
    const name = names.find((name) => name.toLowerCase() === "banner" + ext);
    if (name) {
      return path.join(dir, name);
    }
  }
}

// 画像を差し替えたときにキャッシュされた古い画像が表示されないよう、更新日時をクエリに付ける。
async function toBannerURL(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return;
    }
    return `${pathToFileURL(filePath).href}?v=${Math.floor(stat.mtimeMs)}`;
  } catch {
    return;
  }
}

// WebAssembly エンジンでないエンジンのバナー画像を探す。
// 実行ファイル・EvalDir・BookDir のディレクトリの順に調べ、見つかったものを全て返す。
// エンジンはプロセスの作業ディレクトリを実行ファイルのディレクトリにして起動するため、
// オプションの相対パスは実行ファイルのディレクトリを起点に解決する。
async function getNativeEngineBanners(
  enginePath: string,
  options: USIEngine["options"],
): Promise<USIEngineBanner[]> {
  const engineDir = path.dirname(resolveEnginePath(enginePath));
  const candidates: { dir: string; source: USIEngineBannerSource }[] = [
    { dir: engineDir, source: "engine" },
  ];
  for (const name of BANNER_DIR_OPTIONS) {
    const value = getUSIEngineOptionCurrentValue(options[name]);
    if (typeof value === "string" && value.trim()) {
      candidates.push({ dir: path.resolve(engineDir, value), source: name });
    }
  }
  // 同じディレクトリを指している場合は同じ画像を何度も並べない。
  // 大文字・小文字の違い (Windows) やシンボリックリンクを経由した場合も同じとみなせるよう、
  // 実体のパスで比べる。存在しないディレクトリはここで取り除く。
  const realDirs = await Promise.all(
    candidates.map(({ dir }) => fs.promises.realpath(dir).catch(() => undefined)),
  );
  const dirs: { dir: string; source: USIEngineBannerSource }[] = [];
  candidates.forEach(({ source }, i) => {
    const dir = realDirs[i];
    if (dir && !dirs.some((entry) => entry.dir === dir)) {
      dirs.push({ dir, source });
    }
  });
  const banners = await Promise.all(
    dirs.map(async ({ dir, source }) => {
      const filePath = await findBannerFile(dir);
      const url = filePath && (await toBannerURL(filePath));
      return url ? { url, source } : undefined;
    }),
  );
  return banners.filter((banner) => !!banner);
}

async function getWasmEngineDisplayInfo(enginePath: string): Promise<EngineDisplayInfo> {
  const manifestPath = resolveEnginePath(enginePath);
  try {
    const manifest = parseEngineManifest(
      JSON.parse(await fs.promises.readFile(manifestPath, "utf8")),
    );
    const info: EngineDisplayInfo = {};
    if (manifest.banner) {
      info.banners = [
        {
          url: pathToFileURL(path.join(path.dirname(manifestPath), manifest.banner)).href,
          source: "manifest",
        },
      ];
    }
    if (manifest.description) {
      info.description = manifest.description;
    }
    if (manifest.links) {
      info.links = manifest.links;
    }
    return info;
  } catch (e) {
    getAppLogger().warn("failed to read engine display info: %s: %s", manifestPath, e);
    return {};
  }
}

// エンジン選択の一覧で表示するための情報を返す。
// WebAssembly エンジンはマニフェスト (engine.json) で指定されたものを使い、
// マニフェストを読めない場合は空のオブジェクトを返す。
// それ以外のエンジンはバナー画像をエンジンのディレクトリなどから探す。
// 指定されていない (見つからない) 項目はキーごと含めない。
export async function getEngineDisplayInfo(
  enginePath: string,
  options: USIEngine["options"] = {},
): Promise<EngineDisplayInfo> {
  if (isEngineManifestPath(enginePath)) {
    return getWasmEngineDisplayInfo(enginePath);
  }
  const banners = await getNativeEngineBanners(enginePath, options);
  return banners.length ? { banners } : {};
}

// 保存された値は使わず、全てのエンジンの表示用の情報を設定し直す。
export async function updateEngineDisplayInfo(engines: USIEngines): Promise<void> {
  const list = engines.engineList;
  const infos = await Promise.all(
    list.map((engine) => getEngineDisplayInfo(engine.path, engine.options)),
  );
  list.forEach((engine, i) => {
    const info = infos[i];
    // banners と links は配列なので、内容で比較する。
    if (
      DISPLAY_INFO_KEYS.every((key) => JSON.stringify(info[key]) === JSON.stringify(engine[key])) &&
      LEGACY_DISPLAY_INFO_KEYS.every((key) => !(key in engine))
    ) {
      return;
    }
    const updated: USIEngine = { ...engine };
    for (const key of [...DISPLAY_INFO_KEYS, ...LEGACY_DISPLAY_INFO_KEYS]) {
      delete (updated as { [key: string]: unknown })[key];
    }
    engines.updateEngine({ ...updated, ...info });
  });
}
