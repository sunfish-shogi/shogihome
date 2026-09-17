import fs from "node:fs";
import path from "node:path";
import { Plugin } from "vite";

// 特別版のビルドを設定する「ビルドプロファイル」。
//
// 別のリポジトリのビルドスクリプトから、ShogiHome のソースを編集せずに
// 「エンジンを足した版」「機能を有効にした版」を作るための仕組み。
// JSON ファイルのパスを環境変数 SHOGIHOME_BUILD_PROFILE で渡す。
//
//   SHOGIHOME_BUILD_PROFILE=../shogihome-plus.json npm run build
//
// 指定が無ければ既定のプロファイルを使う。**通常のビルドの挙動は変わらない。**
// 書式と使い方は specs/build-profile.md を参照。
//
// 設定の内容は renderer から仮想モジュールとして参照する。プロファイルの読み込みと
// 検証はビルド時のここで完結させ、実行時には検証済みの値だけを渡す。
//
// 開発サーバーの起動中にプロファイルを書き換えた場合は、サーバーを再起動すること。
export const BUILD_PROFILE_MODULE_ID = "virtual:shogihome/build-profile";

// プロファイルの場所を渡す環境変数。
export const BUILD_PROFILE_ENV_NAME = "SHOGIHOME_BUILD_PROFILE";

// Vite の規約に従い、解決後の ID には \0 を付けて他のプラグインに触らせない。
const RESOLVED_MODULE_ID = `\0${BUILD_PROFILE_MODULE_ID}`;

// 配布物のライセンス表示に足すリンク。
export type BuildProfileDistribution = {
  // 表示名。例: "ShogiHome+Example (GPLv3)"
  text: string;
  // ライセンス全文の URL。
  url: string;
  // ソースコードの入手先。コピーレフトのライセンスでは必須。
  sourceURL?: string;
};

export type BuildProfile = {
  features: {
    // モバイルウェブの UI に「思考」タブを出す。
    mobileSearchTab: boolean;
  };
  license: {
    // 配布物 (結合物) 自身のライセンス。
    // GPL のエンジンを組み込んだ版では、結合物全体がそのライセンスに従うため必要になる。
    distribution?: BuildProfileDistribution;
    // npm の依存のライセンス一覧の URL。配布物ごとに用意する場合に指定する。
    thirdPartyURL?: string;
  };
};

export function defaultBuildProfile(): BuildProfile {
  return {
    features: {
      mobileSearchTab: false,
    },
    license: {},
  };
}

function fail(message: string): never {
  throw new Error(`invalid build profile: ${message}`);
}

// 知らないキーは書き間違いとして扱い、黙って無視しない。
// 設定したつもりの項目が効かないまま配布物ができるのを防ぐため。
function asRecord(value: unknown, path: string, knownKeys: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!knownKeys.includes(key)) {
      fail(`${path}.${key} is not a known setting (known: ${knownKeys.join(", ")})`);
    }
  }
  return record;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }
  return value;
}

// そのままリンクとして開く値なので、URL として成立していることまで確かめる
// (エンジンのマニフェストの source と同じ扱い)。
function asHttpsURL(value: unknown, path: string): string {
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
  return text;
}

export function parseBuildProfile(json: unknown): BuildProfile {
  const record = asRecord(json, "profile", ["features", "license"]);
  const profile = defaultBuildProfile();
  if (record.features !== undefined) {
    const features = asRecord(record.features, "profile.features", ["mobileSearchTab"]);
    if (features.mobileSearchTab !== undefined) {
      profile.features.mobileSearchTab = asBoolean(
        features.mobileSearchTab,
        "profile.features.mobileSearchTab",
      );
    }
  }
  if (record.license !== undefined) {
    const license = asRecord(record.license, "profile.license", ["distribution", "thirdPartyURL"]);
    if (license.distribution !== undefined) {
      const key = "profile.license.distribution";
      const distribution = asRecord(license.distribution, key, ["text", "url", "sourceURL"]);
      profile.license.distribution = {
        text: asString(distribution.text, `${key}.text`),
        url: asHttpsURL(distribution.url, `${key}.url`),
      };
      if (distribution.sourceURL !== undefined) {
        profile.license.distribution.sourceURL = asHttpsURL(
          distribution.sourceURL,
          `${key}.sourceURL`,
        );
      }
    }
    if (license.thirdPartyURL !== undefined) {
      profile.license.thirdPartyURL = asHttpsURL(
        license.thirdPartyURL,
        "profile.license.thirdPartyURL",
      );
    }
  }
  return profile;
}

export function loadBuildProfile(file?: string): BuildProfile {
  if (!file) {
    return defaultBuildProfile();
  }
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`build profile not found: ${fullPath}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (e) {
    throw new Error(`failed to parse build profile: ${fullPath}: ${e}`);
  }
  return parseBuildProfile(json);
}

export function buildProfile(): Plugin {
  const file = process.env[BUILD_PROFILE_ENV_NAME];
  return {
    name: "shogihome-build-profile",
    configResolved(config) {
      // どのプロファイルでビルドしたのかを追えるようにする。
      // 既定のままのときは何も言わない (通常のビルドの出力を変えないため)。
      if (file) {
        config.logger.info(`build profile: ${path.resolve(file)}`);
      }
    },
    resolveId(id: string) {
      return id === BUILD_PROFILE_MODULE_ID ? RESOLVED_MODULE_ID : undefined;
    },
    load(id: string) {
      if (id !== RESOLVED_MODULE_ID) {
        return undefined;
      }
      return `export const buildProfile = ${JSON.stringify(loadBuildProfile(file))};\n`;
    },
  };
}
