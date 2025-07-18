import { decodeText, encodeText } from "@/common/helpers/encode.js";
import {
  ImmutableRecord,
  Record,
  exportCSA,
  exportKI2,
  exportKIF,
  importCSA,
  importKI2,
  importKIF,
  exportJKFString,
  importJKFString,
} from "tsshogi";

export enum RecordFileFormat {
  KIF = ".kif",
  KIFU = ".kifu",
  KI2 = ".ki2",
  KI2U = ".ki2u",
  CSA = ".csa",
  SFEN = ".sfen",
  JKF = ".jkf",
}

export function getStandardRecordFileFormats() {
  return [
    RecordFileFormat.KIF,
    RecordFileFormat.KIFU,
    RecordFileFormat.KI2,
    RecordFileFormat.KI2U,
    RecordFileFormat.CSA,
    RecordFileFormat.JKF,
  ];
}

export function detectRecordFileFormatByPath(path: string): RecordFileFormat | undefined {
  const lowerCase = path.toLowerCase();
  for (const ext of Object.values(RecordFileFormat)) {
    if (lowerCase.endsWith(ext)) {
      return ext;
    }
  }
}

function getRecommendedEncodingByFileFormat(format: RecordFileFormat): "UTF8" | "SJIS" {
  switch (format) {
    default:
      return "UTF8";
    case RecordFileFormat.KIF:
    case RecordFileFormat.KI2:
      return "SJIS";
  }
}

export function importRecordFromBuffer(
  data: Uint8Array,
  format: RecordFileFormat,
  option?: { autoDetect?: boolean },
): Record | Error {
  const text = decodeText(data, {
    encoding: getRecommendedEncodingByFileFormat(format),
    autoDetect: option?.autoDetect,
  });
  switch (format) {
    case RecordFileFormat.KIF:
    case RecordFileFormat.KIFU:
      return importKIF(text);
    case RecordFileFormat.KI2:
    case RecordFileFormat.KI2U:
      return importKI2(text);
    case RecordFileFormat.CSA:
      return importCSA(text);
    case RecordFileFormat.SFEN:
      return new Error(".sfen file import is not supported");
    case RecordFileFormat.JKF:
      return importJKFString(text);
  }
}

type CSAOptions = {
  v3?: boolean;
};

export type ExportOptions = {
  returnCode?: string;
  detectGarbled?: boolean;
  csa?: CSAOptions;
};

export type ExportResult = {
  data: Uint8Array;
  garbled: boolean;
};

export function exportRecordAsBuffer(
  record: ImmutableRecord,
  format: RecordFileFormat,
  opt: ExportOptions,
): ExportResult {
  const encoding = getRecommendedEncodingByFileFormat(format);
  let str: string;
  switch (format) {
    case RecordFileFormat.KIF:
    case RecordFileFormat.KIFU:
      str = exportKIF(record, opt);
      break;
    case RecordFileFormat.KI2:
    case RecordFileFormat.KI2U:
      str = exportKI2(record, opt);
      break;
    case RecordFileFormat.CSA:
      str = exportCSA(record, {
        ...opt,
        v3: opt.csa?.v3 ? { milliseconds: true } : undefined,
      });
      break;
    case RecordFileFormat.SFEN:
      throw new Error(".sfen file export is not supported");
    case RecordFileFormat.JKF:
      str = exportJKFString(record);
  }
  const data = encodeText(str, encoding);
  let garbled = false;
  if (encoding === "SJIS" && opt.detectGarbled) {
    const restored = decodeText(data, { encoding: "SJIS" });
    if (restored !== str) {
      garbled = true;
    }
  }
  return { data, garbled };
}
