import {
  defaultGameSettings,
  LinearGameSettings,
  SingleGameSettings,
} from "@/common/settings/game.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { detectRecordFormat, Record, RecordFormatType } from "tsshogi";
import { StartPositionList } from "./start_position.js";
import { t } from "@/common/i18n/translation_table.js";

export type GameConditions = {
  gameTitle?: string;
  swapPlayers: boolean;
  gameIndex: number;
  pairIndex: number;
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
  const maxGames = settings.sprtEnabled ? settings.sprt.maxGames : settings.repeat;
  const startPositionList = new StartPositionList();
  let startPositionUSI = "";
  if (settings.startPosition === "list") {
    await startPositionList.reset({
      filePath: settings.startPositionListFile,
      swapPlayers: settings.swapPlayers,
      order: settings.startPositionListOrder,
      maxGames: maxGames,
    });
  } else if (settings.startPosition === "sfen") {
    startPositionUSI = settings.startPositionSFEN;
    if (
      !startPositionUSI.startsWith("position ") &&
      !startPositionUSI.startsWith("sfen ") &&
      detectRecordFormat(startPositionUSI) === RecordFormatType.SFEN
    ) {
      startPositionUSI = `sfen ${startPositionUSI}`;
    }
    const record = Record.newByUSI(startPositionUSI);
    if (!(record instanceof Record)) {
      throw record;
    }
  }
  let gameCount = 0;
  return {
    ...settings,
    next: (recordManager: RecordManager) => {
      if (gameCount >= maxGames) {
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
      } else if (settings.startPosition === "sfen") {
        const error = recordManager.importRecord(startPositionUSI, {
          type: RecordFormatType.USI,
          markAsSaved: true,
        });
        if (error) {
          return error;
        }
      } else {
        recordManager.resetByInitialPositionType(settings.startPosition);
      }
      if (recordManager.record.current.ply !== 0 && settings.startPosition !== "current") {
        recordManager.updateComment(t.beginFromThisPosition);
      }
      const gameTitle = maxGames >= 2 ? `連続対局 ${gameCount}/${maxGames}` : undefined;
      const swapPlayers = settings.swapPlayers && gameCount % 2 === 0;
      const gameIndex = gameCount;
      const pairIndex = Math.floor((gameCount - 1) / 2) + 1;
      return { gameTitle, swapPlayers, gameIndex, pairIndex };
    },
  };
}
