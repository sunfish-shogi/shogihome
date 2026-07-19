import fs from "node:fs";
import path from "node:path";
import { USIEngines } from "@/common/settings/usi.js";
import { AppSettings, defaultAppSettings, normalizeAppSettings } from "@/common/settings/app.js";
import {
  defaultWindowSettings,
  normalizeWindowSettings,
  WindowSettings,
} from "@/common/settings/window.js";
import {
  defaultGameSettings,
  GameSettings,
  normalizeGameSettings,
} from "@/common/settings/game.js";
import {
  defaultResearchSettings,
  normalizeResearchSettings,
  ResearchSettings,
} from "@/common/settings/research.js";
import {
  AnalysisSettings,
  defaultAnalysisSettings,
  normalizeAnalysisSettings,
} from "@/common/settings/analysis.js";
import {
  BatchAnalysisSettings,
  defaultBatchAnalysisSettings,
  normalizeBatchAnalysisSettings,
} from "@/common/settings/batch_analysis.js";
import { getAppLogger } from "@/background/log.js";
import {
  CSAGameSettingsHistory as CSAGameSettingsHistory,
  decryptCSAGameSettingsHistory,
  defaultCSAGameSettingsHistory,
  encryptCSAGameSettingsHistory,
  normalizeSecureCSAGameSettingsHistory,
  SecureCSAGameSettingsHistory,
} from "@/common/settings/csa.js";
import { DecryptString, EncryptString, isEncryptionAvailable } from "./helpers/encrypt.js";
import { getPortableExeDir, isPortable } from "./proc/env.js";
import {
  MateSearchSettings as MateSearchSettings,
  defaultMateSearchSettings,
  normalizeMateSearchSettings,
} from "@/common/settings/mate.js";
import {
  BatchConversionSettings,
  defaultBatchConversionSettings,
  normalizeBatchConversionSettings as normalizeBatchConversionSettings,
} from "@/common/settings/conversion.js";
import { exists } from "./helpers/file.js";
import { emptyLayoutProfileList, LayoutProfileList } from "@/common/settings/layout.js";
import { openPath } from "./helpers/electron.js";
import {
  BookImportSettings,
  defaultBookImportSettings,
  normalizeBookImportSettings,
} from "@/common/settings/book.js";
import {
  NextMoveGenerationSettings,
  defaultNextMoveGenerationSettings,
  normalizeNextMoveGenerationSettings,
} from "@/common/settings/nextmove.js";
import { writeFileAtomic, writeFileAtomicSync } from "./file/atomic.js";
import { getAppPath } from "./proc/path-electron.js";
import { getDateTimeString } from "@/common/helpers/datetime.js";

const userDir = getAppPath("userData");
const rootDir = getPortableExeDir() || userDir;
const docDir = path.join(getAppPath("documents"), "ShogiHome");

export function openSettingsDirectory(): Promise<void> {
  return openPath(rootDir);
}

export type CorruptedSettingsFileReport = {
  filePath: string;
  backupPath: string;
};

type CorruptedSettingsFileHandler = (report: CorruptedSettingsFileReport) => void;

const corruptedSettingsFileReports: CorruptedSettingsFileReport[] = [];
let corruptedSettingsFileHandler: CorruptedSettingsFileHandler | undefined;

// エラー表示の準備ができる前に検出された分はハンドラー登録時にまとめて通知する。
export function setCorruptedSettingsFileHandler(handler: CorruptedSettingsFileHandler): void {
  corruptedSettingsFileHandler = handler;
  for (const report of corruptedSettingsFileReports.splice(0)) {
    handler(report);
  }
}

function buildCorruptedFileBackupPath(filePath: string): string {
  const timestamp = getDateTimeString().replace(/\D/g, "");
  let backupPath = `${filePath}.corrupted-${timestamp}`;
  for (let number = 2; fs.existsSync(backupPath); number++) {
    backupPath = `${filePath}.corrupted-${timestamp}-${number}`;
  }
  return backupPath;
}

function backupCorruptedSettingsFile(filePath: string, cause: unknown): void {
  const backupPath = buildCorruptedFileBackupPath(filePath);
  fs.renameSync(filePath, backupPath);
  getAppLogger().error(
    "corrupted settings file was moved: %s -> %s: %s",
    filePath,
    backupPath,
    cause,
  );
  const report = { filePath, backupPath };
  if (corruptedSettingsFileHandler) {
    corruptedSettingsFileHandler(report);
  } else {
    corruptedSettingsFileReports.push(report);
  }
}

// JSON としてパースできない場合はファイルをリネームして退避し、 undefined を返す。
function parseSettingsJSON<T>(filePath: string, text: string): T | undefined {
  try {
    return JSON.parse(text);
  } catch (e) {
    backupCorruptedSettingsFile(filePath, e);
    return undefined;
  }
}

function readSettingsJSONSync<T>(filePath: string): T | undefined {
  return parseSettingsJSON(filePath, fs.readFileSync(filePath, "utf8"));
}

async function readSettingsJSON<T>(filePath: string): Promise<T | undefined> {
  return parseSettingsJSON(filePath, await fs.promises.readFile(filePath, "utf8"));
}

export async function openAutoSaveDirectory(): Promise<void> {
  const gameSettings = await loadGameSettings();
  await openPath(gameSettings.autoSaveDirectory || docDir);
}

export async function openAutoSaveDirectoryForCSA(): Promise<void> {
  const csaGameSettings = await loadCSAGameSettingsHistory();
  await openPath(csaGameSettings.autoSaveDirectory || docDir);
}

const windowSettingsPath = path.join(userDir, "window.json");

export function saveWindowSettings(settings: WindowSettings): void {
  try {
    writeFileAtomicSync(
      windowSettingsPath,
      JSON.stringify(normalizeWindowSettings(settings), undefined, 2),
      "utf8",
    );
  } catch (e) {
    getAppLogger().error("failed to write window settings: %s", e);
  }
}

export function loadWindowSettings(): WindowSettings {
  try {
    const data = readSettingsJSONSync<WindowSettings>(windowSettingsPath);
    return data !== undefined ? normalizeWindowSettings(data) : defaultWindowSettings();
  } catch (e) {
    getAppLogger().error("failed to read window settings: %s", e);
    return defaultWindowSettings();
  }
}

const usiEnginesPath = path.join(rootDir, "usi_engine.json");

export async function saveUSIEngines(usiEngines: USIEngines): Promise<void> {
  await writeFileAtomic(usiEnginesPath, usiEngines.jsonWithIndent, "utf8");
}

export async function loadUSIEngines(): Promise<USIEngines> {
  if (!(await exists(usiEnginesPath))) {
    return new USIEngines();
  }
  const text = await fs.promises.readFile(usiEnginesPath, "utf8");
  if (parseSettingsJSON(usiEnginesPath, text) === undefined) {
    return new USIEngines();
  }
  return new USIEngines(text);
}

const appSettingsPath = path.join(userDir, "app_setting.json");

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await writeFileAtomic(appSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

const defaultReturnCode = process.platform === "win32" ? "\r\n" : "\n";

function getDefaultAppSettings(): AppSettings {
  return defaultAppSettings({
    returnCode: defaultReturnCode,
    autoSaveDirectory: docDir, // Deprecated
  });
}

function normalizeAppSettingsWithDefaults(settings: AppSettings): AppSettings {
  return normalizeAppSettings(settings, {
    returnCode: defaultReturnCode,
    autoSaveDirectory: docDir, // Deprecated
  });
}

function loadAppSettingsSync(): AppSettings {
  if (!fs.existsSync(appSettingsPath)) {
    return getDefaultAppSettings();
  }
  const data = readSettingsJSONSync<AppSettings>(appSettingsPath);
  return data !== undefined ? normalizeAppSettingsWithDefaults(data) : getDefaultAppSettings();
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
  const data = await readSettingsJSON<AppSettings>(appSettingsPath);
  return data !== undefined ? normalizeAppSettingsWithDefaults(data) : getDefaultAppSettings();
}

const batchConversionSettingsPath = path.join(rootDir, "batch_conversion_setting.json");

export async function saveBatchConversionSettings(
  settings: BatchConversionSettings,
): Promise<void> {
  await writeFileAtomic(
    batchConversionSettingsPath,
    JSON.stringify(settings, undefined, 2),
    "utf8",
  );
}

export async function loadBatchConversionSettings(): Promise<BatchConversionSettings> {
  if (!(await exists(batchConversionSettingsPath))) {
    return defaultBatchConversionSettings();
  }
  const data = await readSettingsJSON<BatchConversionSettings>(batchConversionSettingsPath);
  return data !== undefined
    ? normalizeBatchConversionSettings(data)
    : defaultBatchConversionSettings();
}

const gameSettingsPath = path.join(rootDir, "game_setting.json");

export async function saveGameSettings(settings: GameSettings): Promise<void> {
  await writeFileAtomic(gameSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadGameSettings(): Promise<GameSettings> {
  const opts = {
    // v1.26.0 で autoSaveDirectory がアプリ設定から移動したので値を引き継ぐ。
    autoSaveDirectory: isPortable() ? undefined : loadAppSettingsOnce().autoSaveDirectory || docDir,
  };
  if (!(await exists(gameSettingsPath))) {
    return defaultGameSettings(opts);
  }
  const data = await readSettingsJSON<GameSettings>(gameSettingsPath);
  return data !== undefined ? normalizeGameSettings(data, opts) : defaultGameSettings(opts);
}

const csaGameSettingsHistoryPath = path.join(rootDir, "csa_game_setting_history.json");

export async function saveCSAGameSettingsHistory(settings: CSAGameSettingsHistory): Promise<void> {
  const encrypted = encryptCSAGameSettingsHistory(
    settings,
    isEncryptionAvailable() ? EncryptString : undefined,
  );
  await writeFileAtomic(
    csaGameSettingsHistoryPath,
    JSON.stringify(encrypted, undefined, 2),
    "utf8",
  );
}

export async function loadCSAGameSettingsHistory(): Promise<CSAGameSettingsHistory> {
  const opts = {
    // v1.26.0 で autoSaveDirectory がアプリ設定から移動したので値を引き継ぐ。
    autoSaveDirectory: isPortable() ? undefined : loadAppSettingsOnce().autoSaveDirectory || docDir,
  };
  if (!(await exists(csaGameSettingsHistoryPath))) {
    return defaultCSAGameSettingsHistory(opts);
  }
  const encrypted = await readSettingsJSON<SecureCSAGameSettingsHistory>(
    csaGameSettingsHistoryPath,
  );
  if (encrypted === undefined) {
    return defaultCSAGameSettingsHistory(opts);
  }
  return decryptCSAGameSettingsHistory(
    normalizeSecureCSAGameSettingsHistory(encrypted, opts),
    isEncryptionAvailable() ? DecryptString : undefined,
  );
}

const researchSettingsPath = path.join(rootDir, "research_setting.json");

export async function saveResearchSettings(settings: ResearchSettings): Promise<void> {
  await writeFileAtomic(researchSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadResearchSettings(): Promise<ResearchSettings> {
  if (!(await exists(researchSettingsPath))) {
    return defaultResearchSettings();
  }
  const data = await readSettingsJSON<ResearchSettings>(researchSettingsPath);
  return data !== undefined ? normalizeResearchSettings(data) : defaultResearchSettings();
}

const analysisSettingsPath = path.join(rootDir, "analysis_setting.json");

export async function saveAnalysisSettings(settings: AnalysisSettings): Promise<void> {
  await writeFileAtomic(analysisSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadAnalysisSettings(): Promise<AnalysisSettings> {
  if (!(await exists(analysisSettingsPath))) {
    return defaultAnalysisSettings();
  }
  const data = await readSettingsJSON<AnalysisSettings>(analysisSettingsPath);
  return data !== undefined ? normalizeAnalysisSettings(data) : defaultAnalysisSettings();
}

const batchAnalysisSettingsPath = path.join(rootDir, "batch_analysis_setting.json");

export async function saveBatchAnalysisSettings(settings: BatchAnalysisSettings): Promise<void> {
  await writeFileAtomic(batchAnalysisSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadBatchAnalysisSettings(): Promise<BatchAnalysisSettings> {
  if (!(await exists(batchAnalysisSettingsPath))) {
    return defaultBatchAnalysisSettings();
  }
  const data = await readSettingsJSON<BatchAnalysisSettings>(batchAnalysisSettingsPath);
  return data !== undefined ? normalizeBatchAnalysisSettings(data) : defaultBatchAnalysisSettings();
}

const mateSearchSettingsPath = path.join(rootDir, "mate_search_setting.json");

export async function saveMateSearchSettings(settings: MateSearchSettings): Promise<void> {
  await writeFileAtomic(mateSearchSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadMateSearchSettings(): Promise<MateSearchSettings> {
  if (!(await exists(mateSearchSettingsPath))) {
    return defaultMateSearchSettings();
  }
  const data = await readSettingsJSON<MateSearchSettings>(mateSearchSettingsPath);
  return data !== undefined ? normalizeMateSearchSettings(data) : defaultMateSearchSettings();
}

const layoutProfileListPath = path.join(userDir, "layouts.json");

export async function saveLayoutProfileList(profileList: LayoutProfileList): Promise<void> {
  await writeFileAtomic(layoutProfileListPath, JSON.stringify(profileList, undefined, 2), "utf8");
}

export async function loadLayoutProfileList(): Promise<LayoutProfileList> {
  if (!(await exists(layoutProfileListPath))) {
    return emptyLayoutProfileList();
  }
  const data = await readSettingsJSON<LayoutProfileList>(layoutProfileListPath);
  return data !== undefined ? data : emptyLayoutProfileList();
}

export function loadLayoutProfileListSync(): LayoutProfileList {
  if (!fs.existsSync(layoutProfileListPath)) {
    return emptyLayoutProfileList();
  }
  const data = readSettingsJSONSync<LayoutProfileList>(layoutProfileListPath);
  return data !== undefined ? data : emptyLayoutProfileList();
}

const nextMoveGenerationSettingsPath = path.join(rootDir, "next_move_generation.json");

export async function saveNextMoveGenerationSettings(
  settings: NextMoveGenerationSettings,
): Promise<void> {
  await writeFileAtomic(
    nextMoveGenerationSettingsPath,
    JSON.stringify(settings, undefined, 2),
    "utf8",
  );
}

export async function loadNextMoveGenerationSettings(): Promise<NextMoveGenerationSettings> {
  if (!(await exists(nextMoveGenerationSettingsPath))) {
    return defaultNextMoveGenerationSettings();
  }
  const data = await readSettingsJSON<NextMoveGenerationSettings>(nextMoveGenerationSettingsPath);
  return data !== undefined
    ? normalizeNextMoveGenerationSettings(data)
    : defaultNextMoveGenerationSettings();
}

const bookImportSettingsPath = path.join(rootDir, "book_import.json");

export async function saveBookImportSettings(settings: BookImportSettings): Promise<void> {
  await writeFileAtomic(bookImportSettingsPath, JSON.stringify(settings, undefined, 2), "utf8");
}

export async function loadBookImportSettings(): Promise<BookImportSettings> {
  if (!(await exists(bookImportSettingsPath))) {
    return defaultBookImportSettings();
  }
  const data = await readSettingsJSON<BookImportSettings>(bookImportSettingsPath);
  return data !== undefined ? normalizeBookImportSettings(data) : defaultBookImportSettings();
}
