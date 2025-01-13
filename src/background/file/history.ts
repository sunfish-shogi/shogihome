import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { getAppPath } from "@/background/proc/env";
import {
  HistoryClass,
  RecordFileHistory,
  RecordFileHistoryEntry,
  getEmptyHistory,
} from "@/common/file/history";
import { getAppLogger } from "@/background/log";
import AsyncLock from "async-lock";
import { openPath } from "@/background/helpers/electron";
import { exists } from "@/background/helpers/file";

const historyMaxLength = 20;

const userDir = getAppPath("userData");
const historyPath = path.join(userDir, "record_file_history.json");
const backupDir = path.join(userDir, "backup/kifu");

export function openBackupDirectory(): Promise<void> {
  return openPath(backupDir);
}

const lock = new AsyncLock();

export async function getHistoryWithoutLock(): Promise<RecordFileHistory> {
  try {
    if (!(await exists(historyPath))) {
      return { entries: [] };
    }
    return {
      ...getEmptyHistory(),
      ...JSON.parse(await fs.readFile(historyPath, "utf8")),
    };
  } catch (e) {
    getAppLogger().warn(`failed to load history: ${e}`);
    return { entries: [] };
  }
}

let tempFilePath: string | undefined;

async function saveHistories(history: RecordFileHistory): Promise<void> {
  if (!tempFilePath) {
    tempFilePath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "shogihome-history-")),
      "temp.json",
    );
  }
  await fs.writeFile(tempFilePath, JSON.stringify(history, undefined, 2), "utf8");
  await fs.rename(tempFilePath, historyPath);
}

function issueEntryID(): string {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
}

function removeBackupFile(fileName: string): void {
  const filePath = path.join(backupDir, fileName);
  fs.rm(filePath).catch((e) => {
    getAppLogger().error("failed to remove backup: [%s]: %s", filePath, e);
  });
}

function trancate(history: RecordFileHistory): void {
  while (history.entries.length > historyMaxLength) {
    const entry = history.entries.shift() as RecordFileHistoryEntry;
    if (entry.class === HistoryClass.BACKUP && entry.backupFileName) {
      removeBackupFile(entry.backupFileName);
    }
  }
}

export function getHistory(): Promise<RecordFileHistory> {
  return lock.acquire("history", async () => {
    return await getHistoryWithoutLock();
  });
}

export function addHistory(path: string): void {
  lock.acquire("history", async () => {
    try {
      const history = await getHistoryWithoutLock();
      history.entries = history.entries.filter((e) => e.userFilePath !== path);
      history.entries.push({
        id: issueEntryID(),
        time: new Date().toISOString(),
        class: HistoryClass.USER,
        userFilePath: path,
      });
      trancate(history);
      await saveHistories(history);
    } catch (e) {
      getAppLogger().error("failed to add history: %s", e);
    }
  });
}

export function clearHistory(): Promise<void> {
  return lock.acquire("history", async () => {
    const history = await getHistoryWithoutLock();
    for (const entry of history.entries) {
      if (entry.class === HistoryClass.BACKUP && entry.backupFileName) {
        removeBackupFile(entry.backupFileName);
      }
    }
    await saveHistories(getEmptyHistory());
  });
}

export function saveBackup(kif: string): Promise<void> {
  return lock.acquire("history", async () => {
    const unixTime = new Date().getTime();
    const random = Math.floor(Math.random() * 10000);
    const fileName = `${unixTime}-${random}.kifu`;
    const filePath = path.join(backupDir, fileName);
    const history = await getHistoryWithoutLock();
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(filePath, kif);
    history.entries.push({
      id: issueEntryID(),
      time: new Date().toISOString(),
      class: HistoryClass.BACKUP,
      backupFileName: fileName,
    });
    trancate(history);
    await saveHistories(history);
  });
}

export async function loadBackup(fileName: string): Promise<string> {
  const filePath = path.join(backupDir, fileName);
  return await fs.readFile(filePath, "utf8");
}
