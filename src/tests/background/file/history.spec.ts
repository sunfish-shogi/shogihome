import path from "node:path";
import fs from "node:fs";
import {
  addHistory,
  clearHistory,
  getHistory,
  loadBackup,
  saveBackup,
} from "@/background/file/history.js";
import { getAppPath } from "@/background/proc/path-electron.js";
import {
  BackupEntryV2,
  HistoryClass,
  RecordFileHistory,
  UserFileEntry,
} from "@/common/file/history.js";

const userDir = getAppPath("userData");
const historyPath = path.join(userDir, "record_file_history.json");
const backupDir = path.join(userDir, "backup/kifu");

describe("history", () => {
  it("v2", async () => {
    let history = await getHistory();
    expect(history.entries).toHaveLength(0);

    // 4 件を追加する。
    await saveBackup("test-kif-data1");
    addHistory("/path/to/file1.kif");
    await saveBackup("test-kif-data2");
    addHistory("/path/to/file2.kif");

    history = await getHistory();
    expect(history.entries).toHaveLength(4);
    expect(history.entries[0].class).toBe("backupV2");
    expect(history.entries[1].class).toBe("user");
    expect(history.entries[2].class).toBe("backupV2");
    expect(history.entries[3].class).toBe("user");
    const backup1 = (history.entries[0] as BackupEntryV2).kif;
    const user1 = (history.entries[1] as UserFileEntry).userFilePath;
    const backup2 = (history.entries[2] as BackupEntryV2).kif;
    const user2 = (history.entries[3] as UserFileEntry).userFilePath;
    expect(backup1).toBe("test-kif-data1");
    expect(user1).toBe("/path/to/file1.kif");
    expect(backup2).toBe("test-kif-data2");
    expect(user2).toBe("/path/to/file2.kif");

    // すでに存在するので履歴は増加しない。
    addHistory("/path/to/file1.kif");

    history = await getHistory();
    expect(history.entries).toHaveLength(4);
    expect((history.entries[2] as UserFileEntry).userFilePath).toBe("/path/to/file2.kif");
    expect((history.entries[3] as UserFileEntry).userFilePath).toBe("/path/to/file1.kif"); // 末尾に移動する。

    // 20 件ちょうどまで追加する。
    for (let i = 3; i <= 18; i++) {
      addHistory(`/path/to/file${i}.kif`);
    }

    history = await getHistory();
    expect(history.entries).toHaveLength(20);
    expect((history.entries[0] as BackupEntryV2).kif).toMatch(backup1);

    // 20 件を超えたので最初の 1 件が削除される。
    addHistory("/path/to/file19.kif");

    history = await getHistory();
    expect(history.entries).toHaveLength(20);
    expect((history.entries[0] as BackupEntryV2).kif).toMatch(backup2);

    // 履歴をクリアする。
    await clearHistory();

    history = await getHistory();
    expect(history.entries).toHaveLength(0);
  });

  it("compatibility", async () => {
    // 旧バージョンのバックアップファイルが存在する場合に
    // 読み込みと削除が機能するかを確認する。
    const original: RecordFileHistory = { entries: [] };
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 1; i <= 10; i++) {
      original.entries.push({
        id: `user-${i}`,
        time: "2024-01-01T00:00:00.000Z",
        class: HistoryClass.USER,
        userFilePath: `/path/to/file${i}.kif`,
      });
      original.entries.push({
        id: "backup-" + i,
        time: "2024-01-01T00:00:00.000Z",
        class: HistoryClass.BACKUP,
        backupFileName: `backup${i}.kifu`,
      });
      fs.writeFileSync(path.join(backupDir, `backup${i}.kifu`), `test-kif-data${i}`, "utf8");
    }
    fs.writeFileSync(historyPath, JSON.stringify(original), "utf8");

    expect((await getHistory()).entries).toHaveLength(20);

    // remove user-1
    await saveBackup("test-kif-data11");
    await expect(loadBackup("backup1.kifu")).resolves.toBe("test-kif-data1");

    // remove backup-1
    await saveBackup("test-kif-data12");
    await expect(loadBackup("backup1.kifu")).rejects.toThrow();

    // remove user-2
    await saveBackup("test-kif-data13");
    await expect(loadBackup("backup2.kifu")).resolves.toBe("test-kif-data2");

    // remove backup-2
    await saveBackup("test-kif-data14");
    await expect(loadBackup("backup2.kifu")).rejects.toThrow();
  });
});
