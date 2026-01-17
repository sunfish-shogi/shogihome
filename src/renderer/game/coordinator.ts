import {
  defaultGameSettings,
  LinearGameSettings,
  SingleGameSettings,
} from "@/common/settings/game.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { RecordFormatType } from "tsshogi";
import { StartPositionList } from "./start_position.js";
import { t } from "@/common/i18n/translation_table.js";

export type GameConditions = {
  gameTitle?: string;
  swapPlayers: boolean;
};

export type GameCoordinator = Omit<SingleGameSettings, "startPosition"> & {
  next(recordManager: RecordManager): GameConditions | Error | null;
};

export function emptyGameCoodinator(): GameCoordinator {
  return { ...defaultGameSettings(), next: () => null };
}

export async function buildGameCoordinator(params: {
  settings: LinearGameSettings;
  currentPly: number;
}): Promise<GameCoordinator> {
  const { settings, currentPly } = params;
  const startPositionList = new StartPositionList();
  if (settings.startPosition === "list") {
    await startPositionList.reset({
      filePath: settings.startPositionListFile,
      swapPlayers: settings.swapPlayers,
      order: settings.startPositionListOrder,
      maxGames: settings.repeat,
    });
  }
  let gameCount = 0;
  return {
    ...settings,
    next: (recordManager: RecordManager) => {
      if (gameCount >= settings.repeat) {
        return null;
      }
      gameCount++;
      if (settings.startPosition === "current") {
        if (recordManager.record.current.ply !== currentPly) {
          recordManager.changePly(currentPly);
          recordManager.removeNextMove();
        }
      } else if (settings.startPosition === "list") {
        const error = recordManager.importRecord(startPositionList.next(), {
          type: RecordFormatType.USI,
          markAsSaved: true,
        });
        if (error) {
          return error;
        }
        recordManager.updateComment(t.beginFromThisPosition);
      } else {
        recordManager.resetByInitialPositionType(settings.startPosition);
      }
      const gameTitle =
        settings.repeat >= 2 ? `連続対局 ${gameCount}/${settings.repeat}` : undefined;
      const swapPlayers = settings.swapPlayers && gameCount % 2 === 0;
      return { gameTitle, swapPlayers };
    },
  };
}
