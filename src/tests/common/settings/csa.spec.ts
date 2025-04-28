import * as uri from "@/common/uri.js";
import {
  appendCSAGameSettingsHistory,
  CSAGameSettings,
  CSAProtocolVersion,
  decryptCSAGameSettingsHistory,
  encryptCSAGameSettingsHistory,
  exportCSAGameSettingsForCLI,
  importCSAGameSettingsForCLI,
  normalizeSecureCSAGameSettingsHistory,
  validateCSAGameSettings,
} from "@/common/settings/csa.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import {
  csaGameSettings,
  csaGameSettingsForCLI,
  emptyCSAGameSettingsHistory,
  playerURI,
} from "@/tests/mock/csa.js";

describe("settings/csa", () => {
  it("validate/noError", () => {
    const result = validateCSAGameSettings({
      player: {
        name: "参加者",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: CSAProtocolVersion.V121,
        host: "localhost",
        port: 4081,
        id: "TestUser",
        password: "test0123",
        tcpKeepalive: { initialDelay: 10 },
      },
      autoFlip: true,
      enableComment: true,
      enableAutoSave: true,
      repeat: 1,
      autoRelogin: true,
      restartPlayerEveryGame: false,
    });
    expect(result).toBeUndefined();
  });

  it("validate/noHost", () => {
    const result = validateCSAGameSettings({
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: CSAProtocolVersion.V121,
        host: "",
        port: 4081,
        id: "TestUser",
        password: "test0123",
        tcpKeepalive: { initialDelay: 10 },
      },
      autoFlip: true,
      enableComment: true,
      enableAutoSave: true,
      repeat: 1,
      autoRelogin: true,
      restartPlayerEveryGame: false,
    });
    expect(result).toBeInstanceOf(Error);
  });

  it("validate/invalidPortNumber", () => {
    const result = validateCSAGameSettings({
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: CSAProtocolVersion.V121,
        host: "localhost",
        port: 100000,
        id: "TestUser",
        password: "test0123",
        tcpKeepalive: { initialDelay: 10 },
      },
      autoFlip: true,
      enableComment: true,
      enableAutoSave: true,
      repeat: 1,
      autoRelogin: true,
      restartPlayerEveryGame: false,
    });
    expect(result).toBeInstanceOf(Error);
  });

  it("validate/noID", () => {
    const result = validateCSAGameSettings({
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: CSAProtocolVersion.V121,
        host: "localhost",
        port: 4081,
        id: "",
        password: "test0123",
        tcpKeepalive: { initialDelay: 10 },
      },
      autoFlip: true,
      enableComment: true,
      enableAutoSave: true,
      repeat: 1,
      autoRelogin: true,
      restartPlayerEveryGame: false,
    });
    expect(result).toBeInstanceOf(Error);
  });

  it("validate/idContainsSpace", () => {
    const result = validateCSAGameSettings({
      player: {
        name: "参加者",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: CSAProtocolVersion.V121,
        host: "localhost",
        port: 4081,
        id: "Test User",
        password: "test0123",
        tcpKeepalive: { initialDelay: 10 },
      },
      autoFlip: true,
      enableComment: true,
      enableAutoSave: true,
      repeat: 1,
      autoRelogin: true,
      restartPlayerEveryGame: false,
    });
    expect(result).toBeInstanceOf(Error);
  });

  it("validate/passwordContainsSpace", () => {
    const result = validateCSAGameSettings({
      player: {
        name: "参加者",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: CSAProtocolVersion.V121,
        host: "localhost",
        port: 4081,
        id: "TestUser",
        password: "test 0123",
        tcpKeepalive: { initialDelay: 10 },
      },
      autoFlip: true,
      enableComment: true,
      enableAutoSave: true,
      repeat: 1,
      autoRelogin: true,
      restartPlayerEveryGame: false,
    });
    expect(result).toBeInstanceOf(Error);
  });

  it("normalize", () => {
    const settings = {
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121_FLOODGATE,
          host: "test-server",
          port: 1234,
          id: "test-user",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
      autoFlip: false,
      enableComment: false,
      enableAutoSave: false,
      repeat: 3,
      autoRelogin: false,
      restartPlayerEveryGame: false,
    };
    const result = normalizeSecureCSAGameSettingsHistory(settings);
    expect(result).toStrictEqual(settings);
  });

  it("appendCSAGameSettingsHistory", () => {
    const buildSettings = (n: number) => {
      return {
        player: {
          name: `Player ${n}`,
          uri: uri.ES_HUMAN,
        },
        server: {
          ...csaGameSettings.server,
          id: `TestPlayer${n}`,
        },
        autoFlip: true,
        enableComment: true,
        enableAutoSave: true,
        repeat: 1,
        autoRelogin: true,
        restartPlayerEveryGame: false,
      };
    };
    let history = emptyCSAGameSettingsHistory;
    // 異なる設定を追加している間は件数が増える。
    for (let i = 0; i < 5; i++) {
      expect(history.serverHistory).toHaveLength(i);
      history = appendCSAGameSettingsHistory(history, buildSettings(i));
      expect(history.player.name).toBe(`Player ${i}`);
    }
    expect(history.serverHistory[0].id).toBe("TestPlayer4");
    expect(history.serverHistory[1].id).toBe("TestPlayer3");
    expect(history.serverHistory[2].id).toBe("TestPlayer2");
    expect(history.serverHistory[3].id).toBe("TestPlayer1");
    expect(history.serverHistory[4].id).toBe("TestPlayer0");
    // 重複する設定を追加すると順序のみが入れ替わる。
    history = appendCSAGameSettingsHistory(history, buildSettings(2));
    expect(history.serverHistory).toHaveLength(5);
    expect(history.serverHistory[0].id).toBe("TestPlayer2");
    expect(history.serverHistory[1].id).toBe("TestPlayer4");
    expect(history.serverHistory[2].id).toBe("TestPlayer3");
    expect(history.serverHistory[3].id).toBe("TestPlayer1");
    expect(history.serverHistory[4].id).toBe("TestPlayer0");
    // 異なる設定を追加している間は件数が増える。
    for (let i = 5; i < 10; i++) {
      expect(history.serverHistory).toHaveLength(i);
      history = appendCSAGameSettingsHistory(history, buildSettings(i));
      expect(history.player.name).toBe(`Player ${i}`);
    }
    // 上限を超えると古いものが削除される。
    history = appendCSAGameSettingsHistory(history, buildSettings(10));
    expect(history.serverHistory).toHaveLength(10);
    expect(history.serverHistory[0].id).toBe("TestPlayer10");
    expect(history.serverHistory[9].id).toBe("TestPlayer1");
  });

  it("encrypt", () => {
    const raw = {
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server01",
          port: 4081,
          id: "user01",
          password: "test01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server02",
          port: 4081,
          id: "user02",
          password: "test02",
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
    const secure = encryptCSAGameSettingsHistory(raw, (src) => {
      return (
        {
          test01: "xyz01",
          test02: "xyz02",
        }[src] || ""
      );
    });
    expect(secure).toStrictEqual({
      ...raw,
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server01",
          port: 4081,
          id: "user01",
          encryptedPassword: "xyz01",
          tcpKeepalive: {
            initialDelay: 10,
          },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server02",
          port: 4081,
          id: "user02",
          encryptedPassword: "xyz02",
          tcpKeepalive: {
            initialDelay: 10,
          },
        },
      ],
    });
    const insecure = encryptCSAGameSettingsHistory(raw);
    expect(insecure).toStrictEqual({
      ...raw,
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server01",
          port: 4081,
          id: "user01",
          password: "test01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server02",
          port: 4081,
          id: "user02",
          password: "test02",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
    });
  });

  it("decrypt", () => {
    const secure = {
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server01",
          port: 4081,
          id: "user01",
          encryptedPassword: "xyz01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server02",
          port: 4081,
          id: "user02",
          encryptedPassword: "xyz02",
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
    const insecure = {
      ...secure,
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server03",
          port: 4081,
          id: "user03",
          password: "test03",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server04",
          port: 4081,
          id: "user04",
          password: "test04",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
    };
    const raw = decryptCSAGameSettingsHistory(secure, (src) => {
      return (
        {
          xyz01: "test01",
          xyz02: "test02",
        }[src] || ""
      );
    });
    expect(raw).toStrictEqual({
      ...secure,
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server01",
          port: 4081,
          id: "user01",
          password: "test01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server02",
          port: 4081,
          id: "user02",
          password: "test02",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
    });
    const raw2 = decryptCSAGameSettingsHistory(insecure);
    expect(raw2).toStrictEqual({
      ...secure,
      serverHistory: [
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server03",
          port: 4081,
          id: "user03",
          password: "test03",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: CSAProtocolVersion.V121,
          host: "test-server04",
          port: 4081,
          id: "user04",
          password: "test04",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
    });
  });

  it("export-cli-settings", () => {
    expect(exportCSAGameSettingsForCLI(csaGameSettings, defaultAppSettings())).toEqual(
      csaGameSettingsForCLI,
    );
  });

  it("import-cli-settings", () => {
    const result = importCSAGameSettingsForCLI(csaGameSettingsForCLI, playerURI);
    const expected = JSON.parse(JSON.stringify(csaGameSettings)) as CSAGameSettings;
    // CLI 用設定から逆変換するときに入らない情報を除去してから比較する。
    expected.player.usi!.author = "";
    expected.player.usi!.defaultName = expected.player.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.values(expected.player.usi!.options).forEach((option: any) => {
      delete option.default;
      delete option.min;
      delete option.max;
      option.order = 0;
      if (option.vars) {
        option.vars = [option.value];
      }
    });
    expect(result).toEqual(expected);
  });
});
