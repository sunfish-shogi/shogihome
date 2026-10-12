import { PIECE_TOSS_COUNT, pieceTossResult, tossPieces } from "@/renderer/helpers/pieceToss.js";
import { Color } from "tsshogi";

describe("helpers/pieceToss", () => {
  it("tossPieces", () => {
    const values = [0.1, 0.9, 0.4, 0.5, 0.49];
    let i = 0;
    const faces = tossPieces(() => values[i++]);
    expect(faces).toHaveLength(PIECE_TOSS_COUNT);
    expect(faces).toEqual([true, false, true, false, true]);
  });

  it("pieceTossResult", () => {
    // 表 (歩) が 3 枚以上なら先手。
    expect(pieceTossResult([true, true, true, true, true])).toBe(Color.BLACK);
    expect(pieceTossResult([true, true, true, false, false])).toBe(Color.BLACK);
    expect(pieceTossResult([false, true, false, true, true])).toBe(Color.BLACK);
    expect(pieceTossResult([true, true, false, false, false])).toBe(Color.WHITE);
    expect(pieceTossResult([false, false, false, false, false])).toBe(Color.WHITE);
  });
});
