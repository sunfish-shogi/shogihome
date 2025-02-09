import fs from "node:fs";

function newTempFilePath(filePath: string): string {
  const time = Date.now().toString(16);
  const random = Math.floor(Math.random() * 0x100000).toString(16);
  return `${filePath}-${time}-${random}.tmp`;
}

export async function writeFileAtomic(
  filePath: string,
  data: string,
  encoding?: BufferEncoding,
): Promise<void> {
  const tempFilePath = newTempFilePath(filePath);
  await fs.promises.writeFile(tempFilePath, data, encoding);
  await fs.promises.rename(tempFilePath, filePath);
}

export function writeFileAtomicSync(filePath: string, data: string, encoding?: BufferEncoding) {
  const tempFilePath = newTempFilePath(filePath);
  fs.writeFileSync(tempFilePath, data, encoding);
  fs.renameSync(tempFilePath, filePath);
}
