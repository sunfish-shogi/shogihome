export enum HistoryClass {
  USER = "user",
  BACKUP = "backup", // until v1.20.x
  BACKUP_V2 = "backupV2", // since v1.21.0
}

export type RecordFileHistoryEntry = {
  id: string;
  /** ISO 8601 format */
  time: string;
} & (UserFileEntry | BackupEntry | BackupEntryV2);

export type UserFileEntry = {
  class: HistoryClass.USER;
  userFilePath: string;
};

export type BackupEntry = {
  class: HistoryClass.BACKUP;
  backupFileName: string;
};

export type BackupEntryV2 = {
  class: HistoryClass.BACKUP_V2;
  title?: string;
  blackPlayerName?: string;
  whitePlayerName?: string;
  ply?: number;
  kif: string;
};

export type RecordFileHistory = {
  entries: RecordFileHistoryEntry[];
};

export function getEmptyHistory(): RecordFileHistory {
  return { entries: [] };
}
