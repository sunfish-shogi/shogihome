import path from "node:path";
import process from "node:process";
import url from "node:url";
import { cropPieceImage } from "@/background/image/cropper.js";
import { listFiles } from "@/background/helpers/file.js";

describe("cropper", () => {
  it("cropPieceImage", async () => {
    const inputURL = url.pathToFileURL(
      path.join(process.cwd(), "src/tests/testdata/image/piece.png"),
    );
    const outputURL = await cropPieceImage(inputURL.toString());
    const outputPath = url.fileURLToPath(outputURL.toString());
    const files = (await listFiles(outputPath, 0)).sort();
    expect(files).toHaveLength(30);
    expect(files).toStrictEqual([
      path.join(outputPath, "black_bishop.png"),
      path.join(outputPath, "black_dragon.png"),
      path.join(outputPath, "black_gold.png"),
      path.join(outputPath, "black_horse.png"),
      path.join(outputPath, "black_king.png"),
      path.join(outputPath, "black_king2.png"),
      path.join(outputPath, "black_knight.png"),
      path.join(outputPath, "black_lance.png"),
      path.join(outputPath, "black_pawn.png"),
      path.join(outputPath, "black_prom_knight.png"),
      path.join(outputPath, "black_prom_lance.png"),
      path.join(outputPath, "black_prom_pawn.png"),
      path.join(outputPath, "black_prom_silver.png"),
      path.join(outputPath, "black_rook.png"),
      path.join(outputPath, "black_silver.png"),
      path.join(outputPath, "white_bishop.png"),
      path.join(outputPath, "white_dragon.png"),
      path.join(outputPath, "white_gold.png"),
      path.join(outputPath, "white_horse.png"),
      path.join(outputPath, "white_king.png"),
      path.join(outputPath, "white_king2.png"),
      path.join(outputPath, "white_knight.png"),
      path.join(outputPath, "white_lance.png"),
      path.join(outputPath, "white_pawn.png"),
      path.join(outputPath, "white_prom_knight.png"),
      path.join(outputPath, "white_prom_lance.png"),
      path.join(outputPath, "white_prom_pawn.png"),
      path.join(outputPath, "white_prom_silver.png"),
      path.join(outputPath, "white_rook.png"),
      path.join(outputPath, "white_silver.png"),
    ]);
  });
});
