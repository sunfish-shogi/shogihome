import * as uri from "@/common/uri.js";
import { PlayerSettings, defaultPlayerSettings, validatePlayerSettings } from "./player.js";
import { t } from "@/common/i18n/index.js";
import { USIEngineForCLI, exportUSIEnginesForCLI, importUSIEnginesForCLI } from "./usi.js";
import { RecordFileFormat } from "@/common/file/record.js";
import { AppSettings } from "./app.js";
import ejpn from "encoding-japanese";
const [base64Decode, base64Encode] = [ejpn.base64Decode, ejpn.base64Encode];

export enum CSAProtocolVersion {
  V121 = "v121",
  V121_FLOODGATE = "v121_floodgate",
  V121_X1 = "v121_x1",
}

export type TCPKeepaliveSettings = {
  initialDelay: number;
};

export type BlankLinePingSettings = {
  initialDelay: number;
  interval: number;
};

export type CSAServerSettings = {
  protocolVersion: CSAProtocolVersion;
  host: string;
  port: number;
  id: string;
  password: string;
  tcpKeepalive: TCPKeepaliveSettings;
  blankLinePing?: BlankLinePingSettings;
};

export type CSAGameSettings = {
  player: PlayerSettings;
  server: CSAServerSettings;
  autoFlip: boolean;
  enableComment: boolean;
  enableAutoSave: boolean;
  repeat: number;
  autoRelogin: boolean;
  restartPlayerEveryGame: boolean;
};

export function defaultCSAServerSettings(): CSAServerSettings {
  return {
    protocolVersion: CSAProtocolVersion.V121_FLOODGATE,
    host: "localhost",
    port: 4081,
    id: "",
    password: "",
    tcpKeepalive: {
      initialDelay: 10,
    },
  };
}

export function defaultCSAGameSettings(): CSAGameSettings {
  return {
    player: {
      name: t.human,
      uri: uri.ES_HUMAN,
    },
    server: defaultCSAServerSettings(),
    autoFlip: true,
    enableComment: true,
    enableAutoSave: true,
    repeat: 1,
    autoRelogin: true,
    restartPlayerEveryGame: false,
  };
}

export function validateCSAServerSettings(settings: CSAServerSettings): Error | undefined {
  if (
    settings.protocolVersion !== CSAProtocolVersion.V121 &&
    settings.protocolVersion !== CSAProtocolVersion.V121_FLOODGATE &&
    settings.protocolVersion !== CSAProtocolVersion.V121_X1
  ) {
    return new Error(t.protocolVersionNotSelected);
  }
  if (settings.host === "") {
    return new Error(t.hostNameIsEmpty);
  }
  if (settings.port < 0 || settings.port > 65535) {
    return new Error(t.invalidPortNumber);
  }
  if (settings.id === "") {
    return new Error(t.idIsEmpty);
  }
  if (settings.id.indexOf(" ") >= 0) {
    return new Error(t.idContainsSpace);
  }
  if (settings.password.indexOf(" ") >= 0) {
    return new Error(t.passwordContainsSpace);
  }
  if (settings.tcpKeepalive.initialDelay <= 0) {
    return new Error(t.tcpKeepaliveInitialDelayMustBePositive);
  }
  if (settings.blankLinePing) {
    if (settings.blankLinePing.initialDelay < 30) {
      return new Error(t.blankLinePingInitialDelayMustBeGreaterThanOrEqualTo30);
    }
    if (settings.blankLinePing.interval < 30) {
      return new Error(t.blankLinePingIntervalMustBeGreaterThanOrEqualTo30);
    }
  }
}

export function validateCSAGameSettings(settings: CSAGameSettings): Error | undefined {
  const playerError = validatePlayerSettings(settings.player);
  if (playerError) {
    return playerError;
  }

  const serverError = validateCSAServerSettings(settings.server);
  if (serverError) {
    return serverError;
  }
  if (
    settings.server.protocolVersion !== CSAProtocolVersion.V121 &&
    settings.server.protocolVersion !== CSAProtocolVersion.V121_FLOODGATE
  ) {
    return new Error("protocolVersion must be v121 or v121_floodgate");
  }

  if (!Number.isInteger(settings.repeat) || settings.repeat < 1) {
    return new Error("repeat must be a positive integer");
  }
}

export type CSAGameSettingsHistory = {
  player: PlayerSettings;
  serverHistory: CSAServerSettings[];
  autoFlip: boolean;
  enableComment: boolean;
  enableAutoSave: boolean;
  repeat: number;
  autoRelogin: boolean;
  restartPlayerEveryGame: boolean;
};

export function defaultCSAGameSettingsHistory(): CSAGameSettingsHistory {
  return {
    player: {
      name: t.human,
      uri: uri.ES_HUMAN,
    },
    serverHistory: [],
    autoFlip: true,
    enableComment: true,
    enableAutoSave: true,
    repeat: 1,
    autoRelogin: true,
    restartPlayerEveryGame: false,
  };
}

export function buildCSAGameSettingsByHistory(
  history: CSAGameSettingsHistory,
  index: number,
): CSAGameSettings {
  return {
    player: history.player,
    server:
      history.serverHistory?.length > index
        ? history.serverHistory[index]
        : defaultCSAServerSettings(),
    autoFlip: history.autoFlip,
    enableComment: history.enableComment,
    enableAutoSave: history.enableAutoSave,
    repeat: history.repeat,
    autoRelogin: history.autoRelogin,
    restartPlayerEveryGame: history.restartPlayerEveryGame,
  };
}

export const maxServerHistoryLength = 10;

export function appendCSAGameSettingsHistory(
  history: CSAGameSettingsHistory,
  settings: CSAGameSettings,
): CSAGameSettingsHistory {
  const newServerHistory = [settings.server];
  for (const server of history.serverHistory) {
    if (
      server.protocolVersion !== settings.server.protocolVersion ||
      server.host !== settings.server.host ||
      server.port !== settings.server.port ||
      server.id !== settings.server.id ||
      server.password !== settings.server.password ||
      server.tcpKeepalive.initialDelay !== settings.server.tcpKeepalive.initialDelay ||
      !server.blankLinePing !== !settings.server.blankLinePing ||
      server.blankLinePing?.initialDelay !== settings.server.blankLinePing?.initialDelay ||
      server.blankLinePing?.interval !== settings.server.blankLinePing?.interval
    ) {
      newServerHistory.push(server);
    }
    if (newServerHistory.length === maxServerHistoryLength) {
      break;
    }
  }
  return {
    player: settings.player,
    serverHistory: newServerHistory,
    autoFlip: settings.autoFlip,
    enableComment: settings.enableComment,
    enableAutoSave: settings.enableAutoSave,
    repeat: settings.repeat,
    autoRelogin: settings.autoRelogin,
    restartPlayerEveryGame: settings.restartPlayerEveryGame,
  };
}

export type SecureCSAServerSettings = {
  protocolVersion: CSAProtocolVersion;
  host: string;
  port: number;
  id: string;
  encryptedPassword?: string;
  password?: string;
  tcpKeepalive: TCPKeepaliveSettings;
  blankLinePing?: BlankLinePingSettings;
};

export function emptySecureCSAServerSettings(): SecureCSAServerSettings {
  return {
    protocolVersion: CSAProtocolVersion.V121_FLOODGATE,
    host: "",
    port: 0,
    id: "",
    tcpKeepalive: {
      initialDelay: 10,
    },
  };
}

export type SecureCSAGameSettingsHistory = {
  player: PlayerSettings;
  serverHistory: SecureCSAServerSettings[];
  autoFlip: boolean;
  enableComment: boolean;
  enableAutoSave: boolean;
  repeat: number;
  autoRelogin: boolean;
  restartPlayerEveryGame: boolean;
};

export function defaultSecureCSAGameSettingsHistory(): SecureCSAGameSettingsHistory {
  return {
    player: {
      name: t.human,
      uri: uri.ES_HUMAN,
    },
    serverHistory: [],
    autoFlip: true,
    enableComment: true,
    enableAutoSave: true,
    repeat: 1,
    autoRelogin: true,
    restartPlayerEveryGame: false,
  };
}

export function normalizeSecureCSAGameSettingsHistory(
  history: SecureCSAGameSettingsHistory,
): SecureCSAGameSettingsHistory {
  const serverHistory = [] as SecureCSAServerSettings[];
  for (const settings of history.serverHistory) {
    serverHistory.push({
      ...emptySecureCSAServerSettings(),
      ...settings,
    });
  }
  return {
    ...defaultSecureCSAGameSettingsHistory(),
    ...history,
    player: {
      ...defaultPlayerSettings(),
      ...history.player,
    },
    serverHistory: serverHistory,
  };
}

export function encryptCSAGameSettingsHistory(
  history: CSAGameSettingsHistory,
  encryptor?: (plainText: string) => string,
): SecureCSAGameSettingsHistory {
  const serverHistory = [] as SecureCSAServerSettings[];
  for (const settings of history.serverHistory) {
    const entry = {
      protocolVersion: settings.protocolVersion,
      host: settings.host,
      port: settings.port,
      id: settings.id,
      tcpKeepalive: settings.tcpKeepalive,
    } as SecureCSAServerSettings;
    if (settings.blankLinePing) {
      entry.blankLinePing = settings.blankLinePing;
    }
    if (encryptor) {
      entry.encryptedPassword = encryptor(settings.password);
    } else {
      entry.password = settings.password;
    }
    serverHistory.push(entry);
  }
  return {
    player: history.player,
    serverHistory: serverHistory,
    autoFlip: history.autoFlip,
    enableComment: history.enableComment,
    enableAutoSave: history.enableAutoSave,
    repeat: history.repeat,
    autoRelogin: history.autoRelogin,
    restartPlayerEveryGame: history.restartPlayerEveryGame,
  };
}

export function decryptCSAGameSettingsHistory(
  history: SecureCSAGameSettingsHistory,
  decryptor?: (encrypted: string) => string,
): CSAGameSettingsHistory {
  const serverHistory = [] as CSAServerSettings[];
  for (const settings of history.serverHistory) {
    const entry = {
      protocolVersion: settings.protocolVersion,
      host: settings.host,
      port: settings.port,
      id: settings.id,
      password:
        decryptor && settings.encryptedPassword
          ? decryptor(settings.encryptedPassword)
          : settings.password || "",
      tcpKeepalive: settings.tcpKeepalive,
    } as CSAServerSettings;
    if (settings.blankLinePing) {
      entry.blankLinePing = settings.blankLinePing;
    }
    serverHistory.push(entry);
  }
  return {
    player: history.player,
    serverHistory: serverHistory,
    autoFlip: history.autoFlip,
    enableComment: history.enableComment,
    enableAutoSave: history.enableAutoSave,
    repeat: history.repeat,
    autoRelogin: history.autoRelogin,
    restartPlayerEveryGame: history.restartPlayerEveryGame,
  };
}

export type CSAGameSettingsForCLI = {
  usi: USIEngineForCLI;
  server: CSAServerSettings;
  saveRecordFile: boolean;
  enableComment: boolean;
  recordFileNameTemplate?: string;
  recordFileFormat?: RecordFileFormat;
  repeat: number;
  autoRelogin: boolean;
  restartPlayerEveryGame: boolean;
};

export function exportCSAGameSettingsForCLI(
  settings: CSAGameSettings,
  appSettings: AppSettings,
): CSAGameSettingsForCLI | Error {
  if (!uri.isUSIEngine(settings.player.uri) || !settings.player.usi) {
    return new Error("player must be USI engine.");
  }
  return {
    usi: exportUSIEnginesForCLI(settings.player.usi),
    server: settings.server,
    saveRecordFile: settings.enableAutoSave,
    enableComment: settings.enableComment,
    recordFileNameTemplate: appSettings.recordFileNameTemplate,
    recordFileFormat: appSettings.defaultRecordFileFormat,
    repeat: settings.repeat,
    autoRelogin: settings.autoRelogin,
    restartPlayerEveryGame: settings.restartPlayerEveryGame,
  };
}

export function importCSAGameSettingsForCLI(
  settings: CSAGameSettingsForCLI,
  playerURI?: string,
): CSAGameSettings {
  const usi = importUSIEnginesForCLI(settings.usi, playerURI);
  return {
    player: {
      name: settings.usi.name,
      uri: usi.uri,
      usi,
    },
    server: settings.server,
    autoFlip: true,
    enableComment: settings.enableComment,
    enableAutoSave: settings.saveRecordFile,
    repeat: settings.repeat,
    autoRelogin: settings.autoRelogin,
    restartPlayerEveryGame: settings.restartPlayerEveryGame,
  };
}

export async function compressCSAGameSettingsForCLI(
  settings: CSAGameSettingsForCLI,
): Promise<string> {
  const json = JSON.stringify(settings);
  const cs = new CompressionStream("gzip");
  new Blob([json]).stream().pipeThrough(cs);
  const bin = await new Response(cs.readable).arrayBuffer();
  return base64Encode(new Uint8Array(bin));
}

export async function decompressCSAGameSettingsForCLI(
  compressed: string,
): Promise<CSAGameSettingsForCLI> {
  const bin = new Uint8Array(base64Decode(compressed));
  const cs = new DecompressionStream("gzip");
  new Blob([bin]).stream().pipeThrough(cs);
  return JSON.parse(await new Response(cs.readable).text());
}
