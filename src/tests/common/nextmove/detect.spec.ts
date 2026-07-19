import { Color, importKIF, RecordMetadataKey } from "tsshogi";
import {
  BlunderDetectionCriteria,
  detectBlunders,
  judgeProblemAdoption,
} from "@/common/nextmove/detect.js";
import { PlayerCriteria } from "@/common/settings/book.js";

// coefficientInSigmoid=600 での勝率: 800 -> 79.1%, -200 -> 41.7%, 500 -> 69.7%
// 3手目 (▲2六歩) で先手の勝率が 79.1% -> 41.7% (下降 37.4pt)、
// 4手目 (△8四歩) で後手の勝率が 58.3% -> 30.3% (下降 28.0pt) となる棋譜。
// 2手目 (△3四歩) は後手勝率 20.9% -> 20.9% (下降なし) なので悪手ではない。
const kif = `
先手：先手太郎
後手：後手次郎
手合割：平手
   1 ７六歩(77)
*#評価値=800
   2 ３四歩(33)
*#評価値=800
   3 ２六歩(27)
*#評価値=-200
   4 ８四歩(83)
*#評価値=500
   5 ２五歩(26)
*#評価値=550
`;

const defaultCriteria: BlunderDetectionCriteria = {
  winRateDropThreshold: 20,
  minWinRate: 20,
  coefficientInSigmoid: 600,
  minPly: 0,
  maxPly: 1000,
  playerCriteria: PlayerCriteria.ALL,
};

function importTestRecord(data: string = kif) {
  const record = importKIF(data);
  if (record instanceof Error) {
    throw record;
  }
  return record;
}

describe("common/nextmove/detect", () => {
  describe("detectBlunders", () => {
    it("both-players", () => {
      const record = importTestRecord();
      const results = detectBlunders(record, defaultCriteria);
      expect(results).toStrictEqual([
        { ply: 3, scoreBeforeMove: 800, scoreAfterMove: -200 },
        { ply: 4, scoreBeforeMove: -200, scoreAfterMove: 500 },
      ]);
    });

    it("winRateDropThreshold", () => {
      const record = importTestRecord();
      // 3手目 (下降 37.4pt) は残るが 4手目 (下降 28.0pt) は閾値未満となる。
      const results = detectBlunders(record, { ...defaultCriteria, winRateDropThreshold: 35 });
      expect(results).toStrictEqual([{ ply: 3, scoreBeforeMove: 800, scoreAfterMove: -200 }]);
    });

    it("minWinRate", () => {
      const record = importTestRecord();
      // 4手目の直前は後手勝率 58.3% で、下限 65% を下回るため除外される。
      // (3手目の直前は先手勝率 79.1% なので残る)
      const results = detectBlunders(record, { ...defaultCriteria, minWinRate: 65 });
      expect(results).toStrictEqual([{ ply: 3, scoreBeforeMove: 800, scoreAfterMove: -200 }]);
    });

    it("plyRange", () => {
      const record = importTestRecord();
      expect(detectBlunders(record, { ...defaultCriteria, maxPly: 3 })).toStrictEqual([
        { ply: 3, scoreBeforeMove: 800, scoreAfterMove: -200 },
      ]);
      expect(detectBlunders(record, { ...defaultCriteria, minPly: 4 })).toStrictEqual([
        { ply: 4, scoreBeforeMove: -200, scoreAfterMove: 500 },
      ]);
    });

    it("playerCriteria/black-white", () => {
      const record = importTestRecord();
      expect(
        detectBlunders(record, { ...defaultCriteria, playerCriteria: PlayerCriteria.BLACK }),
      ).toStrictEqual([{ ply: 3, scoreBeforeMove: 800, scoreAfterMove: -200 }]);
      expect(
        detectBlunders(record, { ...defaultCriteria, playerCriteria: PlayerCriteria.WHITE }),
      ).toStrictEqual([{ ply: 4, scoreBeforeMove: -200, scoreAfterMove: 500 }]);
    });

    it("playerCriteria/filterByName", () => {
      const record = importTestRecord();
      expect(record.metadata.getStandardMetadata(RecordMetadataKey.BLACK_NAME)).toBe("先手太郎");
      expect(
        detectBlunders(record, {
          ...defaultCriteria,
          playerCriteria: PlayerCriteria.FILTER_BY_NAME,
          playerName: "太郎",
        }),
      ).toStrictEqual([{ ply: 3, scoreBeforeMove: 800, scoreAfterMove: -200 }]);
      expect(
        detectBlunders(record, {
          ...defaultCriteria,
          playerCriteria: PlayerCriteria.FILTER_BY_NAME,
          playerName: "三郎",
        }),
      ).toStrictEqual([]);
    });

    it("no-comments", () => {
      const record = importTestRecord(`
手合割：平手
   1 ７六歩(77)
   2 ３四歩(33)
   3 ２六歩(27)
`);
      expect(detectBlunders(record, defaultCriteria)).toStrictEqual([]);
    });
  });

  describe("judgeProblemAdoption", () => {
    const criteria = {
      adoptionWinRateDiff: 15,
      acceptableWinRateDiff: 5,
      minWinRate: 20,
      coefficientInSigmoid: 600,
    };

    it("adopted", () => {
      // 勝率: 300 -> 62.3%, 270 -> 61.1%, 100 -> 54.2%, -100 -> 45.8%
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: 300 },
          { usi: "7g7f", score: 270 },
          { usi: "5g5f", score: 100 },
        ],
        actualMove: { usi: "9g9f", score: -100 },
        criteria,
      });
      expect(result.adopted).toBe(true);
      // 最善手 (62.3%) との勝率差が 5pt 以内の 270 (61.1%) のみ正解扱い。
      expect(result.candidates.map((c) => c.accepted)).toStrictEqual([true, true, false]);
    });

    it("adopted/white", () => {
      // 後手番: 先手視点の評価値が小さいほど後手の勝率が高い。
      const result = judgeProblemAdoption({
        color: Color.WHITE,
        candidates: [
          { usi: "8c8d", score: -300 },
          { usi: "3c3d", score: -100 },
        ],
        actualMove: { usi: "9c9d", score: 100 },
        criteria,
      });
      expect(result.adopted).toBe(true);
      expect(result.candidates.map((c) => c.accepted)).toStrictEqual([true, false]);
    });

    it("not-adopted/bestMoveEqualsActualMove", () => {
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: 300 },
          { usi: "7g7f", score: 0 },
        ],
        actualMove: { usi: "2g2f", score: 300 },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });

    it("not-adopted/smallWinRateDiff", () => {
      // 300 (62.3%) と 250 (60.3%) の差は約 2pt で採用閾値 15pt に満たない。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: 300 },
          { usi: "7g7f", score: 250 },
        ],
        actualMove: { usi: "7g7f", score: 250 },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });

    it("not-adopted/allCandidatesAccepted", () => {
      // 300 (62.3%) と 280 (61.5%) はいずれも正解扱いとなり、正解が絞り込めない。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: 300 },
          { usi: "7g7f", score: 280 },
        ],
        actualMove: { usi: "9g9f", score: -100 },
        criteria,
      });
      expect(result.adopted).toBe(false);
      expect(result.candidates.map((c) => c.accepted)).toStrictEqual([true, true]);
    });

    it("actualMoveWinRateFromCandidates", () => {
      // 実戦の手が候補手に含まれる場合は候補手の勝率を優先する。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: 300 },
          { usi: "7g7f", score: 250 },
        ],
        // 解析コメント由来では差が大きいが、再探索の候補手 (250) では差が小さい。
        actualMove: { usi: "7g7f", score: -500 },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });

    it("mate", () => {
      // 最善手が詰みで実戦の手が通常の評価値の場合。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "G*5b", mate: 3 },
          { usi: "2g2f", score: 500 },
        ],
        actualMove: { usi: "7g7f", score: 300 },
        criteria,
      });
      expect(result.adopted).toBe(true);
      expect(result.candidates.map((c) => c.accepted)).toStrictEqual([true, false]);
    });

    it("mate/lose", () => {
      // 後手勝ちの詰み (mate < 0) は先手にとって最悪 (勝率 0%) の評価となる。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: 100 },
          { usi: "7g7f", mate: -5 },
        ],
        actualMove: { usi: "7g7f", mate: -5 },
        criteria,
      });
      expect(result.adopted).toBe(true);
      expect(result.candidates.map((c) => c.accepted)).toStrictEqual([true, false]);
    });

    it("not-adopted/hopelessPosition", () => {
      // 最善手を指しても手番側の勝率が下限 (20%) 未満 (すでに逆転困難) なら不採用。
      // -1600 -> 6.5%
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: -1600 },
          { usi: "7g7f", score: -2500 },
        ],
        actualMove: { usi: "7g7f", score: -2500 },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });

    it("not-adopted/hopelessPosition/white", () => {
      // 後手番: 先手視点の評価値が大きいほど後手が劣勢。
      const result = judgeProblemAdoption({
        color: Color.WHITE,
        candidates: [
          { usi: "8c8d", score: 1600 },
          { usi: "3c3d", score: 2500 },
        ],
        actualMove: { usi: "3c3d", score: 2500 },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });

    it("not-adopted/hopelessPosition/mate", () => {
      // 最善手を指しても相手の詰みがある局面 (勝率 0%) は不採用とする。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", mate: -9 },
          { usi: "7g7f", mate: -5 },
        ],
        actualMove: { usi: "7g7f", mate: -5 },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });

    it("adopted/recoverablePosition", () => {
      // 劣勢でも最善手後の勝率が下限以上 (-700 -> 23.8%) なら採用する。
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [
          { usi: "2g2f", score: -700 },
          { usi: "7g7f", score: -2500 },
        ],
        actualMove: { usi: "7g7f", score: -2500 },
        criteria,
      });
      expect(result.adopted).toBe(true);
    });

    it("not-adopted/noScore", () => {
      const result = judgeProblemAdoption({
        color: Color.BLACK,
        candidates: [{ usi: "2g2f" }, { usi: "7g7f" }],
        actualMove: { usi: "9g9f" },
        criteria,
      });
      expect(result.adopted).toBe(false);
    });
  });
});
