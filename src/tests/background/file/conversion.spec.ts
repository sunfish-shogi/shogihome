import { convertRecordFiles } from "@/background/file/conversion.js";
import { RecordFileFormat } from "@/common/file/record.js";
import {
  DestinationType,
  FileNameConflictAction,
  defaultBatchConversionSettings,
} from "@/common/settings/conversion.js";
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "@/background/helpers/file.js";
import { defaultAppSettings } from "@/common/settings/app.js";
import { saveAppSettings } from "@/background/settings.js";
import { getTempPathForTesting } from "@/background/proc/env.js";

const tmpdir = path.join(getTempPathForTesting(), "conversion");

describe("conversion", () => {
  it("separate", async () => {
    const testCases = [
      {
        sourceFormats: [
          RecordFileFormat.KIF,
          RecordFileFormat.KIFU,
          RecordFileFormat.KI2,
          RecordFileFormat.KI2U,
          RecordFileFormat.CSA,
        ],
        subdirectories: true,
        destination: "all-to-csa/with-subdir",
        destinationFormat: RecordFileFormat.CSA,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.OVERWRITE,
        expectedReport: {
          successTotal: 8,
          success: {
            ".kif": 4,
            ".kifu": 1,
            ".ki2": 1,
            ".ki2u": 1,
            ".csa": 1,
          },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: [
          "csa-sjis.csa",
          "ki2-sjis.csa",
          "ki2u-utf8.csa",
          "kif-sjis.csa",
          "kifu-utf8.csa",
          "sub01/kif-sjis.csa",
          "sub01/sub0101/kif-sjis.csa",
          "sub02/kif-sjis.csa",
        ],
      },
      {
        sourceFormats: [
          RecordFileFormat.KIF,
          RecordFileFormat.KIFU,
          RecordFileFormat.KI2,
          RecordFileFormat.KI2U,
          RecordFileFormat.CSA,
        ],
        subdirectories: false,
        destination: "all-to-csa/without-subdir",
        destinationFormat: RecordFileFormat.CSA,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.OVERWRITE,
        expectedReport: {
          successTotal: 5,
          success: {
            ".kif": 1,
            ".kifu": 1,
            ".ki2": 1,
            ".ki2u": 1,
            ".csa": 1,
          },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: [
          "csa-sjis.csa",
          "ki2-sjis.csa",
          "ki2u-utf8.csa",
          "kif-sjis.csa",
          "kifu-utf8.csa",
        ],
      },
      {
        sourceFormats: [
          RecordFileFormat.KIF,
          RecordFileFormat.KIFU,
          RecordFileFormat.KI2,
          RecordFileFormat.KI2U,
          RecordFileFormat.CSA,
        ],
        subdirectories: true,
        destination: "all-to-csa/not-create-subdir",
        destinationFormat: RecordFileFormat.CSA,
        createSubdirectories: false,
        fileNameConflictAction: FileNameConflictAction.NUMBER_SUFFIX,
        expectedReport: {
          successTotal: 8,
          success: {
            ".kif": 4,
            ".kifu": 1,
            ".ki2": 1,
            ".ki2u": 1,
            ".csa": 1,
          },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: [
          "csa-sjis.csa",
          "ki2-sjis.csa",
          "ki2u-utf8.csa",
          "kif-sjis-2.csa",
          "kif-sjis-3.csa",
          "kif-sjis-4.csa",
          "kif-sjis.csa",
          "kifu-utf8.csa",
        ],
      },
      {
        sourceFormats: [
          RecordFileFormat.KIF,
          RecordFileFormat.KIFU,
          RecordFileFormat.KI2,
          RecordFileFormat.KI2U,
          RecordFileFormat.CSA,
        ],
        subdirectories: false,
        destination: "all-to-csa/v3",
        destinationFormat: RecordFileFormat.CSA,
        csaV3: true,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.OVERWRITE,
        expectedReport: {
          successTotal: 5,
          success: {
            ".kif": 1,
            ".kifu": 1,
            ".ki2": 1,
            ".ki2u": 1,
            ".csa": 1,
          },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: [
          "csa-sjis.csa",
          "ki2-sjis.csa",
          "ki2u-utf8.csa",
          "kif-sjis.csa",
          "kifu-utf8.csa",
        ],
      },
      {
        sourceFormats: [RecordFileFormat.CSA],
        subdirectories: false,
        destination: "csa-to-ki2",
        destinationFormat: RecordFileFormat.KI2,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.OVERWRITE,
        expectedReport: {
          successTotal: 1,
          success: { ".csa": 1 },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: ["csa-sjis.ki2"],
      },
      {
        sourceFormats: [RecordFileFormat.KI2U],
        subdirectories: false,
        destination: "ki2u-to-kifu/overwrite",
        destinationFormat: RecordFileFormat.KIFU,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.OVERWRITE,
        repeat: 2,
        expectedReport: {
          successTotal: 1,
          success: { ".ki2u": 1 },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: ["ki2u-utf8.kifu"],
      },
      {
        sourceFormats: [RecordFileFormat.KI2U],
        subdirectories: false,
        destination: "ki2u-to-kifu/number-suffix",
        destinationFormat: RecordFileFormat.KIFU,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.NUMBER_SUFFIX,
        repeat: 2,
        expectedReport: {
          successTotal: 1,
          success: { ".ki2u": 1 },
          failedTotal: 0,
          failed: {},
          skippedTotal: 0,
          skipped: {},
        },
        expectedFiles: ["ki2u-utf8-2.kifu", "ki2u-utf8-3.kifu", "ki2u-utf8.kifu"],
      },
      {
        sourceFormats: [RecordFileFormat.KI2U],
        subdirectories: false,
        destination: "ki2u-to-kifu/skip",
        destinationFormat: RecordFileFormat.KIFU,
        createSubdirectories: true,
        fileNameConflictAction: FileNameConflictAction.SKIP,
        repeat: 1,
        expectedReport: [
          {
            successTotal: 1,
            success: { ".ki2u": 1 },
            failedTotal: 0,
            failed: {},
            skippedTotal: 0,
            skipped: {},
          },
          {
            successTotal: 0,
            success: {},
            failedTotal: 0,
            failed: {},
            skippedTotal: 1,
            skipped: { ".ki2u": 1 },
          },
        ],
        expectedFiles: ["ki2u-utf8.kifu"],
      },
    ];
    for (const testCase of testCases) {
      await saveAppSettings({
        ...defaultAppSettings(),
        returnCode: "\n",
        useCSAV3: !!testCase.csaV3,
      });
      const destinationFullPath = path.join(tmpdir, testCase.destination);
      for (let i = 0; i < 1 + (testCase.repeat || 0); i++) {
        const result = await convertRecordFiles({
          ...defaultBatchConversionSettings(),
          source: "src/tests/testdata/conversion/input",
          sourceFormats: testCase.sourceFormats,
          subdirectories: testCase.subdirectories,
          destinationType: DestinationType.DIRECTORY,
          destination: destinationFullPath,
          createSubdirectories: testCase.createSubdirectories,
          destinationFormat: testCase.destinationFormat,
          fileNameConflictAction: testCase.fileNameConflictAction,
        });
        expect(result).toStrictEqual(
          testCase.expectedReport instanceof Array
            ? testCase.expectedReport[i]
            : testCase.expectedReport,
        );
      }
      const expectedFullPath = testCase.expectedFiles.map((f) => path.join(destinationFullPath, f));
      const actualFilePaths = (await listFiles(destinationFullPath, Infinity)).sort();
      expect(actualFilePaths).toStrictEqual(expectedFullPath);
      for (const filePath of actualFilePaths) {
        const relPath = path.relative(tmpdir, filePath);
        const expectedFilePath = path.join("src/tests/testdata/conversion/output", relPath);
        const actual = fs.readFileSync(filePath);
        const expected = fs.readFileSync(expectedFilePath);
        expect(actual).toStrictEqual(expected);
      }
    }
  });

  it("sfen", async () => {
    const testCases = [
      {
        appSettings: defaultAppSettings(),
        destination: "all.sfen",
        expected: [
          "startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 3a4b 5g5f 4b3c 5f5e 3c4d 4h5g 4d5e P*5f 5e4d 4i5h",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 2e2d 2c2d 2h2d P*2c 2d2f 6c6d 3g3f 3c3d 3h3g 5a4b 3g4f 2b4d 3f3e 3d3e 5i6i",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 5i6h 5a5b 3g3f 8e8f 8g8f 8b8f 7g7f",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 5a4b 5i5h 6a5b 3g3f 3c3d",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 5i5h 5a5b 7g7f 8e8f 8g8f 8b8f 2e2d 2c2d 2h2d P*2c 2d2f 3c3d P*8g 8f8d",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 7g7f 4a3b 8h7g 3c3d 7i6h 2b7g+ 6h7g 3a2b",
          "startpos moves 7g7f 8c8d 2h7h 8d8e 8h7g 3c3d 6g6f 7a6b 7i6h 5a4b 5i4h 4b3b",
        ],
      },
      {
        appSettings: {
          ...defaultAppSettings(),
          enableUSIFileResign: true,
        },
        destination: "all-noStartpos-resign.sfen",
        expected: [
          "startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 3a4b 5g5f 4b3c 5f5e 3c4d 4h5g 4d5e P*5f 5e4d 4i5h",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 2e2d 2c2d 2h2d P*2c 2d2f 6c6d 3g3f 3c3d 3h3g 5a4b 3g4f 2b4d 3f3e 3d3e 5i6i",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 5i6h 5a5b 3g3f 8e8f 8g8f 8b8f 7g7f",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 5a4b 5i5h 6a5b 3g3f 3c3d",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 5i5h 5a5b 7g7f 8e8f 8g8f 8b8f 2e2d 2c2d 2h2d P*2c 2d2f 3c3d P*8g 8f8d",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b resign",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b resign",
          "startpos moves 2g2f 8c8d 2f2e 8d8e 7g7f 4a3b 8h7g 3c3d 7i6h 2b7g+ 6h7g 3a2b",
          "startpos moves 7g7f 8c8d 2h7h 8d8e 8h7g 3c3d 6g6f 7a6b 7i6h 5a4b 5i4h 4b3b",
        ],
      },
      {
        appSettings: {
          ...defaultAppSettings(),
          enableUSIFileStartpos: false,
        },
        destination: "all-noStartpos-resign.sfen",
        expected: [
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 3a4b 5g5f 4b3c 5f5e 3c4d 4h5g 4d5e P*5f 5e4d 4i5h",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 2e2d 2c2d 2h2d P*2c 2d2f 6c6d 3g3f 3c3d 3h3g 5a4b 3g4f 2b4d 3f3e 3d3e 5i6i",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 5i6h 5a5b 3g3f 8e8f 8g8f 8b8f 7g7f",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 3i3h 7a7b 9g9f 5a4b 5i5h 6a5b 3g3f 3c3d",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 5i5h 5a5b 7g7f 8e8f 8g8f 8b8f 2e2d 2c2d 2h2d P*2c 2d2f 3c3d P*8g 8f8d",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 2g2f 8c8d 2f2e 8d8e 7g7f 4a3b 8h7g 3c3d 7i6h 2b7g+ 6h7g 3a2b",
          "sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f 8c8d 2h7h 8d8e 8h7g 3c3d 6g6f 7a6b 7i6h 5a4b 5i4h 4b3b",
        ],
      },
    ];
    for (const testCase of testCases) {
      await saveAppSettings(testCase.appSettings);
      const destinationFullPath = path.join(tmpdir, testCase.destination);
      const result = await convertRecordFiles({
        ...defaultBatchConversionSettings(),
        source: "src/tests/testdata/conversion/input",
        sourceFormats: [
          RecordFileFormat.KIF,
          RecordFileFormat.KIFU,
          RecordFileFormat.KI2,
          RecordFileFormat.KI2U,
          RecordFileFormat.CSA,
        ],
        subdirectories: true,
        destinationType: DestinationType.SINGLE_FILE,
        singleFileDestination: destinationFullPath,
      });
      expect(result).toStrictEqual({
        successTotal: 8,
        success: {
          ".kif": 4,
          ".kifu": 1,
          ".ki2": 1,
          ".ki2u": 1,
          ".csa": 1,
        },
        failedTotal: 0,
        failed: {},
        skippedTotal: 0,
        skipped: {},
      });
      const list = new TextDecoder()
        .decode(fs.readFileSync(destinationFullPath))
        .trimEnd()
        .split(/\r?\n/)
        .sort();
      expect(list).toStrictEqual(testCase.expected);
    }
  });
});
