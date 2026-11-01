import { getAppLogger } from "@/background/log.js";
import { safeStorage } from "electron";
import { isTest } from "@/background/proc/env.js";

export async function isEncryptionAvailable(): Promise<boolean> {
  return !isTest() && (await safeStorage.isAsyncEncryptionAvailable());
}

export async function encryptString(plainText: string): Promise<string> {
  return (await safeStorage.encryptStringAsync(plainText)).toString("base64");
}

export async function decryptString(encrypted: string, defaultValue?: string): Promise<string> {
  try {
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(encrypted, "base64"));
    return result;
  } catch (e) {
    getAppLogger().error("failed to decrypt CSA server password: %s", e);
    return defaultValue || "";
  }
}

/**
 * 与えられた文字列をすべて非同期に変換し、同期的に参照できる変換関数を返す。
 * 同期的な変換関数を受け取る common 側の関数に非同期 API の結果を渡すために使用する。
 */
export async function prepareConverter(
  inputs: string[],
  convert: (input: string) => Promise<string>,
): Promise<(input: string) => string> {
  const uniqueInputs = Array.from(new Set(inputs));
  const outputs = await Promise.all(uniqueInputs.map((input) => convert(input)));
  const table = new Map(uniqueInputs.map((input, i) => [input, outputs[i]]));
  return (input: string) => {
    const output = table.get(input);
    if (output === undefined) {
      throw new Error("unexpected input for prepared converter");
    }
    return output;
  };
}
