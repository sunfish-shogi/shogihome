import path from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import { openAutoSaveDirectory, openSettingsDirectory } from "@/background/settings.js";
import {
  getTailCommand,
  getFilePath as getLogFilePath,
  getRootDir as getRootLogDir,
  tailLogFile,
} from "@/background/log.js";
import {
  onMenuEvent,
  onUpdateAppState,
  sendError,
  sendMessage,
  updateAppSettings,
} from "@/background/window/ipc.js";
import { MenuEvent } from "@/common/control/menu.js";
import { AppState, ResearchState } from "@/common/control/state.js";
import { openHowToUse, openLatestReleasePage, openStableReleasePage, openWebsite } from "./help.js";
import { t } from "@/common/i18n/index.js";
import { InitialPositionSFEN } from "tsshogi";
import { getAppPath } from "@/background/proc/path-electron.js";
import { chromiumLicensePath, electronLicensePath } from "@/background/proc/path.js";
import { openCacheDirectory } from "@/background/image/cache.js";
import { refreshCustomPieceImages, sendTestNotification } from "./debug.js";
import { LogType } from "@/common/log.js";
import { createLayoutManagerWindow } from "./layout.js";
import { licenseURL, thirdPartyLicenseURL } from "@/common/links/github.js";
import { materialIconsGuideURL } from "@/common/links/google.js";
import { openPath } from "@/background/helpers/electron.js";
import { createMonitorWindow } from "./monitor.js";
import { createListItems } from "@/common/message.js";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

const stateChangeCallbacks: ((
  appState: AppState,
  researchState: ResearchState,
  busy: boolean,
) => void)[] = [];

function menuItem(
  label: string,
  event: MenuEvent,
  appStates: (AppState | ResearchState)[] | null,
  accelerator?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): MenuItemConstructorOptions {
  const index = stateChangeCallbacks.length;
  const id = "menuItem" + index;
  stateChangeCallbacks.push((appState: AppState, researchState: ResearchState, busy: boolean) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) {
      return;
    }
    const item = menu.getMenuItemById(id);
    if (!item) {
      return;
    }
    item.enabled = busy
      ? false
      : !appStates || appStates.length === 0
        ? true
        : !!appStates.find((value) => value === appState || value === researchState);
  });
  return {
    id,
    label,
    accelerator,
    click: () => onMenuEvent(event, ...args),
  };
}

let fullScreenNotiSent = false;

function createMenuTemplate(window: BrowserWindow) {
  const menuTemplate: Array<MenuItemConstructorOptions | MenuItem> = [
    {
      label: t.file,
      submenu: [
        menuItem(
          t.newRecordKeepInitialPosition,
          MenuEvent.NEW_RECORD,
          [AppState.NORMAL],
          "CmdOrCtrl+N",
        ),
        menuItem(
          t.newRecordHirateSetup,
          MenuEvent.NEW_RECORD_HIRATE_SETUP,
          [AppState.NORMAL],
          "CmdOrCtrl+Shift+N",
        ),
        menuItem(t.openRecord, MenuEvent.OPEN_RECORD, [AppState.NORMAL], "CmdOrCtrl+O"),
        menuItem(t.saveRecord, MenuEvent.SAVE_RECORD, [AppState.NORMAL], "CmdOrCtrl+S"),
        menuItem(t.saveRecordAs, MenuEvent.SAVE_RECORD_AS, [AppState.NORMAL], "CmdOrCtrl+Shift+S"),
        menuItem(t.history, MenuEvent.HISTORY, [AppState.NORMAL], "CmdOrCtrl+H"),
        { type: "separator" },
        menuItem(
          t.loadRecordFromWeb,
          MenuEvent.LOAD_REMOTE_RECORD,
          [AppState.NORMAL],
          "CmdOrCtrl+Shift+O",
        ),
        { type: "separator" },
        menuItem(t.batchConversion, MenuEvent.BATCH_CONVERSION, [AppState.NORMAL]),
        menuItem(t.share, MenuEvent.SHARE, [AppState.NORMAL]),
        menuItem(
          t.exportPositionDiagram,
          MenuEvent.EXPORT_POSITION_IMAGE,
          [AppState.NORMAL],
          "CmdOrCtrl+Shift+E",
        ),
        { type: "separator" },
        {
          label: t.openAutoSaveDirectory,
          click: () => {
            openAutoSaveDirectory().catch(sendError);
          },
        },
        { type: "separator" },
        isMac ? { role: "close", label: t.close } : { role: "quit", label: t.quit },
      ],
    },
    {
      label: t.editing,
      submenu: [
        {
          label: t.copyRecordAll,
          submenu: [
            menuItem(t.asKIF, MenuEvent.COPY_RECORD, null, isMac ? undefined : "CmdOrCtrl+C"),
            menuItem(t.asKI2, MenuEvent.COPY_RECORD_KI2, null),
            menuItem(t.asCSA, MenuEvent.COPY_RECORD_CSA, null),
            menuItem(t.asUSIUntilCurrentMove, MenuEvent.COPY_RECORD_USI_BEFORE, null),
            menuItem(t.asUSIAll, MenuEvent.COPY_RECORD_USI_ALL, null),
            menuItem(t.asJSONKifuFormat, MenuEvent.COPY_RECORD_JKF, null),
            menuItem(t.asUSEN, MenuEvent.COPY_RECORD_USEN, null),
          ],
        },
        {
          label: t.copyRecordFromCurrentPosition,
          submenu: [
            menuItem(t.asKIF, MenuEvent.COPY_RECORD_FROM_CURRENT_POSITION, null),
            menuItem(t.asKI2, MenuEvent.COPY_RECORD_KI2_FROM_CURRENT_POSITION, null),
            menuItem(t.asCSA, MenuEvent.COPY_RECORD_CSA_FROM_CURRENT_POSITION, null),
            menuItem(t.asUSI, MenuEvent.COPY_RECORD_USI_FROM_CURRENT_POSITION, null),
            menuItem(t.asJSONKifuFormat, MenuEvent.COPY_RECORD_JKF_FROM_CURRENT_POSITION, null),
            menuItem(t.asUSEN, MenuEvent.COPY_RECORD_USEN_FROM_CURRENT_POSITION, null),
          ],
        },
        {
          label: t.copyPosition,
          submenu: [
            menuItem(t.asSFEN, MenuEvent.COPY_BOARD_SFEN, null),
            menuItem(t.asBOD, MenuEvent.COPY_BOARD_BOD, null),
          ],
        },
        menuItem(
          t.pasteRecordOrPosition,
          MenuEvent.PASTE_RECORD,
          [AppState.NORMAL],
          isMac ? undefined : "CmdOrCtrl+V",
        ),
        {
          label: t.pasteRecordMerge,
          submenu: [
            menuItem(t.toRootPosition, MenuEvent.PASTE_RECORD_MERGE_INTO_ROOT_POSITION, [
              AppState.NORMAL,
            ]),
            menuItem(t.toCurrentPosition, MenuEvent.PASTE_RECORD_MERGE_INTO_CURRENT_POSITION, [
              AppState.NORMAL,
            ]),
          ],
        },
        { type: "separator" },
        {
          label: t.addSpecialMove,
          submenu: [
            menuItem(t.interrupt, MenuEvent.INSERT_INTERRUPT, [AppState.NORMAL]),
            menuItem(t.resign, MenuEvent.INSERT_RESIGN, [AppState.NORMAL]),
            menuItem(t.draw, MenuEvent.INSERT_DRAW, [AppState.NORMAL]),
            menuItem(t.impass, MenuEvent.INSERT_IMPASS, [AppState.NORMAL]),
            menuItem(t.repetitionDraw, MenuEvent.INSERT_REPETITION_DRAW, [AppState.NORMAL]),
            menuItem(t.mate, MenuEvent.INSERT_MATE, [AppState.NORMAL]),
            menuItem(t.noMate, MenuEvent.INSERT_NO_MATE, [AppState.NORMAL]),
            menuItem(t.timeout, MenuEvent.INSERT_TIMEOUT, [AppState.NORMAL]),
            menuItem(t.foulWin, MenuEvent.INSERT_FOUL_WIN, [AppState.NORMAL]),
            menuItem(t.foulLose, MenuEvent.INSERT_FOUL_LOSE, [AppState.NORMAL]),
            menuItem(t.enteringOfKing, MenuEvent.INSERT_ENTERING_OF_KING, [AppState.NORMAL]),
            menuItem(t.winByDefault, MenuEvent.INSERT_WIN_BY_DEFAULT, [AppState.NORMAL]),
            menuItem(t.loseByDefault, MenuEvent.INSERT_LOSE_BY_DEFAULT, [AppState.NORMAL]),
          ],
        },
        menuItem(
          t.deleteMoves,
          MenuEvent.REMOVE_CURRENT_MOVE,
          [AppState.NORMAL, AppState.MATE_SEARCH],
          "CmdOrCtrl+D",
        ),
        { type: "separator" },
        menuItem(t.searchDuplicatePositions, MenuEvent.SEARCH_DUPLICATE_POSITIONS, [
          AppState.NORMAL,
        ]),
        { type: "separator" },
        menuItem(t.startPositionSetup, MenuEvent.START_POSITION_EDITING, [AppState.NORMAL]),
        menuItem(t.completePositionSetup, MenuEvent.END_POSITION_EDITING, [
          AppState.POSITION_EDITING,
        ]),
        menuItem(t.changeTurn, MenuEvent.CHANGE_TURN, [AppState.POSITION_EDITING]),
        {
          label: t.initializePosition,
          submenu: [
            menuItem(
              t.noHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.STANDARD,
            ),
            menuItem(
              t.lanceHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_LANCE,
            ),
            menuItem(
              t.rightLanceHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_RIGHT_LANCE,
            ),
            menuItem(
              t.bishopHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_BISHOP,
            ),
            menuItem(
              t.rookHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_ROOK,
            ),
            menuItem(
              t.rookLanceHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_ROOK_LANCE,
            ),
            menuItem(
              t.twoPiecesHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_2PIECES,
            ),
            menuItem(
              t.fourPiecesHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_4PIECES,
            ),
            menuItem(
              t.sixPiecesHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_6PIECES,
            ),
            menuItem(
              t.eightPiecesHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_8PIECES,
            ),
            menuItem(
              t.tenPiecesHandicap,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.HANDICAP_10PIECES,
            ),
            menuItem(
              t.tsumeShogi,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.TSUME_SHOGI,
            ),
            menuItem(
              t.doubleKingTsumeShogi,
              MenuEvent.INIT_POSITION,
              [AppState.POSITION_EDITING],
              undefined,
              InitialPositionSFEN.TSUME_SHOGI_2KINGS,
            ),
          ],
        },
        menuItem(t.changePieceSet, MenuEvent.CHANGE_PIECE_SET, [AppState.POSITION_EDITING]),
        // NOTE:
        //   Mac ではこれらのショートカットがメニューに無いとテキスト編集時のショートカット操作ができない。
        //   https://github.com/sunfish-shogi/shogihome/issues/694
        { type: "separator", visible: isMac },
        { role: "copy", accelerator: "CmdOrCtrl+C", visible: isMac },
        { role: "paste", accelerator: "CmdOrCtrl+V", visible: isMac },
        { role: "cut", accelerator: "CmdOrCtrl+X", visible: isMac },
        { role: "undo", accelerator: "CmdOrCtrl+Z", visible: isMac },
        { role: "redo", accelerator: "CmdOrCtrl+Shift+Z", visible: isMac },
        { role: "selectAll", accelerator: "CmdOrCtrl+A", visible: isMac },
      ],
    },
    {
      label: t.game,
      submenu: [
        menuItem(t.game, MenuEvent.START_GAME, [AppState.NORMAL], "CmdOrCtrl+G"),
        menuItem(t.csaOnlineGame, MenuEvent.START_CSA_GAME, [AppState.NORMAL]),
        { type: "separator" },
        menuItem(t.interrupt, MenuEvent.STOP_GAME, [AppState.GAME]),
        menuItem(t.resign, MenuEvent.RESIGN, [AppState.GAME, AppState.CSA_GAME]),
        menuItem(t.winByDeclaration, MenuEvent.WIN, [AppState.GAME, AppState.CSA_GAME]),
        { type: "separator" },
        menuItem(t.logout, MenuEvent.LOGOUT, [AppState.CSA_GAME]),
        { type: "separator" },
        menuItem(t.calculateJishogiPoints, MenuEvent.CALCULATE_POINTS, null),
        menuItem(t.displayGameResults, MenuEvent.DISPLAY_GAME_RESULTS, [AppState.GAME]),
      ],
    },
    {
      label: t.research,
      submenu: [
        menuItem(t.startResearch, MenuEvent.START_RESEARCH, [ResearchState.IDLE], "CmdOrCtrl+R"),
        menuItem(t.endResearch, MenuEvent.STOP_RESEARCH, [ResearchState.RUNNING]),
        { type: "separator" },
        menuItem(
          t.analyze,
          MenuEvent.START_ANALYSIS,
          [AppState.NORMAL],
          // NOTE:
          //   Mac では Cmd+A を SelectAll に割り当てる必要があるため、ここで CmdOrCtrl+A を使用することはできない。
          //   テキスト入力欄にフォーカスしていない場合は、レンダラー側で Cmd+A をハンドリングして解析ダイアログを出すので
          //   ここで Accelerator を割り当てなくても Cmd+A で解析ダイアログは表示される。
          //   しかし、メニューバーに何らかの表示がないとユーザーがショートカットキーの割り当てに気づかないので、
          //   Mac では Cmd+Y でも解析ダイアログを表示できるようにする。
          isMac ? "CmdOrCtrl+Y" : "CmdOrCtrl+A",
        ),
        menuItem(t.stopAnalysis, MenuEvent.STOP_ANALYSIS, [AppState.ANALYSIS]),
      ],
    },
    {
      label: t.mateSearch,
      submenu: [
        menuItem(t.mateSearch, MenuEvent.START_MATE_SEARCH, [AppState.NORMAL], "CmdOrCtrl+M"),
        menuItem(t.stopMateSearch, MenuEvent.STOP_MATE_SEARCH, [AppState.MATE_SEARCH]),
      ],
    },
    {
      label: t.view,
      submenu: [
        {
          label: t.openLayoutManager,
          click: () => {
            createLayoutManagerWindow(window);
          },
          accelerator: "CmdOrCtrl+L",
        },
        {
          label: t.openMonitorWindow,
          click: () => {
            createMonitorWindow(window);
          },
        },
        {
          type: "separator",
        },
        isMac
          ? {
              label: t.toggleFullScreen,
              role: "togglefullscreen",
            }
          : {
              label: t.toggleFullScreen,
              click: () => {
                const enable = !window.isFullScreen();
                window.setFullScreen(enable);
                if (enable && !fullScreenNotiSent) {
                  sendMessage({ text: t.youCanExitFullScreenByPressing("F11") });
                  fullScreenNotiSent = true;
                }
              },
              accelerator: "F11",
            },
        menuItem(t.flipBoard, MenuEvent.FLIP_BOARD, null, "CmdOrCtrl+T"),
        {
          label: t.defaultFontSize,
          click: () => {
            BrowserWindow.getAllWindows().forEach((child) => {
              child.webContents.setZoomLevel(0);
            });
          },
          accelerator: "CmdOrCtrl+0",
        },
        {
          label: t.increaseFontSize,
          click: () => {
            const level = window.webContents.getZoomLevel() + 1;
            BrowserWindow.getAllWindows().forEach((child) => {
              child.webContents.setZoomLevel(level);
            });
          },
          accelerator: "CmdOrCtrl+Plus",
        },
        {
          label: t.decreaseFontSize,
          click: () => {
            const level = window.webContents.getZoomLevel() - 1;
            BrowserWindow.getAllWindows().forEach((child) => {
              child.webContents.setZoomLevel(level);
            });
          },
          accelerator: "CmdOrCtrl+-",
        },
      ],
    },
    {
      label: t.settings,
      submenu: [
        menuItem(t.appSettings, MenuEvent.APP_SETTINGS_DIALOG, null, "CmdOrCtrl+,"),
        menuItem(t.manageEngines, MenuEvent.USI_ENGINES_DIALOG, [AppState.NORMAL], "CmdOrCtrl+."),
      ],
    },
    {
      label: t.folders,
      submenu: [
        {
          label: t.app,
          click: () => {
            openPath(path.dirname(getAppPath("exe"))).catch(sendError);
          },
        },
        {
          label: t.settings,
          click: () => {
            openSettingsDirectory().catch(sendError);
          },
        },
        {
          label: t.log,
          click: () => {
            openPath(getRootLogDir()).catch(sendError);
          },
        },
        {
          label: t.cache,
          click: () => {
            openCacheDirectory().catch(sendError);
          },
        },
        {
          label: t.autoSaving,
          click: () => {
            openAutoSaveDirectory().catch(sendError);
          },
        },
      ],
    },
    {
      label: t.debug,
      submenu: [
        {
          label: t.toggleDevTools,
          role: "toggleDevTools",
        },
        {
          type: "separator",
        },
        {
          label: t.openMonitorWindow,
          click: () => {
            createMonitorWindow(window);
          },
          accelerator: "CmdOrCtrl+Shift+M",
        },
        {
          label: t.logFile,
          submenu: [
            {
              label: t.openAppLog,
              click: () => {
                openPath(getLogFilePath(LogType.APP)).catch(sendError);
              },
            },
            {
              label: t.openUSILog,
              click: () => {
                openPath(getLogFilePath(LogType.USI)).catch(sendError);
              },
            },
            {
              label: t.openCSALog,
              click: () => {
                openPath(getLogFilePath(LogType.CSA)).catch(sendError);
              },
            },
            {
              type: "separator",
            },
            {
              label: t.tailAppLog + (isWin ? " (PowerShell)" : ""),
              click: () => {
                tailLogFile(LogType.APP);
              },
              enabled: isWin || isMac,
            },
            {
              label: t.tailUSILog + (isWin ? " (PowerShell)" : ""),
              click: () => {
                tailLogFile(LogType.USI);
              },
              enabled: isWin || isMac,
            },
            {
              label: t.tailCSALog + (isWin ? " (PowerShell)" : ""),
              click: () => {
                tailLogFile(LogType.CSA);
              },
              enabled: isWin || isMac,
            },
            {
              type: "separator",
            },
            {
              label: t.copyAppLogTailCommand + (isWin ? " (PowerShell)" : ""),
              click: () => {
                clipboard.writeText(getTailCommand(LogType.APP));
              },
            },
            {
              label: t.copyUSILogTailCommand + (isWin ? " (PowerShell)" : ""),
              click: () => {
                clipboard.writeText(getTailCommand(LogType.USI));
              },
            },
            {
              label: t.copyCSALogTailCommand + (isWin ? " (PowerShell)" : ""),
              click: () => {
                clipboard.writeText(getTailCommand(LogType.CSA));
              },
            },
          ],
        },
        menuItem(`${t.launchUSIEngine}(${t.adminMode})`, MenuEvent.LAUNCH_USI_ENGINE, [
          AppState.NORMAL,
        ]),
        menuItem(`${t.connectToCSAServer}(${t.adminMode})`, MenuEvent.CONNECT_TO_CSA_SERVER, [
          AppState.NORMAL,
        ]),
        {
          type: "separator",
        },
        {
          label: t.reloadCustomPieceImage,
          click: () => {
            refreshCustomPieceImages(updateAppSettings).catch(sendError);
          },
        },
        {
          label: t.notificationTest,
          click: sendTestNotification,
        },
        {
          type: "separator",
        },
        {
          label: "GPU Feature Status",
          click: () => {
            const status = app.getGPUFeatureStatus();
            sendMessage({
              text: "GPU Feature Status",
              attachments: [{ type: "list", items: createListItems(status) }],
              withCopyButton: true,
            });
          },
        },
        {
          label: "GPU Information",
          click: () => {
            app.getGPUInfo("complete").then((gpuInfo) => {
              if (!(gpuInfo instanceof Object)) {
                sendError(new Error("GPU Information is not an object"));
                return;
              }
              sendMessage({
                text: "GPU Information",
                attachments: [{ type: "list", items: createListItems(gpuInfo) }],
                withCopyButton: true,
              });
            });
          },
        },
        { type: "separator" },
        {
          label: "Forced Shutdown",
          click: () => {
            dialog
              .showMessageBox({
                message: "Are you sure you want to force shutdown?",
                buttons: ["Yes", "No"],
              })
              .then((result) => {
                if (result.response === 0) {
                  app.exit(1);
                }
              });
          },
        },
      ],
    },
    {
      label: t.help,
      submenu: [
        {
          label: t.openWebsite,
          click: openWebsite,
        },
        {
          label: t.openUserGuide,
          click: openHowToUse,
        },
        {
          label: t.openLatestReleasePage,
          click: () => {
            openLatestReleasePage().catch(sendError);
          },
        },
        {
          label: t.openStableReleasePage,
          click: () => {
            openStableReleasePage().catch(sendError);
          },
        },
        {
          label: t.license,
          submenu: [
            {
              label: t.shogiHome,
              click: () => {
                shell.openExternal(licenseURL);
              },
            },
            {
              label: "Third Party Libraries",
              click: () => {
                shell.openExternal(thirdPartyLicenseURL);
              },
            },
            {
              label: "Material Icons",
              click: () => {
                shell.openExternal(materialIconsGuideURL);
              },
            },
            {
              label: "Electron",
              click: () => {
                openPath(electronLicensePath).catch(sendError);
              },
            },
            {
              label: "Chromium",
              click: () => {
                openPath(chromiumLicensePath).catch(sendError);
              },
            },
          ],
        },
      ],
    },
  ];

  if (isMac) {
    menuTemplate.unshift({
      label: app.name,
      submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
    });
  }

  return menuTemplate;
}

export function setupMenu(window: BrowserWindow): void {
  const menu = Menu.buildFromTemplate(createMenuTemplate(window));
  Menu.setApplicationMenu(menu);
  Array.from(stateChangeCallbacks).forEach((callback) => onUpdateAppState(callback));
}
