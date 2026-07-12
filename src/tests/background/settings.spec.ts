import path from "node:path";
import fs from "node:fs";
import { getAppPath } from "@/background/proc/path-electron.js";
import {
  CorruptedSettingsFileReport,
  loadAnalysisSettings,
  loadAppSettings,
  loadBatchConversionSettings,
  loadBookImportSettings,
  loadCSAGameSettingsHistory,
  loadGameSettings,
  loadLayoutProfileList,
  loadMateSearchSettings,
  loadResearchSettings,
  loadUSIEngines,
  loadWindowSettings,
  saveAnalysisSettings,
  saveAppSettings,
  saveBatchConversionSettings,
  saveBookImportSettings,
  saveCSAGameSettingsHistory,
  saveGameSettings,
  saveLayoutProfileList,
  saveMateSearchSettings,
  saveResearchSettings,
  saveUSIEngines,
  saveWindowSettings,
  setCorruptedSettingsFileHandler,
} from "@/background/settings.js";
import { defaultWindowSettings } from "@/common/settings/window.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import { defaultBatchConversionSettings } from "@/common/settings/conversion.js";
import { defaultGameSettings } from "@/common/settings/game.js";
import { defaultCSAGameSettingsHistory } from "@/common/settings/csa.js";
import { defaultAnalysisSettings } from "@/common/settings/analysis.js";
import { defaultMateSearchSettings } from "@/common/settings/mate.js";
import { emptyLayoutProfileList } from "@/common/settings/layout.js";
import { defaultBookImportSettings } from "@/common/settings/book.js";
import { USIEngines } from "@/common/settings/usi.js";
import { testUSIEngine } from "@/tests/mock/usi.js";
import { defaultResearchSettings } from "@/common/settings/research.js";

const userDir = getAppPath("userData");

describe("background/settings", () => {
  beforeEach(() => {
    fs.rmSync(userDir, { recursive: true, force: true });
    fs.mkdirSync(userDir, { recursive: true });
  });

  it("default", async () => {
    const windowSettings = loadWindowSettings();
    const usiEngines = await loadUSIEngines();
    const appSettings = await loadAppSettings();
    const batchConversionSettings = await loadBatchConversionSettings();
    const gameSettings = await loadGameSettings();
    const csaGameSettingsHistory = await loadCSAGameSettingsHistory();
    const researchSettings = await loadResearchSettings();
    const analysisSettings = await loadAnalysisSettings();
    const mateSearchSettings = await loadMateSearchSettings();
    const layoutProfileList = await loadLayoutProfileList();
    const bookImportSettings = await loadBookImportSettings();

    expect(windowSettings).toEqual(defaultWindowSettings());
    expect(usiEngines.engineList).toHaveLength(0);
    expect(appSettings).toEqual(
      defaultAppSettings({
        returnCode: process.platform === "win32" ? "\r\n" : "\n",
        autoSaveDirectory: path.join(getAppPath("documents"), "ShogiHome"),
      }),
    );
    expect(batchConversionSettings).toEqual(defaultBatchConversionSettings());
    expect(gameSettings).toEqual(
      defaultGameSettings({
        autoSaveDirectory: path.join(getAppPath("documents"), "ShogiHome"),
      }),
    );
    expect(csaGameSettingsHistory).toEqual(
      defaultCSAGameSettingsHistory({
        autoSaveDirectory: path.join(getAppPath("documents"), "ShogiHome"),
      }),
    );
    expect(researchSettings).toEqual(defaultResearchSettings());
    expect(analysisSettings).toEqual(defaultAnalysisSettings());
    expect(mateSearchSettings).toEqual(defaultMateSearchSettings());
    expect(layoutProfileList).toEqual(emptyLayoutProfileList());
    expect(bookImportSettings).toEqual(defaultBookImportSettings());
  });

  it("saveAndLoad", async () => {
    const windowSettings = defaultWindowSettings();
    windowSettings.width = 777;
    saveWindowSettings(windowSettings);
    const usiEngines = new USIEngines();
    usiEngines.addEngine(testUSIEngine);
    await saveUSIEngines(usiEngines);
    const appSettings = defaultAppSettings();
    appSettings.autoSaveDirectory = "path/to/autoSaveDirectory";
    await saveAppSettings(appSettings);
    const batchConversionSettings = defaultBatchConversionSettings();
    batchConversionSettings.source = "path/to/source";
    await saveBatchConversionSettings(batchConversionSettings);
    const gameSettings = defaultGameSettings();
    gameSettings.black.uri = "test-uri-player";
    await saveGameSettings(gameSettings);
    const csaGameSettingsHistory = defaultCSAGameSettingsHistory();
    csaGameSettingsHistory.player.uri = "test-usi-player";
    await saveCSAGameSettingsHistory(csaGameSettingsHistory);
    const researchSettings = defaultResearchSettings();
    researchSettings.usi = testUSIEngine;
    await saveResearchSettings(researchSettings);
    const analysisSettings = defaultAnalysisSettings();
    analysisSettings.usi = testUSIEngine;
    await saveAnalysisSettings(analysisSettings);
    const mateSearchSettings = defaultMateSearchSettings();
    mateSearchSettings.usi = testUSIEngine;
    await saveMateSearchSettings(mateSearchSettings);
    const layoutProfileList = emptyLayoutProfileList();
    layoutProfileList.profiles.push({
      uri: "test-layout-profile",
      name: "Test Layout Profile",
      components: [],
    });
    await saveLayoutProfileList(layoutProfileList);
    const bookImportSettings = defaultBookImportSettings();
    bookImportSettings.sourceDirectory = "path/to/sourceDirectory";
    await saveBookImportSettings(bookImportSettings);

    expect(loadWindowSettings().width).toBe(777);
    expect((await loadUSIEngines()).engineList).toEqual([testUSIEngine]);
    expect((await loadAppSettings()).autoSaveDirectory).toBe("path/to/autoSaveDirectory");
    expect((await loadBatchConversionSettings()).source).toBe("path/to/source");
    expect((await loadGameSettings()).black.uri).toBe("test-uri-player");
    expect((await loadCSAGameSettingsHistory()).player.uri).toBe("test-usi-player");
    expect((await loadResearchSettings()).usi).toEqual(testUSIEngine);
    expect((await loadAnalysisSettings()).usi).toEqual(testUSIEngine);
    expect((await loadMateSearchSettings()).usi).toEqual(testUSIEngine);
    expect((await loadLayoutProfileList()).profiles[0].uri).toBe("test-layout-profile");
    expect((await loadBookImportSettings()).sourceDirectory).toBe("path/to/sourceDirectory");
  });

  it("corrupted", async () => {
    const reports: CorruptedSettingsFileReport[] = [];
    setCorruptedSettingsFileHandler((report) => {
      reports.push(report);
    });

    const fileNames = [
      "window.json",
      "usi_engine.json",
      "app_setting.json",
      "batch_conversion_setting.json",
      "game_setting.json",
      "csa_game_setting_history.json",
      "research_setting.json",
      "analysis_setting.json",
      "mate_search_setting.json",
      "layouts.json",
      "book_import.json",
    ];
    for (const fileName of fileNames) {
      fs.writeFileSync(path.join(userDir, fileName), "{ broken JSON");
    }

    expect(loadWindowSettings()).toEqual(defaultWindowSettings());
    expect((await loadUSIEngines()).engineList).toHaveLength(0);
    expect(await loadAppSettings()).toEqual(
      defaultAppSettings({
        returnCode: process.platform === "win32" ? "\r\n" : "\n",
        autoSaveDirectory: path.join(getAppPath("documents"), "ShogiHome"),
      }),
    );
    expect(await loadBatchConversionSettings()).toEqual(defaultBatchConversionSettings());
    expect(await loadGameSettings()).toEqual(
      defaultGameSettings({
        autoSaveDirectory: path.join(getAppPath("documents"), "ShogiHome"),
      }),
    );
    expect(await loadCSAGameSettingsHistory()).toEqual(
      defaultCSAGameSettingsHistory({
        autoSaveDirectory: path.join(getAppPath("documents"), "ShogiHome"),
      }),
    );
    expect(await loadResearchSettings()).toEqual(defaultResearchSettings());
    expect(await loadAnalysisSettings()).toEqual(defaultAnalysisSettings());
    expect(await loadMateSearchSettings()).toEqual(defaultMateSearchSettings());
    expect(await loadLayoutProfileList()).toEqual(emptyLayoutProfileList());
    expect(await loadBookImportSettings()).toEqual(defaultBookImportSettings());

    // 破損したファイルはリネームして保管される。
    for (const fileName of fileNames) {
      expect(fs.existsSync(path.join(userDir, fileName))).toBeFalsy();
    }
    expect(reports).toHaveLength(fileNames.length);
    for (const report of reports) {
      expect(path.basename(report.backupPath)).toMatch(/\.corrupted-\d{14}(-\d+)?$/);
      expect(fs.readFileSync(report.backupPath, "utf8")).toBe("{ broken JSON");
    }
    expect(new Set(reports.map((report) => report.filePath)).size).toBe(fileNames.length);
  });
});
