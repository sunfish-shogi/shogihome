import path from "node:path";
import { promises as fs } from "node:fs";
import { getAppPath } from "@/background/proc/path-electron.js";
import {
  BackupEntryV2,
  HistoryClass,
  RecordFileHistory,
  RecordFileHistoryEntry,
  getEmptyHistory,
} from "@/common/file/history.js";
import { getAppLogger } from "@/background/log.js";
import AsyncLock from "async-lock";
import { exists } from "@/background/helpers/file.js";
import { writeFileAtomic } from "./atomic.js";
import { getBlackPlayerName, getWhitePlayerName, importKIF, Record } from "tsshogi";
import { getRecordTitleFromMetadata } from "@/common/helpers/metadata.js";

const historyMaxLength = 20;

const userDir = getAppPath("userData");
const historyPath = path.join(userDir, "record_file_history.json");

// 現在はこのディレクトリに書き出していないが、
// 古いバージョンで作られたファイルが残っている可能性があるので参照や削除の実装は残しておく
const backupDir = path.join(userDir, "backup/kifu");

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

async function saveHistories(history: RecordFileHistory): Promise<void> {
  await writeFileAtomic(historyPath, JSON.stringify(history, undefined, 2), "utf8");
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
      history.entries = history.entries.filter(
        (e) => e.class !== HistoryClass.USER || e.userFilePath !== path,
      );
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
  const entry = {
    class: HistoryClass.BACKUP_V2,
    kif,
  } as BackupEntryV2;

  const record = importKIF(kif);
  if (record instanceof Record) {
    entry.title = getRecordTitleFromMetadata(record.metadata);
    entry.blackPlayerName = getBlackPlayerName(record.metadata);
    entry.whitePlayerName = getWhitePlayerName(record.metadata);
    entry.ply = record.length;
  }

  return lock.acquire("history", async () => {
    const history = await getHistoryWithoutLock();
    history.entries.push({
      id: issueEntryID(),
      time: new Date().toISOString(),
      ...entry,
    });
    trancate(history);
    await saveHistories(history);
  });
}

export async function loadBackup(fileName: string): Promise<string> {
  const filePath = path.join(backupDir, fileName);
  return await fs.readFile(filePath, "utf8");
}
