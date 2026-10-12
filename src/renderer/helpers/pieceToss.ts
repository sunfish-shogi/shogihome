import { Color } from "tsshogi";

// 振り駒で振る歩の枚数。
export const PIECE_TOSS_COUNT = 5;

// 振り駒の結果を決める。各要素は歩が表 (歩の面) を向いたかどうか。
export function tossPieces(random: () => number = Math.random): boolean[] {
  return Array.from({ length: PIECE_TOSS_COUNT }, () => random() < 0.5);
}

// 振り駒を行った側の手番を返す。表 (歩) が過半数なら先手、そうでなければ後手。
export function pieceTossResult(faces: boolean[]): Color {
  const heads = faces.filter((face) => face).length;
  return heads * 2 > faces.length ? Color.BLACK : Color.WHITE;
}
