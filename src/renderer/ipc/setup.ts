import { watch } from "vue";
import { SpecialMoveType } from "tsshogi";
import { useStore } from "@/renderer/store/index.js";
import { useStore as usePromptStore } from "@/renderer/prompt/store.js";
import {
  onUSIBestMove,
  onUSICheckmate,
  onUSICheckmateNotImplemented,
  onUSICheckmateTimeout,
  onUSIInfo,
  onUSINoMate,
} from "@/renderer/players/usi.js";
import { humanPlayer } from "@/renderer/players/human.js";
import { bridge } from "@/renderer/ipc/api.js";
import { MenuEvent } from "@/common/control/menu.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import { AppState, ResearchState } from "@/common/control/state.js";
import {
  onCSAClose,
  onCSAGameResult,
  onCSAGameSummary,
  onCSAMove,
  onCSAReject,
  onCSAStart,
} from "@/renderer/store/csa.js";
import { useAppSettings } from "@/renderer/store/settings.js";
import { t } from "@/common/i18n/index.js";
import { LogLevel } from "@/common/log.js";
import { useErrorStore } from "@/renderer/store/error.js";
import { useBusyState } from "@/renderer/store/busy.js";
import { useConfirmationStore } from "@/renderer/store/confirm.js";
import { useMessageStore } from "@/renderer/store/message.js";

export function setup(): void {
  const store = useStore();
  const appSettings = useAppSettings();
  const busyState = useBusyState();

  // Core
  watch(
    () => [store.appState, store.researchState, busyState.isBusy],
    ([appState, researchState, busy]) =>
      bridge.updateAppState(appState as AppState, researchState as ResearchState, busy as boolean),
  );
  bridge.updateAppState(store.appState, store.researchState, busyState.isBusy);
  bridge.onClose(async (confirmations: string[]) => {
    try {
      for (const message of confirmations) {
        await new Promise<void>((resolve, reject) => {
          useConfirmationStore().show({
            message,
            onOk: resolve,
            onCancel: reject,
          });
        });
      }
    } catch {
      return;
    }
    try {
      await store.onMainWindowClose();
    } catch (e) {
      bridge.log(LogLevel.ERROR, `${e}`);
    } finally {
      bridge.onClosable();
    }
  });
  bridge.onSendError((e: string) => {
    useErrorStore().add(e);
  });
  bridge.onSendMessage((json: string) => {
    useMessageStore().enqueue(JSON.parse(json));
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bridge.onMenuEvent((event: MenuEvent, ...args: any[]) => {
    if (busyState.isBusy) {
      return;
    }
    switch (event) {
      case MenuEvent.NEW_RECORD:
        store.resetRecord();
        break;
      case MenuEvent.NEW_RECORD_HIRATE_SETUP:
        store.resetRecord("hirateSetup");
        break;
      case MenuEvent.OPEN_RECORD:
        store.openRecord();
        break;
      case MenuEvent.SAVE_RECORD:
        store.saveRecord({ overwrite: true });
        break;
      case MenuEvent.SAVE_RECORD_AS:
        store.saveRecord();
        break;
      case MenuEvent.HISTORY:
        store.showRecordFileHistoryDialog();
        break;
      case MenuEvent.LOAD_REMOTE_RECORD:
        store.showLoadRemoteFileDialog();
        break;
      case MenuEvent.BATCH_CONVERSION:
        store.showBatchConversionDialog();
        break;
      case MenuEvent.SHARE:
        store.showShareDialog();
        break;
      case MenuEvent.EXPORT_POSITION_IMAGE:
        store.showExportBoardImageDialog();
        break;
      case MenuEvent.COPY_RECORD:
        store.copyRecordKIF();
        break;
      case MenuEvent.COPY_RECORD_KI2:
        store.copyRecordKI2();
        break;
      case MenuEvent.COPY_RECORD_CSA:
        store.copyRecordCSA();
        break;
      case MenuEvent.COPY_RECORD_USI_BEFORE:
        store.copyRecordUSI("before");
        break;
      case MenuEvent.COPY_RECORD_USI_ALL:
        store.copyRecordUSI("all");
        break;
      case MenuEvent.COPY_RECORD_JKF:
        store.copyRecordJKF();
        break;
      case MenuEvent.COPY_RECORD_USEN:
        store.copyRecordUSEN();
        break;
      case MenuEvent.COPY_RECORD_FROM_CURRENT_POSITION:
        store.copyRecordKIF({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_KI2_FROM_CURRENT_POSITION:
        store.copyRecordKI2({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_CSA_FROM_CURRENT_POSITION:
        store.copyRecordCSA({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_USI_FROM_CURRENT_POSITION:
        store.copyRecordUSI("after");
        break;
      case MenuEvent.COPY_RECORD_JKF_FROM_CURRENT_POSITION:
        store.copyRecordJKF({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_RECORD_USEN_FROM_CURRENT_POSITION:
        store.copyRecordUSEN({ fromCurrentPosition: true });
        break;
      case MenuEvent.COPY_BOARD_SFEN:
        store.copyBoardSFEN();
        break;
      case MenuEvent.COPY_BOARD_BOD:
        store.copyBoardBOD();
        break;
      case MenuEvent.PASTE_RECORD:
        store.showPasteDialog();
        break;
      case MenuEvent.PASTE_RECORD_MERGE_INTO_ROOT_POSITION:
        store.showPasteDialog("mergeIntoRoot");
        break;
      case MenuEvent.PASTE_RECORD_MERGE_INTO_CURRENT_POSITION:
        store.showPasteDialog("mergeIntoCurrent");
        break;
      case MenuEvent.SEARCH_DUPLICATE_POSITIONS:
        store.showSearchDuplicatePositionsDialog();
        break;
      case MenuEvent.INSERT_INTERRUPT:
        store.insertSpecialMove(SpecialMoveType.INTERRUPT);
        break;
      case MenuEvent.INSERT_RESIGN:
        store.insertSpecialMove(SpecialMoveType.RESIGN);
        break;
      case MenuEvent.INSERT_DRAW:
        store.insertSpecialMove(SpecialMoveType.DRAW);
        break;
      case MenuEvent.INSERT_IMPASS:
        store.insertSpecialMove(SpecialMoveType.IMPASS);
        break;
      case MenuEvent.INSERT_REPETITION_DRAW:
        store.insertSpecialMove(SpecialMoveType.REPETITION_DRAW);
        break;
      case MenuEvent.INSERT_MATE:
        store.insertSpecialMove(SpecialMoveType.MATE);
        break;
      case MenuEvent.INSERT_NO_MATE:
        store.insertSpecialMove(SpecialMoveType.NO_MATE);
        break;
      case MenuEvent.INSERT_TIMEOUT:
        store.insertSpecialMove(SpecialMoveType.TIMEOUT);
        break;
      case MenuEvent.INSERT_FOUL_WIN:
        store.insertSpecialMove(SpecialMoveType.FOUL_WIN);
        break;
      case MenuEvent.INSERT_FOUL_LOSE:
        store.insertSpecialMove(SpecialMoveType.FOUL_LOSE);
        break;
      case MenuEvent.INSERT_ENTERING_OF_KING:
        store.insertSpecialMove(SpecialMoveType.ENTERING_OF_KING);
        break;
      case MenuEvent.INSERT_WIN_BY_DEFAULT:
        store.insertSpecialMove(SpecialMoveType.WIN_BY_DEFAULT);
        break;
      case MenuEvent.INSERT_LOSE_BY_DEFAULT:
        store.insertSpecialMove(SpecialMoveType.LOSE_BY_DEFAULT);
        break;
      case MenuEvent.REMOVE_CURRENT_MOVE:
        store.removeCurrentMove();
        break;
      case MenuEvent.START_POSITION_EDITING:
        store.startPositionEditing();
        break;
      case MenuEvent.END_POSITION_EDITING:
        store.endPositionEditing();
        break;
      case MenuEvent.CHANGE_TURN:
        store.changeTurn();
        break;
      case MenuEvent.INIT_POSITION:
        store.initializePositionBySFEN(args[0]);
        break;
      case MenuEvent.CHANGE_PIECE_SET:
        store.showPieceSetChangeDialog();
        break;
      case MenuEvent.START_MATE_SEARCH:
        store.showMateSearchDialog();
        break;
      case MenuEvent.STOP_MATE_SEARCH:
        store.stopMateSearch();
        break;
      case MenuEvent.START_GAME:
        store.showGameDialog();
        break;
      case MenuEvent.START_CSA_GAME:
        store.showCSAGameDialog();
        break;
      case MenuEvent.STOP_GAME:
        store.stopGame();
        break;
      case MenuEvent.RESIGN:
        if (!store.isMovableByUser) {
          break;
        }
        useConfirmationStore().show({
          message: t.areYouSureWantToResign,
          onOk: () => {
            humanPlayer.resign();
          },
        });
        break;
      case MenuEvent.WIN:
        if (!store.isMovableByUser) {
          break;
        }
        useConfirmationStore().show({
          message: t.areYouSureWantToDoDeclaration,
          onOk: () => {
            humanPlayer.win();
          },
        });
        break;
      case MenuEvent.LOGOUT:
        store.cancelCSAGame();
        break;
      case MenuEvent.CALCULATE_POINTS:
        store.showJishogiPoints();
        break;
      case MenuEvent.DISPLAY_GAME_RESULTS:
        store.showGameResults();
        break;
      case MenuEvent.START_RESEARCH:
        store.showResearchDialog();
        break;
      case MenuEvent.STOP_RESEARCH:
        store.stopResearch();
        break;
      case MenuEvent.START_ANALYSIS:
        store.showAnalysisDialog();
        break;
      case MenuEvent.STOP_ANALYSIS:
        store.stopAnalysis();
        break;
      case MenuEvent.FLIP_BOARD:
        useAppSettings().flipBoard();
        break;
      case MenuEvent.APP_SETTINGS_DIALOG:
        store.showAppSettingsDialog();
        break;
      case MenuEvent.USI_ENGINES_DIALOG:
        store.showUsiEngineManagementDialog();
        break;
      case MenuEvent.LAUNCH_USI_ENGINE:
        store.showLaunchUSIEngineDialog();
        break;
      case MenuEvent.CONNECT_TO_CSA_SERVER:
        store.showConnectToCSAServerDialog();
        break;
    }
  });

  // Settings
  bridge.onUpdateAppSettings((json: string) => {
    appSettings.updateAppSettings(JSON.parse(json));
  });

  // Record File
  bridge.onOpenRecord((path: string) => {
    useConfirmationStore().show({
      message: t.areYouSureWantToOpenFileInsteadOfCurrentRecord,
      onOk: () => {
        store.openRecord(path);
      },
    });
  });

  // USI
  bridge.onUSIBestMove(onUSIBestMove);
  bridge.onUSICheckmate(onUSICheckmate);
  bridge.onUSICheckmateNotImplemented(onUSICheckmateNotImplemented);
  bridge.onUSICheckmateTimeout(onUSICheckmateTimeout);
  bridge.onUSINoMate(onUSINoMate);
  bridge.onUSIInfo((sessionID: number, usi: string, json: string) => {
    const info = JSON.parse(json) as USIInfoCommand;
    onUSIInfo(sessionID, usi, info);
  });

  // CSA
  bridge.onCSAGameSummary((sessionID: number, gameSummary: string): void => {
    onCSAGameSummary(sessionID, JSON.parse(gameSummary));
  });
  bridge.onCSAReject(onCSAReject);
  bridge.onCSAStart((sessionID: number, playerStates: string): void => {
    onCSAStart(sessionID, JSON.parse(playerStates));
  });
  bridge.onCSAMove((sessionID: number, move: string, playerStates: string): void => {
    onCSAMove(sessionID, move, JSON.parse(playerStates));
  });
  bridge.onCSAGameResult(onCSAGameResult);
  bridge.onCSAClose(onCSAClose);

  // Layout
  bridge.onUpdateLayoutProfile((json) => {
    store.updateLayoutProfile(json && JSON.parse(json));
  });

  // MISC
  bridge.onProgress((progress: number) => {
    busyState.updateProgress(progress);
  });
}

export function setupPrompt(): void {
  const store = usePromptStore();
  bridge.onPromptCommand((command: string) => {
    store.onCommand(JSON.parse(command));
  });
}
