import { getAppLogger } from "@/background/log.js";
import { safeStorage } from "electron";
import { isTest } from "@/background/proc/env.js";

export function isEncryptionAvailable(): boolean {
  return !!getElectron()?.safeStorage.isEncryptionAvailable();
}

export function EncryptString(plainText: string): string {
  return requireElectron().safeStorage.encryptString(plainText).toString("base64");
}

export function DecryptString(encrypted: string, defaultValue?: string): string {
  try {
    return requireElectron().safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch (e) {
    getAppLogger().error("failed to decrypt CSA server password: %s", e);
    return defaultValue || "";
  }
}
