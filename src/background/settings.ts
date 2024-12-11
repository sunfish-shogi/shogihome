import fs from "node:fs";
import path from "node:path";
import { USIEngines } from "@/common/settings/usi";
import { AppSettings, defaultAppSettings, normalizeAppSettings } from "@/common/settings/app";
import {
  defaultWindowSettings,
  normalizeWindowSettings,
  WindowSettings,
} from "@/common/settings/window";
import { defaultGameSettings, GameSettings, normalizeGameSettings } from "@/common/settings/game";
import {
  defaultResearchSettings,
  normalizeResearchSettings,
  ResearchSettings,
} from "@/common/settings/research";
import {
  AnalysisSettings,
  defaultAnalysisSettings,
  normalizeAnalysisSettings,
} from "@/common/settings/analysis";
import { getAppLogger } from "@/background/log";
import {
  CSAGameSettingsHistory as CSAGameSettingsHistory,
  decryptCSAGameSettingsHistory,
  defaultCSAGameSettingsHistory,
  encryptCSAGameSettingsHistory,
  normalizeSecureCSAGameSettingsHistory,
} from "@/common/settings/csa";
import { DecryptString, EncryptString, isEncryptionAvailable } from "./helpers/encrypt";
import { getAppPath, getPortableExeDir } from "./proc/env";
import {
  MateSearchSettings as MateSearchSettings,
  defaultMateSearchSettings,
  normalizeMateSearchSettings,
} from "@/common/settings/mate";
import {
  BatchConversionSettings,
  defaultBatchConversionSettings,
  normalizeBatchConversionSettings as normalizeBatchConversionSettings,
} from "@/common/settings/conversion";
import { exists } from "./helpers/file";
import { emptyLayoutProfileList, LayoutProfileList } from "@/common/settings/layout";
import { openPath } from "./helpers/electron";
import { BookImportSettings, defaultBookImportSettings } from "@/common/settings/book";

const userDir = getAppPath("userData");
const rootDir = getPortableExeDir() || userDir;
const docDir = path.join(getAppPath("documents"), "ShogiHome");

export function openSettingsDirectory(): Promise<void> {
  return openPath(rootDir);
}

export async function openAutoSaveDirectory(): Promise<void> {
  const appSettings = await loadAppSettings();
  await openPath(appSettings.autoSaveDirectory || docDir);
}

const windowSettingsPath = path.join(userDir, "window.json");

export function saveWindowSettings(settings: WindowSettings): void {
  try {
    fs.writeFileSync(windowSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
  } catch (e) {
    getAppLogger().error("failed to write window settings: %s", e);
  }
}

export function loadWindowSettings(): WindowSettings {
  try {
    return normalizeWindowSettings(JSON.parse(fs.readFileSync(windowSettingsPath, "utf8")));
  } catch (e) {
    getAppLogger().error("failed to read window settings: %s", e);
    return defaultWindowSettings();
  }
}

const usiEnginesPath = path.join(rootDir, "usi_engine.json");

export async function saveUSIEngines(usiEngines: USIEngines): Promise<void> {
  await fs.promises.writeFile(usiEnginesPath, usiEngines.jsonWithIndent, "utf8");
}

export async function loadUSIEngines(): Promise<USIEngines> {
  if (!(await exists(usiEnginesPath))) {
    return new USIEngines();
  }
  return new USIEngines(await fs.promises.readFile(usiEnginesPath, "utf8"));
}

const appSettingsPath = path.join(userDir, "app_setting.json");

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await fs.promises.writeFile(appSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

const defaultReturnCode = process.platform === "win32" ? "\r\n" : "\n";

function getDefaultAppSettings(): AppSettings {
  return defaultAppSettings({
    returnCode: defaultReturnCode,
    autoSaveDirectory: docDir,
  });
}

function loadAppSettingsFromMemory(json: string): AppSettings {
  return normalizeAppSettings(JSON.parse(json), {
    returnCode: defaultReturnCode,
    autoSaveDirectory: docDir,
  });
}

function loadAppSettingsSync(): AppSettings {
  if (!fs.existsSync(appSettingsPath)) {
    return getDefaultAppSettings();
  }
  return loadAppSettingsFromMemory(fs.readFileSync(appSettingsPath, "utf8"));
}

let appSettingsCache: AppSettings;

export function loadAppSettingsOnce(): AppSettings {
  if (!appSettingsCache) {
    appSettingsCache = loadAppSettingsSync();
  }
  return appSettingsCache;
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (!(await exists(appSettingsPath))) {
    return getDefaultAppSettings();
  }
  return loadAppSettingsFromMemory(await fs.promises.readFile(appSettingsPath, "utf8"));
}

const batchConversionSettingsPath = path.join(rootDir, "batch_conversion_setting.json");

export async function saveBatchConversionSettings(
  settings: BatchConversionSettings,
): Promise<void> {
  await fs.promises.writeFile(
    batchConversionSettingsPath,
    JSON.stringify(settings, undefined, 2),
    "utf8",
  );
}

export async function loadBatchConversionSettings(): Promise<BatchConversionSettings> {
  if (!(await exists(batchConversionSettingsPath))) {
    return defaultBatchConversionSettings();
  }
  return normalizeBatchConversionSettings(
    JSON.parse(await fs.promises.readFile(batchConversionSettingsPath, "utf8")),
  );
}

const gameSettingsPath = path.join(rootDir, "game_setting.json");

export async function saveGameSettings(settings: GameSettings): Promise<void> {
  await fs.promises.writeFile(gameSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadGameSettings(): Promise<GameSettings> {
  if (!(await exists(gameSettingsPath))) {
    return defaultGameSettings();
  }
  return normalizeGameSettings(JSON.parse(await fs.promises.readFile(gameSettingsPath, "utf8")));
}

const csaGameSettingsHistoryPath = path.join(rootDir, "csa_game_setting_history.json");

export async function saveCSAGameSettingsHistory(settings: CSAGameSettingsHistory): Promise<void> {
  const encrypted = encryptCSAGameSettingsHistory(
    settings,
    isEncryptionAvailable() ? EncryptString : undefined,
  );
  await fs.promises.writeFile(
    csaGameSettingsHistoryPath,
    JSON.stringify(encrypted, undefined, 2),
    "utf8",
  );
}

export async function loadCSAGameSettingsHistory(): Promise<CSAGameSettingsHistory> {
  if (!(await exists(csaGameSettingsHistoryPath))) {
    return defaultCSAGameSettingsHistory();
  }
  const encrypted = JSON.parse(await fs.promises.readFile(csaGameSettingsHistoryPath, "utf8"));
  return decryptCSAGameSettingsHistory(
    normalizeSecureCSAGameSettingsHistory(encrypted),
    isEncryptionAvailable() ? DecryptString : undefined,
  );
}

const researchSettingsPath = path.join(rootDir, "research_setting.json");

export async function saveResearchSettings(settings: ResearchSettings): Promise<void> {
  await fs.promises.writeFile(researchSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadResearchSettings(): Promise<ResearchSettings> {
  if (!(await exists(researchSettingsPath))) {
    return defaultResearchSettings();
  }
  return normalizeResearchSettings(
    JSON.parse(await fs.promises.readFile(researchSettingsPath, "utf8")),
  );
}

const analysisSettingsPath = path.join(rootDir, "analysis_setting.json");

export async function saveAnalysisSettings(settings: AnalysisSettings): Promise<void> {
  await fs.promises.writeFile(analysisSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadAnalysisSettings(): Promise<AnalysisSettings> {
  if (!(await exists(analysisSettingsPath))) {
    return defaultAnalysisSettings();
  }
  return normalizeAnalysisSettings(
    JSON.parse(await fs.promises.readFile(analysisSettingsPath, "utf8")),
  );
}

const mateSearchSettingsPath = path.join(rootDir, "mate_search_setting.json");

export async function saveMateSearchSettings(settings: MateSearchSettings): Promise<void> {
  await fs.promises.writeFile(
    mateSearchSettingsPath,
    JSON.stringify(settings, undefined, 2),
    "utf8",
  );
}

export async function loadMateSearchSettings(): Promise<MateSearchSettings> {
  if (!(await exists(mateSearchSettingsPath))) {
    return defaultMateSearchSettings();
  }
  return normalizeMateSearchSettings(
    JSON.parse(await fs.promises.readFile(mateSearchSettingsPath, "utf8")),
  );
}

const layoutProfileListPath = path.join(userDir, "layouts.json");

export async function saveLayoutProfileList(profileList: LayoutProfileList): Promise<void> {
  await fs.promises.writeFile(
    layoutProfileListPath,
    JSON.stringify(profileList, undefined, 2),
    "utf8",
  );
}

export async function loadLayoutProfileList(): Promise<LayoutProfileList> {
  if (!(await exists(layoutProfileListPath))) {
    return emptyLayoutProfileList();
  }
  return JSON.parse(await fs.promises.readFile(layoutProfileListPath, "utf8"));
}

const bookImportSettingsPath = path.join(rootDir, "book_import.json");

export async function saveBookImportSettings(settings: BookImportSettings): Promise<void> {
  await fs.promises.writeFile(
    bookImportSettingsPath,
    JSON.stringify(settings, undefined, 2),
    "utf8",
  );
}

export async function loadBookImportSettings(): Promise<BookImportSettings> {
  if (!(await exists(bookImportSettingsPath))) {
    return defaultBookImportSettings();
  }
  return JSON.parse(await fs.promises.readFile(bookImportSettingsPath, "utf8"));
}
