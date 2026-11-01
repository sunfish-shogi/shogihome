import path from "node:path";
import fs from "node:fs";
import { safeStorage } from "electron";
import { isTest } from "@/background/proc/env.js";
import { getAppPath } from "@/background/proc/path-electron.js";
import { loadCSAGameSettingsHistory, saveCSAGameSettingsHistory } from "@/background/settings.js";
import { CSAProtocolVersion, defaultCSAGameSettingsHistory } from "@/common/settings/csa.js";

const { PREFIX } = vi.hoisted(() => ({ PREFIX: "encrypted:" }));

vi.mock("electron", () => {
  return {
    safeStorage: {
      isAsyncEncryptionAvailable: vi.fn(async () => true),
      encryptStringAsync: vi.fn(async (plainText: string) => Buffer.from(PREFIX + plainText)),
      decryptStringAsync: vi.fn(async (encrypted: Buffer) => {
        const text = encrypted.toString();
        if (!text.startsWith(PREFIX)) {
          throw new Error("failed to decrypt");
        }
        return { result: text.slice(PREFIX.length), shouldReEncrypt: false };
      }),
    },
  };
});

vi.mock("@/background/proc/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/background/proc/env.js")>();
  return {
    ...actual,
    isTest: vi.fn(actual.isTest),
  };
});

const userDir = getAppPath("userData");
const historyPath = path.join(userDir, "csa_game_setting_history.json");

function newServer(id: string, password: string) {
  return {
    protocolVersion: CSAProtocolVersion.V121,
    host: "localhost",
    port: 4081,
    id,
    password,
    tcpKeepalive: { initialDelay: 10 },
  };
}

describe("background/settings (encryption)", () => {
  beforeEach(() => {
    fs.rmSync(userDir, { recursive: true, force: true });
    fs.mkdirSync(userDir, { recursive: true });
    // getAppPath などの判定に影響しないよう、モジュールの読み込み後に暗号化を有効にする。
    vi.mocked(isTest).mockReturnValue(false);
  });

  afterEach(() => {
    vi.mocked(isTest).mockReset();
    vi.mocked(safeStorage.encryptStringAsync).mockClear();
  });

  it("round trip", async () => {
    const history = defaultCSAGameSettingsHistory();
    history.serverHistory = [
      newServer("user1", "password1"),
      newServer("user2", "password2"),
      newServer("user3", "password1"), // 重複したパスワード
      newServer("user4", ""), // 空のパスワード
    ];
    await saveCSAGameSettingsHistory(history);

    // パスワードは平文で保存されない。
    const raw = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    for (const server of raw.serverHistory) {
      expect(server.password).toBeUndefined();
      expect(server.encryptedPassword).toBeTruthy();
    }
    expect(fs.readFileSync(historyPath, "utf8")).not.toContain("password1");
    // 重複したパスワードは 1 回だけ暗号化される。
    expect(safeStorage.encryptStringAsync).toBeCalledTimes(3);

    const loaded = await loadCSAGameSettingsHistory();
    expect(loaded.serverHistory.map((server) => server.password)).toEqual([
      "password1",
      "password2",
      "password1",
      "",
    ]);
  });

  it("decryption failure", async () => {
    const history = defaultCSAGameSettingsHistory();
    history.serverHistory = [newServer("user1", "password1"), newServer("user2", "password2")];
    await saveCSAGameSettingsHistory(history);

    // 1 件目の暗号文を壊す。
    const raw = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    raw.serverHistory[0].encryptedPassword = Buffer.from("broken").toString("base64");
    fs.writeFileSync(historyPath, JSON.stringify(raw), "utf8");

    const loaded = await loadCSAGameSettingsHistory();
    expect(loaded.serverHistory.map((server) => server.password)).toEqual(["", "password2"]);
  });
});
