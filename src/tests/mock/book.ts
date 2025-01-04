import fs from "node:fs";

export async function createTestAperyBookFile(path: string, size: number) {
  const moves = [0x1c39, 0x15a1, 0x0e14, 0x122e, 0x2143];
  const entriesPerKey = moves.length;
  if (size % (entriesPerKey * 16) !== 0) {
    throw new Error(`size must be a multiple of ${entriesPerKey} * 16`);
  }
  const keyCounts = size / (entriesPerKey * 16);

  const file = fs.createWriteStream(path);
  return new Promise<void>((resolve, reject) => {
    file.on("error", reject);
    file.on("finish", resolve);

    try {
      for (let k = 0; k < keyCounts; k++) {
        const key = Buffer.alloc(8);
        key.writeUint32LE(k);
        key.writeUint32LE(0, 4);
        for (const move of moves) {
          const entry = Buffer.alloc(8);
          entry.writeUint16LE(move);
          entry.writeUint16LE(100, 2);
          entry.writeUint32LE(123, 4);
          file.write(key);
          file.write(entry);
        }
      }
    } finally {
      file.close();
    }
  });
}
