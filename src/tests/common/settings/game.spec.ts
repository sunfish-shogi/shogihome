import {
  GameSettings,
  JishogiRule,
  normalizeGameSettings,
  defaultGameSettings,
} from "@/common/settings/game.js";
import { InitialPositionType } from "tsshogi";
import * as uri from "@/common/uri.js";
import { SearchCommentFormat } from "@/common/settings/comment.js";

describe("settings/game", () => {
  it("defaultGameSettings/withAutoSaveDirectory", () => {
    const result = defaultGameSettings({ autoSaveDirectory: "/path/to/autosave" });
    expect(result.enableAutoSave).toBe(true);
    expect(result.autoSaveDirectory).toBe("/path/to/autosave");
  });

  it("defaultGameSettings/withoutAutoSaveDirectory", () => {
    const result = defaultGameSettings();
    expect(result.enableAutoSave).toBe(false);
    expect(result.autoSaveDirectory).toBe("");
  });

  it("defaultGameSettings/withEmptyAutoSaveDirectory", () => {
    const result = defaultGameSettings({ autoSaveDirectory: "" });
    expect(result.enableAutoSave).toBe(false);
    expect(result.autoSaveDirectory).toBe("");
  });

  it("normalize", () => {
    const settings: GameSettings = {
      black: {
        name: "先手番",
        uri: uri.ES_HUMAN,
      },
      white: {
        name: "後手番",
        uri: uri.ES_USI_ENGINE_PREFIX + "test-engine",
        usi: {
          uri: uri.ES_USI_ENGINE_PREFIX + "test-engine",
          name: "Test Engine",
          defaultName: "test engine",
          author: "test author",
          path: "/path/to/test-engine",
          options: {
            USI_Hash: { name: "USI_Hash", type: "spin", order: 1 },
          },
          labels: {},
          enableEarlyPonder: false,
        },
      },
      timeLimit: {
        timeSeconds: 1234,
        byoyomi: 10,
        increment: 0,
      },
      startPosition: InitialPositionType.HANDICAP_2PIECES,
      startPositionListFile: "",
      startPositionListOrder: "sequential",
      enableEngineTimeout: true,
      humanIsFront: false,
      enableComment: false,
      enableAutoSave: false,
      autoSaveDirectory: "/path/to/autosave",
      repeat: 3,
      swapPlayers: false,
      parallelism: 1,
      maxMoves: 80,
      jishogiRule: JishogiRule.NONE,
      searchCommentFormat: SearchCommentFormat.SHOGIHOME,
      sprtEnabled: false,
      sprt: { elo0: 0, elo1: 3, alpha: 0.05, beta: 0.05, maxGames: 10000 },
    };
    const result = normalizeGameSettings(settings, { autoSaveDirectory: "/path/to/autosave/old" });
    expect(result).toStrictEqual(settings);

    const result2 = normalizeGameSettings(
      {
        ...settings,
        startPosition: "current",
        autoSaveDirectory: "",
      },
      { autoSaveDirectory: "/path/to/autosave/old" },
    );
    expect(result2).toStrictEqual({
      ...settings,
      startPosition: "current",
      autoSaveDirectory: "/path/to/autosave/old",
    });
  });
});
