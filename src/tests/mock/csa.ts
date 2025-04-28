import { RecordFileFormat } from "@/common/file/record.js";
import { CSAGameSummary } from "@/common/game/csa.js";
import {
  CSAGameSettings,
  CSAGameSettingsForCLI,
  CSAGameSettingsHistory,
  CSAProtocolVersion,
  CSAServerSettings as CSAServerSettings,
} from "@/common/settings/csa.js";
import { PlayerSettings } from "@/common/settings/player.js";
import { defaultRecordFileNameTemplate } from "@/common/file/path.js";
import { Color } from "tsshogi";

export const playerURI = "es://usi-engine/test-engine";

const playerSettings: PlayerSettings = {
  name: "my usi engine",
  uri: playerURI,
  usi: {
    uri: playerURI,
    name: "my usi engine",
    defaultName: "engine",
    author: "author01",
    path: "/path/to/engine",
    options: {
      USI_Ponder: {
        name: "USI_Ponder",
        type: "check",
        order: 1,
        default: "true",
        value: "false",
      },
      USI_Hash: {
        name: "USI_Hash",
        type: "spin",
        order: 2,
        min: 32,
        default: 256,
        value: 1024,
      },
      BookFile: {
        name: "BookFile",
        type: "filename",
        order: 3,
        default: "book.db",
        value: "path/to/book.db",
      },
      EvalFunc: {
        name: "EvalFunc",
        type: "combo",
        order: 4,
        default: "KPP",
        value: "NNUE",
        vars: ["KPP", "KPPT", "NNUE", "NNUE_1024"],
      },
      EvalDir: {
        name: "EvalDir",
        type: "string",
        order: 5,
        default: "eval",
        value: "eval",
      },
    },
    labels: {},
    enableEarlyPonder: false,
  },
};

export const csaServerSettings: CSAServerSettings = {
  protocolVersion: CSAProtocolVersion.V121,
  host: "test-server",
  port: 4081,
  id: "TestPlayer",
  password: "test-password",
  tcpKeepalive: { initialDelay: 10 },
};

export const csaGameSettings: CSAGameSettings = {
  player: playerSettings,
  server: csaServerSettings,
  autoFlip: true,
  enableComment: true,
  enableAutoSave: true,
  repeat: 1,
  autoRelogin: true,
  restartPlayerEveryGame: false,
};

export const emptyCSAGameSettingsHistory: CSAGameSettingsHistory = {
  player: playerSettings,
  serverHistory: [],
  autoFlip: true,
  enableComment: true,
  enableAutoSave: true,
  repeat: 1,
  autoRelogin: true,
  restartPlayerEveryGame: false,
};

export const singleCSAGameSettingsHistory: CSAGameSettingsHistory = {
  player: playerSettings,
  serverHistory: [
    {
      protocolVersion: CSAProtocolVersion.V121,
      host: "test-server",
      port: 4081,
      id: "TestPlayer",
      password: "test-password",
      tcpKeepalive: { initialDelay: 10 },
    },
  ],
  autoFlip: true,
  enableComment: true,
  enableAutoSave: true,
  repeat: 1,
  autoRelogin: true,
  restartPlayerEveryGame: false,
};

const initialPosition = `\
P1-KY-KE-GI-KI-OU-KI-GI-KE-KY
P2 * -HI *  *  *  *  * -KA * 
P3-FU-FU-FU-FU-FU-FU-FU-FU-FU
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  *  *  *  * 
P7+FU+FU+FU+FU+FU+FU+FU+FU+FU
P8 * +KA *  *  *  *  * +HI * 
P9+KY+KE+GI+KI+OU+KI+GI+KE+KY
P+
P-
+`;

export const csaGameSummary: CSAGameSummary = {
  id: "test-game",
  players: {
    black: {
      playerName: "me",
      time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 30, delay: 0, increment: 0 },
    },
    white: {
      playerName: "enemy",
      time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 30, delay: 0, increment: 0 },
    },
  },
  myColor: Color.BLACK,
  toMove: Color.BLACK,
  position: initialPosition,
};

export const csaGameSummaryWithUnequalTimeConfig: CSAGameSummary = {
  id: "test-game",
  players: {
    black: {
      playerName: "me",
      time: { timeUnitMs: 1000, totalTime: 300, byoyomi: 0, delay: 0, increment: 5 },
    },
    white: {
      playerName: "enemy",
      time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 0, delay: 0, increment: 10 },
    },
  },
  myColor: Color.BLACK,
  toMove: Color.BLACK,
  position: initialPosition,
};

const invalidPosition = `+2726FU,T12`;

export const csaGameSummaryInvalidPosition: CSAGameSummary = {
  id: "test-game",
  players: {
    black: {
      playerName: "me",
      time: {
        timeUnitMs: 1000,
        totalTime: 600,
        byoyomi: 30,
        delay: 0,
        increment: 0,
      },
    },
    white: {
      playerName: "enemy",
      time: {
        timeUnitMs: 1000,
        totalTime: 600,
        byoyomi: 30,
        delay: 0,
        increment: 0,
      },
    },
  },
  myColor: Color.BLACK,
  toMove: Color.BLACK,
  position: invalidPosition,
};

export const csaGameSettingsForCLI: CSAGameSettingsForCLI = {
  usi: {
    name: "my usi engine",
    path: "/path/to/engine",
    options: {
      USI_Ponder: { type: "check", value: false },
      USI_Hash: { type: "spin", value: 1024 },
      BookFile: { type: "filename", value: "path/to/book.db" },
      EvalFunc: { type: "combo", value: "NNUE" },
      EvalDir: { type: "string", value: "eval" },
    },
    enableEarlyPonder: false,
  },
  server: csaServerSettings,
  saveRecordFile: true,
  enableComment: true,
  recordFileNameTemplate: defaultRecordFileNameTemplate,
  recordFileFormat: RecordFileFormat.KIF,
  repeat: 1,
  autoRelogin: true,
  restartPlayerEveryGame: false,
};
