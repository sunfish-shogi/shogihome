import { RecordFileFormat } from "@/common/file/record.js";
import { Record, SpecialMoveType } from "tsshogi";
import { detectUnsupportedRecordProperties } from "@/renderer/helpers/record.js";

describe("helpers/record", () => {
  it("detectUnsupportedRecordProperties", () => {
    const record = new Record();
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KIF)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KIFU)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KI2)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KI2U)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.CSA)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.SFEN)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.JKF)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });

    record.append(SpecialMoveType.RESIGN);
    record.append(SpecialMoveType.INTERRUPT);
    record.first.comment = "foo";
    record.first.bookmark = "bar";
    record.current.setElapsedMs(123);
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KIF)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KIFU)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KI2)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: true,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.KI2U)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: false,
      time: true,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.CSA)).toStrictEqual({
      branch: true,
      comment: false,
      bookmark: true,
      time: false,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.SFEN)).toStrictEqual({
      branch: true,
      comment: true,
      bookmark: true,
      time: true,
    });
    expect(detectUnsupportedRecordProperties(record, RecordFileFormat.JKF)).toStrictEqual({
      branch: false,
      comment: false,
      bookmark: true,
      time: false,
    });
  });
});
