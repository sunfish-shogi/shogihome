import path from "node:path";
import { RecordFileFormat } from "@/common/file/record.js";
import { listFiles } from "@/background/helpers/file.js";

/**
 * 指定したディレクトリ以下の棋譜ファイルを列挙する。
 * @param directory 検索を開始するディレクトリのパス。
 * @param formats 対象とする棋譜ファイル形式。
 * @param subdirectories サブディレクトリを再帰的に検索するかどうか。
 */
export async function listRecordFiles(
  directory: string,
  formats: RecordFileFormat[],
  subdirectories: boolean,
): Promise<string[]> {
  return (await listFiles(directory, subdirectories ? Infinity : 0)).filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return formats.includes(ext as RecordFileFormat);
  });
}
