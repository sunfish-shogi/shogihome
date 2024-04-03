import * as uri from "@/common/uri";
import {
  appendCSAGameSettingHistory,
  CSAGameSetting,
  CSAGameSettingHistory,
  decryptCSAGameSettingHistory,
  encryptCSAGameSettingHistory,
  exportCSAGameSettingForCLI,
  importCSAGameSettingForCLI,
  normalizeSecureCSAGameSettingHistory,
  SecureCSAGameSettingHistory,
  validateCSAGameSetting,
} from "@/common/settings/csa";
import { defaultAppSetting } from "@/common/settings/app";
import {
  csaGameSetting,
  csaGameSettingForCLI,
  emptyCSAGameSettingHistory,
  playerURI,
} from "@/tests/mock/csa";

describe("settings/csa", () => {
  it("validate/noError", () => {
    const result = validateCSAGameSetting({
      player: {
        name: "参加者",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: "v121",
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
    const result = validateCSAGameSetting({
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: "v121",
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
    const result = validateCSAGameSetting({
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: "v121",
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
    const result = validateCSAGameSetting({
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: "v121",
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
    const result = validateCSAGameSetting({
      player: {
        name: "参加者",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: "v121",
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
    const result = validateCSAGameSetting({
      player: {
        name: "参加者",
        uri: uri.ES_HUMAN,
      },
      server: {
        protocolVersion: "v121",
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
    const setting = {
      player: {
        name: "人",
        uri: uri.ES_HUMAN,
      },
      serverHistory: [
        {
          protocolVersion: "v121_floodgate",
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
    } as CSAGameSettingHistory;
    const result = normalizeSecureCSAGameSettingHistory(setting);
    expect(result).toStrictEqual(setting);
  });

  it("appendCSAGameSettingHistory", () => {
    const buildSetting = (n: number) => {
      return {
        player: {
          name: `Player ${n}`,
          uri: uri.ES_HUMAN,
        },
        server: {
          ...csaGameSetting.server,
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
    let history = emptyCSAGameSettingHistory;
    // 異なる設定を追加している間は件数が増える。
    for (let i = 0; i < 5; i++) {
      expect(history.serverHistory).toHaveLength(i);
      history = appendCSAGameSettingHistory(history, buildSetting(i));
      expect(history.player.name).toBe(`Player ${i}`);
    }
    expect(history.serverHistory[0].id).toBe("TestPlayer4");
    expect(history.serverHistory[1].id).toBe("TestPlayer3");
    expect(history.serverHistory[2].id).toBe("TestPlayer2");
    expect(history.serverHistory[3].id).toBe("TestPlayer1");
    expect(history.serverHistory[4].id).toBe("TestPlayer0");
    // 重複する設定を追加すると順序のみが入れ替わる。
    history = appendCSAGameSettingHistory(history, buildSetting(2));
    expect(history.serverHistory).toHaveLength(5);
    expect(history.serverHistory[0].id).toBe("TestPlayer2");
    expect(history.serverHistory[1].id).toBe("TestPlayer4");
    expect(history.serverHistory[2].id).toBe("TestPlayer3");
    expect(history.serverHistory[3].id).toBe("TestPlayer1");
    expect(history.serverHistory[4].id).toBe("TestPlayer0");
    // 異なる設定を追加している間は件数が増える。
    for (let i = 5; i < 10; i++) {
      expect(history.serverHistory).toHaveLength(i);
      history = appendCSAGameSettingHistory(history, buildSetting(i));
      expect(history.player.name).toBe(`Player ${i}`);
    }
    // 上限を超えると古いものが削除される。
    history = appendCSAGameSettingHistory(history, buildSetting(10));
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
          protocolVersion: "v121",
          host: "test-server01",
          port: 4081,
          id: "user01",
          password: "test01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: "v121",
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
    } as CSAGameSettingHistory;
    const secure = encryptCSAGameSettingHistory(raw, (src) => {
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
          protocolVersion: "v121",
          host: "test-server01",
          port: 4081,
          id: "user01",
          encryptedPassword: "xyz01",
          tcpKeepalive: {
            initialDelay: 10,
          },
        },
        {
          protocolVersion: "v121",
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
    const insecure = encryptCSAGameSettingHistory(raw);
    expect(insecure).toStrictEqual({
      ...raw,
      serverHistory: [
        {
          protocolVersion: "v121",
          host: "test-server01",
          port: 4081,
          id: "user01",
          password: "test01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: "v121",
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
          protocolVersion: "v121",
          host: "test-server01",
          port: 4081,
          id: "user01",
          encryptedPassword: "xyz01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: "v121",
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
    } as SecureCSAGameSettingHistory;
    const insecure = {
      ...secure,
      serverHistory: [
        {
          protocolVersion: "v121",
          host: "test-server03",
          port: 4081,
          id: "user03",
          password: "test03",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: "v121",
          host: "test-server04",
          port: 4081,
          id: "user04",
          password: "test04",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
    } as CSAGameSettingHistory;
    const raw = decryptCSAGameSettingHistory(secure, (src) => {
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
          protocolVersion: "v121",
          host: "test-server01",
          port: 4081,
          id: "user01",
          password: "test01",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: "v121",
          host: "test-server02",
          port: 4081,
          id: "user02",
          password: "test02",
          tcpKeepalive: { initialDelay: 10 },
        },
      ],
    });
    const raw2 = decryptCSAGameSettingHistory(insecure);
    expect(raw2).toStrictEqual({
      ...secure,
      serverHistory: [
        {
          protocolVersion: "v121",
          host: "test-server03",
          port: 4081,
          id: "user03",
          password: "test03",
          tcpKeepalive: { initialDelay: 10 },
        },
        {
          protocolVersion: "v121",
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
    expect(exportCSAGameSettingForCLI(csaGameSetting, defaultAppSetting())).toEqual(
      csaGameSettingForCLI,
    );
  });

  it("import-cli-settings", () => {
    const result = importCSAGameSettingForCLI(csaGameSettingForCLI, playerURI);
    const expected = JSON.parse(JSON.stringify(csaGameSetting)) as CSAGameSetting;
    expected.player.usi!.author = "";
    expected.player.usi!.defaultName = expected.player.name;
    Object.values(expected.player.usi!.options).forEach((option) => {
      delete option.default;
      delete option.min;
      delete option.max;
      option.order = 0;
    });
    expect(result).toEqual(expected);
  });
});
