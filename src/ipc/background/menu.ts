import path from "path";
import {
  app,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  shell,
} from "electron";
import {
  openAutoSaveDirectory,
  openSettingsDirectory,
} from "@/ipc/background/settings";
import { openLogsDirectory } from "@/ipc/background/log";
import { getWebContents, onMenuEvent } from "@/ipc/background";
import { MenuEvent } from "@/ipc/menu";
import { AppState } from "@/store/state";
import { checkLatestVersion, openHowToUse, openWebSite } from "./help";

const isMac = process.platform === "darwin";

const stateChangeCallbacks: ((appState: AppState, bussy: boolean) => void)[] =
  [];

function menuItem(
  label: string,
  event: MenuEvent,
  appStates: AppState[] | null,
  accelerator?: string
): MenuItemConstructorOptions {
  const index = stateChangeCallbacks.length;
  const id = "menuItem" + index;
  stateChangeCallbacks.push((appState: AppState, bussy: boolean) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) {
      return;
    }
    const item = menu.getMenuItemById(id);
    if (!item) {
      return;
    }
    item.enabled = bussy
      ? false
      : !appStates || appStates.length === 0
      ? true
      : !!appStates.find((value) => value === appState);
  });
  return {
    id,
    label,
    accelerator,
    click: () => onMenuEvent(event),
  };
}

const menuTemplate: Array<MenuItemConstructorOptions | MenuItem> = [
  {
    label: "ファイル",
    submenu: [
      menuItem("新規棋譜", MenuEvent.NEW_RECORD, [AppState.NORMAL]),
      menuItem(
        "棋譜を開く",
        MenuEvent.OPEN_RECORD,
        [AppState.NORMAL],
        "CmdOrCtrl+O"
      ),
      menuItem(
        "棋譜を上書き保存",
        MenuEvent.SAVE_RECORD,
        [AppState.NORMAL],
        "CmdOrCtrl+S"
      ),
      menuItem(
        "棋譜に名前を付けて保存",
        MenuEvent.SAVE_RECORD_AS,
        [AppState.NORMAL],
        "CmdOrCtrl+Shift+S"
      ),
      { type: "separator" },
      {
        label: "自動保存先を開く",
        click: openAutoSaveDirectory,
      },
      { type: "separator" },
      isMac
        ? { role: "close", label: "閉じる" }
        : { role: "quit", label: "終了" },
    ],
  },
  {
    label: "編集",
    submenu: [
      {
        label: "棋譜コピー",
        submenu: [
          menuItem("KIF形式", MenuEvent.COPY_RECORD, null, "CmdOrCtrl+C"),
          menuItem("CSA形式", MenuEvent.COPY_RECORD_CSA, null),
          menuItem(
            "USI形式(現在の指し手まで)",
            MenuEvent.COPY_RECORD_USI_BEFORE,
            null
          ),
          menuItem("USI形式(全て)", MenuEvent.COPY_RECORD_USI_ALL, null),
        ],
      },
      menuItem("局面コピー(SFEN形式)", MenuEvent.COPY_BOARD_SFEN, null),
      menuItem(
        "棋譜・局面貼り付け",
        MenuEvent.PASTE_RECORD,
        [AppState.NORMAL],
        "CmdOrCtrl+V"
      ),
      { type: "separator" },
      {
        label: "特殊な指し手",
        submenu: [
          menuItem("中断", MenuEvent.INSERT_INTERRUPT, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("投了", MenuEvent.INSERT_RESIGN, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("引き分け", MenuEvent.INSERT_DRAW, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("持将棋", MenuEvent.INSERT_IMPASS, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("千日手", MenuEvent.INSERT_REPETITION_DRAW, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("詰み", MenuEvent.INSERT_MATE, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("時間切れ", MenuEvent.INSERT_TIMEOUT, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("反則勝ち", MenuEvent.INSERT_FOUL_WIN, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("反則負け", MenuEvent.INSERT_FOUL_LOSE, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("入玉勝ち", MenuEvent.INSERT_ENTERING_OF_KING, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("不戦勝", MenuEvent.INSERT_WIN_BY_DEFAULT, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
          menuItem("不戦敗", MenuEvent.INSERT_LOSS_BY_DEFAULT, [
            AppState.NORMAL,
            AppState.RESEARCH,
          ]),
        ],
      },
      menuItem(
        "現在の位置から棋譜を削除",
        MenuEvent.REMOVE_CURRENT_MOVE,
        [AppState.NORMAL, AppState.RESEARCH],
        "CmdOrCtrl+D"
      ),
      { type: "separator" },
      menuItem("局面編集開始", MenuEvent.START_POSITION_EDITING, [
        AppState.NORMAL,
      ]),
      menuItem("局面編集終了", MenuEvent.END_POSITION_EDITING, [
        AppState.POSITION_EDITING,
      ]),
      menuItem("手番入れ替え", MenuEvent.CHANGE_TURN, [
        AppState.POSITION_EDITING,
      ]),
      {
        label: "局面初期化",
        submenu: [
          menuItem("平手", MenuEvent.INIT_POSITION_STANDARD, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("香落ち", MenuEvent.INIT_POSITION_HANDICAP_LANCE, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("右香落ち", MenuEvent.INIT_POSITION_HANDICAP_RIGHT_LANCE, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("角落ち", MenuEvent.INIT_POSITION_HANDICAP_BISHOP, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("飛車落ち", MenuEvent.INIT_POSITION_HANDICAP_ROOK, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("飛車香落ち", MenuEvent.INIT_POSITION_HANDICAP_ROOK_LANCE, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("2枚落ち", MenuEvent.INIT_POSITION_HANDICAP_2PIECES, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("4枚落ち", MenuEvent.INIT_POSITION_HANDICAP_4PIECES, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("6枚落ち", MenuEvent.INIT_POSITION_HANDICAP_6PIECES, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("8枚落ち", MenuEvent.INIT_POSITION_HANDICAP_8PIECES, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("詰め将棋", MenuEvent.INIT_POSITION_TSUME_SHOGI, [
            AppState.POSITION_EDITING,
          ]),
          menuItem("双玉詰め将棋", MenuEvent.INIT_POSITION_TSUME_SHOGI_2KINGS, [
            AppState.POSITION_EDITING,
          ]),
        ],
      },
    ],
  },
  {
    label: "対局",
    submenu: [
      menuItem("対局", MenuEvent.START_GAME, [AppState.NORMAL], "CmdOrCtrl+G"),
      menuItem("通信対局（CSA）", MenuEvent.START_CSA_GAME, [AppState.NORMAL]),
      menuItem("中断", MenuEvent.STOP_GAME, [AppState.GAME]),
      menuItem("投了", MenuEvent.RESIGN, [AppState.GAME, AppState.CSA_GAME]),
      menuItem("勝ち宣言", MenuEvent.WIN, [AppState.CSA_GAME]),
      { type: "separator" },
      menuItem("ログアウト", MenuEvent.LOGOUT, [AppState.CSA_GAME]),
    ],
  },
  {
    label: "検討",
    submenu: [
      menuItem(
        "検討開始",
        MenuEvent.START_RESEARCH,
        [AppState.NORMAL],
        "CmdOrCtrl+R"
      ),
      menuItem("検討終了", MenuEvent.STOP_RESEARCH, [AppState.RESEARCH]),
      { type: "separator" },
      menuItem(
        "解析開始",
        MenuEvent.START_ANALYSIS,
        [AppState.NORMAL],
        "CmdOrCtrl+A"
      ),
      menuItem("解析終了", MenuEvent.STOP_ANALYSIS, [AppState.ANALYSIS]),
    ],
  },
  {
    label: "表示",
    submenu: [
      {
        label: "全画面表示切り替え",
        role: "togglefullscreen",
      },
      menuItem("盤面反転", MenuEvent.FLIP_BOARD, null, "CmdOrCtrl+T"),
      {
        label: "標準の文字サイズ",
        click: () => {
          getWebContents().setZoomLevel(0);
        },
        accelerator: "CmdOrCtrl+0",
      },
      {
        label: "文字を拡大",
        click: () => {
          const level = getWebContents().getZoomLevel();
          getWebContents().setZoomLevel(level + 1);
        },
        accelerator: "CmdOrCtrl+Plus",
      },
      {
        label: "文字を縮小",
        click: () => {
          const level = getWebContents().getZoomLevel();
          getWebContents().setZoomLevel(level - 1);
        },
        accelerator: "CmdOrCtrl+-",
      },
    ],
  },
  {
    label: "設定",
    submenu: [
      menuItem("アプリ設定", MenuEvent.APP_SETTING_DIALOG, null, "CmdOrCtrl+,"),
      menuItem(
        "エンジン設定",
        MenuEvent.USI_ENGINE_SETTING_DIALOG,
        [AppState.NORMAL],
        "CmdOrCtrl+."
      ),
    ],
  },
  {
    label: "デバッグ",
    submenu: [
      {
        label: "開発者ツール表示切り替え",
        role: "toggleDevTools",
      },
      { type: "separator" },
      {
        label: "アプリのフォルダを開く",
        click: () => {
          shell.openPath(path.dirname(app.getPath("exe")));
        },
      },
      {
        label: "設定ファイルのフォルダを開く",
        click: openSettingsDirectory,
      },
      {
        label: "ログファイルのフォルダを開く",
        click: openLogsDirectory,
      },
    ],
  },
  {
    label: "ヘルプ",
    submenu: [
      {
        label: "Web サイトを開く",
        click: openWebSite,
      },
      {
        label: "使い方を開く",
        click: openHowToUse,
      },
      {
        label: "最新バージョンを確認",
        click: checkLatestVersion,
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

export function setupMenu(): void {
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

export function updateMenuState(appState: AppState, bussy: boolean): void {
  Array.from(stateChangeCallbacks).forEach((callback) =>
    callback(appState, bussy)
  );
}
