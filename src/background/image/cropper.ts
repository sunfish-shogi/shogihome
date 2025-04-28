import path from "node:path";
import url from "node:url";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { getAppLogger } from "@/background/log.js";
import { Jimp } from "jimp";
import { imageCacheDir } from "./cache.js";
import { exists } from "@/background/helpers/file.js";
import { getPieceImageAssetNameByIndex } from "@/common/assets/pieces.js";

const marginRatio = 0.05;

type PieceImageOptions = {
  deleteMargin?: boolean;
  overwrite?: boolean;
};

function getCroppedPieceImageDir(srcURL: string, opt?: PieceImageOptions): string {
  let md5 = crypto.createHash("md5").update(srcURL).digest("hex");
  if (opt?.deleteMargin) {
    md5 += "_nmgn";
  }
  return path.join(imageCacheDir, "pieces", md5);
}

export async function cropPieceImage(srcURL: string, opt?: PieceImageOptions): Promise<string> {
  const srcPath = url.fileURLToPath(srcURL);
  const destDir = getCroppedPieceImageDir(srcURL, opt);
  getAppLogger().debug(`generate cropped piece images: src=${srcPath} dst=${destDir}`);

  // create folder if there is no folder
  if (!(await exists(destDir))) {
    await fs.mkdir(destDir, { recursive: true });
  }
  const pic = await Jimp.read(srcPath);
  let width: number = pic.width;
  let height: number = pic.height;

  if (!width || !height) {
    throw new Error("cannot get image metadata");
  } else {
    width = width / 8;
    height = height / 4;
  }

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row == 1 && col == 3) || (row == 3 && col == 3)) {
        continue; // "promoted gold" escape
      }
      const destName = `${getPieceImageAssetNameByIndex(row, col)}.png`;
      if (opt?.overwrite || !(await exists(path.join(destDir, destName)))) {
        const image = await Jimp.read(srcPath);
        let x = col * width;
        let y = row * height;
        let w = width;
        let h = height;
        if (opt?.deleteMargin) {
          x += width * marginRatio;
          y += height * marginRatio;
          w *= 1 - marginRatio * 2;
          h *= 1 - marginRatio * 2;
        }
        await image.crop({ x, y, w, h }).write(path.join(destDir, destName) as `${string}.png`);
        getAppLogger().debug(`${destName} extracted`);
      } else {
        getAppLogger().debug(`${destName} exists`);
      }
    }
  }

  return url.pathToFileURL(destDir).toString();
}
