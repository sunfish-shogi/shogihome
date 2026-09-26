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
import { detectRecordFileFormatByPath, decodeRecordFileContent } from "@/common/file/record.js";

const userFileMaxLength = 100;
const backupMaxLength = 20;
// 履歴検索のために読み込むユーザーファイルの上限
const contentMaxFileSize = 2 * 1024 * 1024; // 2MB
const contentMaxTotalSize = 32 * 1024 * 1024; // 32MB
const contentLoadConcurrency = 8;

const userDir = getAppPath("userData");
const historyPath = path.join(userDir, "record_file_history.json");

// 現在はこのディレクトリに書き出していないが、
// 古いバージョンで作られたファイルが残っている可能性があるので参照や削除の実装は残しておく
const backupDir = path.join(userDir, "backup/kifu");

const lock = new AsyncLock();
const lockKey = "history";

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

function truncate(history: RecordFileHistory): void {
  // ユーザーファイルとバックアップはそれぞれ別の上限を持つ。
  // 新しいエントリから数えて上限を超えた古いエントリを削除する。
  let userFileCount = 0;
  let backupCount = 0;
  const removed: RecordFileHistoryEntry[] = [];
  const kept: RecordFileHistoryEntry[] = [];
  for (let i = history.entries.length - 1; i >= 0; i--) {
    const entry = history.entries[i];
    const isUserFile = entry.class === HistoryClass.USER;
    const count = isUserFile ? ++userFileCount : ++backupCount;
    if (count > (isUserFile ? userFileMaxLength : backupMaxLength)) {
      removed.push(entry);
    } else {
      kept.push(entry);
    }
  }
  history.entries = kept.reverse();
  for (const entry of removed) {
    if (entry.class === HistoryClass.BACKUP && entry.backupFileName) {
      removeBackupFile(entry.backupFileName);
    }
  }
}

export function getHistory(): Promise<RecordFileHistory> {
  return lock.acquire(lockKey, async () => {
    return await getHistoryWithoutLock();
  });
}

export function addHistory(path: string): void {
  lock.acquire(lockKey, async () => {
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
      truncate(history);
      await saveHistories(history);
    } catch (e) {
      getAppLogger().error("failed to add history: %s", e);
    }
  });
}

export function clearHistory(): Promise<void> {
  return lock.acquire(lockKey, async () => {
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

  return lock.acquire(lockKey, async () => {
    const history = await getHistoryWithoutLock();
    history.entries.push({
      id: issueEntryID(),
      time: new Date().toISOString(),
      ...entry,
    });
    truncate(history);
    await saveHistories(history);
  });
}

export async function loadBackup(fileName: string): Promise<string> {
  const filePath = path.join(backupDir, fileName);
  return await fs.readFile(filePath, "utf8");
}

async function loadUserFileContent(
  filePath: string,
  autoDetect: boolean,
  budget: { remaining: number },
): Promise<string | undefined> {
  const format = detectRecordFileFormatByPath(filePath);
  if (!format) {
    return;
  }
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > contentMaxFileSize || stat.size > budget.remaining) {
      return;
    }
    budget.remaining -= stat.size;
    const data = await fs.readFile(filePath);
    return decodeRecordFileContent(data, format, { autoDetect });
  } catch (e) {
    getAppLogger().debug("failed to load record file for history search: [%s]: %s", filePath, e);
  }
}

/**
 * 履歴に含まれるユーザーファイルの内容を読み込む。
 * メモリ使用量を抑えるため、新しいエントリから順に合計サイズの上限まで読み込む。
 * 読み込めなかったファイルや上限を超えたファイルは結果に含まれない。
 * @returns エントリ ID をキー、ファイルの内容を値とするオブジェクト
 */
export async function loadUserFileContents(option: {
  autoDetect: boolean;
}): Promise<{ [id: string]: string }> {
  const history = await getHistory();
  const entries = history.entries.filter((entry) => entry.class === HistoryClass.USER).reverse();
  const budget = { remaining: contentMaxTotalSize };
  const result: { [id: string]: string } = {};
  for (let i = 0; i < entries.length; i += contentLoadConcurrency) {
    const chunk = entries.slice(i, i + contentLoadConcurrency);
    const contents = await Promise.all(
      chunk.map((entry) => loadUserFileContent(entry.userFilePath, option.autoDetect, budget)),
    );
    chunk.forEach((entry, index) => {
      const content = contents[index];
      if (content !== undefined) {
        result[entry.id] = content;
      }
    });
  }
  return result;
}
