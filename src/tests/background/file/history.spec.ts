import path from "node:path";
import fs from "node:fs";
import {
  addHistory,
  clearHistory,
  getHistory,
  loadBackup,
  loadUserFileContents,
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

    // ユーザーファイルを 100 件ちょうどまで追加する。
    for (let i = 3; i <= 100; i++) {
      addHistory(`/path/to/file${i}.kif`);
    }

    history = await getHistory();
    expect(history.entries).toHaveLength(102);
    expect((history.entries[0] as BackupEntryV2).kif).toBe(backup1);
    expect((history.entries[1] as BackupEntryV2).kif).toBe(backup2);
    expect((history.entries[2] as UserFileEntry).userFilePath).toBe("/path/to/file2.kif");

    // ユーザーファイルが 100 件を超えたので最も古いユーザーファイルが削除される。
    addHistory("/path/to/file101.kif");

    history = await getHistory();
    expect(history.entries).toHaveLength(102);
    expect((history.entries[0] as BackupEntryV2).kif).toBe(backup1);
    expect((history.entries[1] as BackupEntryV2).kif).toBe(backup2);
    expect((history.entries[2] as UserFileEntry).userFilePath).toBe("/path/to/file1.kif");
    expect(history.entries.filter((e) => e.class === "user")).toHaveLength(100);

    // バックアップを 20 件ちょうどまで追加する。
    for (let i = 3; i <= 20; i++) {
      await saveBackup(`test-kif-data${i}`);
    }

    history = await getHistory();
    expect(history.entries).toHaveLength(120);
    expect((history.entries[0] as BackupEntryV2).kif).toBe(backup1);

    // バックアップが 20 件を超えたので最も古いバックアップが削除される。
    await saveBackup("test-kif-data21");

    history = await getHistory();
    expect(history.entries).toHaveLength(120);
    expect((history.entries[0] as BackupEntryV2).kif).toBe(backup2);
    expect(history.entries.filter((e) => e.class === "user")).toHaveLength(100);
    expect(history.entries.filter((e) => e.class === "backupV2")).toHaveLength(20);

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

    // 新しいバックアップ 10 件を追加する。旧バックアップと合わせて上限の 20 件になる。
    for (let i = 11; i <= 20; i++) {
      await saveBackup(`test-kif-data${i}`);
    }
    expect((await getHistory()).entries).toHaveLength(30);
    await expect(loadBackup("backup1.kifu")).resolves.toBe("test-kif-data1");

    // remove backup-1 (ユーザーファイルは削除されない)
    await saveBackup("test-kif-data21");
    await expect(loadBackup("backup1.kifu")).rejects.toThrow();
    await expect(loadBackup("backup2.kifu")).resolves.toBe("test-kif-data2");
    let history = await getHistory();
    expect(history.entries).toHaveLength(30);
    expect(history.entries[0].id).toBe("user-1");

    // remove backup-2
    await saveBackup("test-kif-data22");
    await expect(loadBackup("backup2.kifu")).rejects.toThrow();
    history = await getHistory();
    expect(history.entries.filter((e) => e.class === "user")).toHaveLength(10);
  });

  it("loadUserFileContents", async () => {
    await clearHistory();
    const testDir = path.join(userDir, "history-contents-test");
    fs.mkdirSync(testDir, { recursive: true });
    const utf8Path = path.join(testDir, "utf8.kif");
    const sjisPath = path.join(testDir, "sjis.kif");
    const unsupportedPath = path.join(testDir, "unsupported.txt");
    const missingPath = path.join(testDir, "missing.kif");
    fs.copyFileSync("src/tests/testdata/encoding/utf8.kif", utf8Path);
    fs.copyFileSync("src/tests/testdata/encoding/sjis.kif", sjisPath);
    fs.writeFileSync(unsupportedPath, "text", "utf8");
    addHistory(utf8Path);
    addHistory(sjisPath);
    addHistory(unsupportedPath);
    addHistory(missingPath);
    await saveBackup("test-kif-data");

    const history = await getHistory();
    const ids = Object.fromEntries(
      history.entries
        .filter((e) => e.class === HistoryClass.USER)
        .map((e) => [(e as UserFileEntry).userFilePath, e.id]),
    );

    const contents = await loadUserFileContents({ autoDetect: true });
    expect(Object.keys(contents)).toHaveLength(2);
    expect(contents[ids[utf8Path]]).toContain("*#評価値=-60");
    expect(contents[ids[sjisPath]]).toContain("*#評価値=-60");
  });
});
