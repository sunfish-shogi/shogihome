import { exportKIF, ImmutableRecord, importKIF, Record, RecordMetadataKey } from "tsshogi";
import { useErrorStore } from "./error.js";
import { isMobileWebApp, isNative } from "@/renderer/ipc/api.js";

const mobileRecordStorageKey = "mobile:record";
const mobilePlyStorageKey = "mobile:ply";

export function loadRecordForWebApp(): Record | undefined {
  if (isNative()) {
    return;
  }

  const urlParams = new URL(window.location.toString()).searchParams;
  const usen = urlParams.get("usen");
  if (usen) {
    const branch = parseInt(urlParams.get("branch") || "0", 10);
    const ply = parseInt(urlParams.get("ply") || "0", 10);
    const record = Record.newByUSEN(usen, branch, ply);
    if (record instanceof Error) {
      useErrorStore().add(`棋譜の読み込み中にエラーが発生しました。: ${record}`);
      return;
    }
    const bname = urlParams.get("bname") || "";
    const wname = urlParams.get("wname") || "";
    record.metadata.setStandardMetadata(RecordMetadataKey.BLACK_NAME, bname);
    record.metadata.setStandardMetadata(RecordMetadataKey.WHITE_NAME, wname);
    return record;
  }

  if (!isMobileWebApp()) {
    return;
  }

  const data = localStorage.getItem(mobileRecordStorageKey);
  if (data === null) {
    return;
  }
  const record = importKIF(data);
  if (record instanceof Error) {
    return;
  }
  const ply = Number.parseInt(localStorage.getItem(mobilePlyStorageKey) || "0");
  record.goto(ply);
  return record;
}

function hasUSENParam(): boolean {
  const urlParams = new URL(window.location.toString()).searchParams;
  return !!urlParams.get("usen");
}

export function saveRecordForWebApp(record: ImmutableRecord): void {
  if (!isMobileWebApp()) {
    return;
  }
  if (hasUSENParam()) {
    return;
  }
  const data = exportKIF(record);
  localStorage.setItem(mobileRecordStorageKey, data);
  localStorage.setItem(mobilePlyStorageKey, record.current.ply.toString());
}

export function clearURLParams(): void {
  const url = new URL(window.location.toString());
  url.searchParams.delete("usen");
  url.searchParams.delete("branch");
  url.searchParams.delete("ply");
  url.searchParams.delete("bname");
  url.searchParams.delete("wname");
  window.history.replaceState({}, "", url.toString());
}
