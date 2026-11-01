import { safeStorage } from "electron";
import { isTest } from "@/background/proc/env.js";
import {
  decryptString,
  encryptString,
  isEncryptionAvailable,
  prepareConverter,
} from "@/background/helpers/encrypt.js";

vi.mock("electron", () => {
  return {
    safeStorage: {
      isAsyncEncryptionAvailable: vi.fn(),
      encryptStringAsync: vi.fn(),
      decryptStringAsync: vi.fn(),
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

describe("helpers/encrypt", () => {
  afterEach(() => {
    vi.mocked(isTest).mockReset();
    vi.mocked(safeStorage.isAsyncEncryptionAvailable).mockReset();
    vi.mocked(safeStorage.encryptStringAsync).mockReset();
    vi.mocked(safeStorage.decryptStringAsync).mockReset();
  });

  it("isEncryptionAvailable", async () => {
    vi.mocked(isTest).mockReturnValue(false);
    vi.mocked(safeStorage.isAsyncEncryptionAvailable).mockResolvedValue(true);
    expect(await isEncryptionAvailable()).toBeTruthy();

    vi.mocked(safeStorage.isAsyncEncryptionAvailable).mockResolvedValue(false);
    expect(await isEncryptionAvailable()).toBeFalsy();

    // テスト環境では常に無効
    vi.mocked(isTest).mockReturnValue(true);
    vi.mocked(safeStorage.isAsyncEncryptionAvailable).mockResolvedValue(true);
    expect(await isEncryptionAvailable()).toBeFalsy();
  });

  it("encryptString", async () => {
    vi.mocked(safeStorage.encryptStringAsync).mockResolvedValue(Buffer.from("encrypted"));
    expect(await encryptString("plain")).toBe(Buffer.from("encrypted").toString("base64"));
    expect(safeStorage.encryptStringAsync).toBeCalledWith("plain");
  });

  it("decryptString", async () => {
    vi.mocked(safeStorage.decryptStringAsync).mockResolvedValue({
      result: "plain",
      shouldReEncrypt: false,
    });
    const encrypted = Buffer.from("encrypted").toString("base64");
    expect(await decryptString(encrypted)).toBe("plain");
    expect(vi.mocked(safeStorage.decryptStringAsync).mock.calls[0][0].toString()).toBe("encrypted");
  });

  it("decryptString/rejected", async () => {
    vi.mocked(safeStorage.decryptStringAsync).mockRejectedValue(new Error("test error"));
    expect(await decryptString("xxx")).toBe("");
    expect(await decryptString("xxx", "default")).toBe("default");
  });

  it("prepareConverter", async () => {
    const convert = vi.fn(async (input: string) => `converted:${input}`);
    const converter = await prepareConverter(["a", "b", "a", ""], convert);
    expect(converter("a")).toBe("converted:a");
    expect(converter("b")).toBe("converted:b");
    expect(converter("")).toBe("converted:");
    // 重複した入力は 1 回だけ変換される。
    expect(convert).toBeCalledTimes(3);
    // 事前に与えられていない入力はエラーになる。
    expect(() => converter("c")).toThrow();
  });
});
