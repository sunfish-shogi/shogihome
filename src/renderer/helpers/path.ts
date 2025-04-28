import { getBlackPlayerName, getWhitePlayerName, ImmutableRecord, Move } from "tsshogi";
import { getDateString } from "@/common/helpers/datetime.js";
import { defaultRecordFileNameTemplate } from "@/common/file/path.js";
import {
  getDateStringFromMetadata,
  getRecordTitleFromMetadata,
} from "@/common/helpers/metadata.js";

export function basename(path: string): string {
  return path.substring(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

export function dirname(path: string): string {
  return path.substring(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
}

function trimEnd(path: string): string {
  return path.endsWith("/") || path.endsWith("\\") ? path.substring(0, path.length - 1) : path;
}

function detectSeperator(path: string): string {
  return path.indexOf("/") >= 0 ? "/" : "\\";
}

export function join(path: string, ...paths: string[]): string {
  const sep = detectSeperator(path);
  let result = trimEnd(path);
  for (const path of paths) {
    result += path.startsWith("/") || path.startsWith("\\") ? path : sep + path;
    result = trimEnd(result);
  }
  return result;
}

function escapePath(path: string): string {
  return path.replaceAll(/[<>:"/\\|?*]/g, "_");
}

type RecordFileNameOptions = {
  template?: string;
  extension?: string;
};

export function generateRecordFileName(
  record: ImmutableRecord,
  options: RecordFileNameOptions = {},
): string {
  // get metadata
  const metadata = record.metadata;
  const datetime = getDateStringFromMetadata(metadata) || getDateString().replaceAll("/", "");
  const title = getRecordTitleFromMetadata(metadata);
  const sente = getBlackPlayerName(metadata);
  const gote = getWhitePlayerName(metadata);
  const hex5 = Math.floor(Math.random() * 0x100000)
    .toString(16)
    .toUpperCase()
    .padStart(5, "0");

  // build parameter map
  let ply = 0;
  for (let node = record.first.next; node && node.move instanceof Move; node = node.next) {
    ply = node.ply;
  }
  const params: { [key: string]: string } = {
    datetime,
    title: title || "",
    sente: sente || "",
    gote: gote || "",
    ply: ply.toString(),
    hex5,
  };
  for (const key in params) {
    const value = params[key];
    params["_" + key] = value ? "_" + value : "";
    params[key + "_"] = value ? value + "_" : "";
  }

  // generate file name
  let ret = options.template || defaultRecordFileNameTemplate;
  ret = escapePath(ret);
  for (const key in params) {
    const value = params[key];
    ret = escapePath(ret.replaceAll("{" + key + "}", value));
  }
  ret = ret.trim();
  if (options.extension) {
    ret = ret + (options.extension.startsWith(".") ? options.extension : "." + options.extension);
  } else {
    ret = ret + ".kif";
  }
  return ret;
}
