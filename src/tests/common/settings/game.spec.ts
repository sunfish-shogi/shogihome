import {
  GameSettings,
  JishogiRule,
  normalizeGameSettings,
  defaultGameSettings,
  validateGameSettings,
} from "@/common/settings/game.js";
import { InitialPositionType } from "tsshogi";
import * as uri from "@/common/uri.js";
import { SearchCommentFormat } from "@/common/settings/comment.js";

function baseGameSettings(): GameSettings {
  return {
    ...defaultGameSettings(),
    black: {
      name: "先手番",
      uri: uri.ES_HUMAN,
    },
    white: {
      name: "後手番",
      uri: uri.ES_HUMAN,
    },
    timeLimit: {
      timeSeconds: 0,
      byoyomi: 10,
      increment: 0,
    },
    repeat: 1,
    parallelism: 1,
    sprtEnabled: false,
  };
}

describe("settings/game", () => {
  it("defaultGameSettings/withAutoSaveDirectory", () => {
    const result = defaultGameSettings({ autoSaveDirectory: "/path/to/autosave" });
    expect(result.enableAutoSave).toBe(true);
    expect(result.autoSaveDirectory).toBe("/path/to/autosave");
    expect(result.startPositionSFEN).toBe("");
  });

  it("defaultGameSettings/withoutAutoSaveDirectory", () => {
    const result = defaultGameSettings();
    expect(result.enableAutoSave).toBe(false);
    expect(result.autoSaveDirectory).toBe("");
    expect(result.startPositionSFEN).toBe("");
  });

  it("defaultGameSettings/withEmptyAutoSaveDirectory", () => {
    const result = defaultGameSettings({ autoSaveDirectory: "" });
    expect(result.enableAutoSave).toBe(false);
    expect(result.autoSaveDirectory).toBe("");
    expect(result.startPositionSFEN).toBe("");
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
      startPositionSFEN: "",
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

  it("validateGameSettings/sfen-empty", () => {
    const settings: GameSettings = {
      ...baseGameSettings(),
      startPosition: "sfen",
      startPositionSFEN: "",
    };
    const result = validateGameSettings(settings);
    expect(result?.message).toBe("SFEN is empty.");
  });

  it("validateGameSettings/sfen-valid-simple", () => {
    const settings: GameSettings = {
      ...baseGameSettings(),
      startPosition: "sfen",
      startPositionSFEN: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    };
    expect(validateGameSettings(settings)).toBeUndefined();
  });

  it("validateGameSettings/sfen-valid-usi-position", () => {
    const settings: GameSettings = {
      ...baseGameSettings(),
      startPosition: "sfen",
      startPositionSFEN:
        "position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    };
    expect(validateGameSettings(settings)).toBeUndefined();
  });

  it("validateGameSettings/sfen-invalid", () => {
    const settings: GameSettings = {
      ...baseGameSettings(),
      startPosition: "sfen",
      startPositionSFEN: "invalid sfen",
    };
    const result = validateGameSettings(settings);
    expect(result).toBeInstanceOf(Error);
    expect(result?.message).toContain("Invalid USI");
  });
});
