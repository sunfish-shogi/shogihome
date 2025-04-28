import { RecordFileFormat } from "@/common/file/record.js";
import { ImmutableRecord } from "tsshogi";

export type RecordProperties = {
  branch: boolean;
  comment: boolean;
  bookmark: boolean;
  time: boolean;
};

export function detectUnsupportedRecordProperties(
  record: ImmutableRecord,
  fileType: RecordFileFormat,
): RecordProperties {
  const props: RecordProperties = {
    branch: false,
    comment: false,
    bookmark: false,
    time: false,
  };
  if (fileType === RecordFileFormat.KIF || fileType === RecordFileFormat.KIFU) {
    return props;
  }
  record.forEach((node) => {
    if (node.branch) {
      props.branch = true;
    }
    if (node.comment) {
      props.comment = true;
    }
    if (node.bookmark) {
      props.bookmark = true;
    }
    if (node.elapsedMs) {
      props.time = true;
    }
  });
  switch (fileType) {
    case RecordFileFormat.KI2:
    case RecordFileFormat.KI2U:
      props.branch = false;
      props.comment = false;
      props.bookmark = false;
      break;
    case RecordFileFormat.CSA:
      props.comment = false;
      props.time = false;
      break;
    case RecordFileFormat.SFEN:
      break;
    case RecordFileFormat.JKF:
      props.branch = false;
      props.comment = false;
      props.time = false;
      break;
  }
  return props;
}
