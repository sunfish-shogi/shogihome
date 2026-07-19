import { listRecordFiles } from "@/background/file/list.js";
import { RecordFileFormat } from "@/common/file/record.js";
import path from "node:path";

describe("listRecordFiles", () => {
  it("with-subdirectories", async () => {
    const files = await listRecordFiles(
      "src/tests/testdata/conversion/input",
      [RecordFileFormat.KIF, RecordFileFormat.KIFU],
      true,
    );
    expect(
      files.map((file) => path.relative("src/tests/testdata/conversion/input", file)).sort(),
    ).toStrictEqual([
      "kif-sjis.kif",
      "kifu-utf8.kifu",
      path.join("sub01", "kif-sjis.kif"),
      path.join("sub01", "sub0101", "kif-sjis.kif"),
      path.join("sub02", "kif-sjis.kif"),
    ]);
  });

  it("without-subdirectories", async () => {
    const files = await listRecordFiles(
      "src/tests/testdata/conversion/input",
      [RecordFileFormat.CSA],
      false,
    );
    expect(
      files.map((file) => path.relative("src/tests/testdata/conversion/input", file)),
    ).toStrictEqual(["csa-sjis.csa"]);
  });
});
