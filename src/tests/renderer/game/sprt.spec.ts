import { calculateSPRT } from "@/renderer/game/sprt";

describe("game/sprt", () => {
  it("calculateSPRT", () => {
    const testCases = [
      {
        pentanomial: [0, 0, 0, 0, 0],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 0, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [10, 5, 2, 5, 10],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 0, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [0, 0, 0, 0, 3],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 0.02, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [3, 0, 0, 0, 0],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: -0.02, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [0, 0, 0, 0, 10],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 0.08, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [10, 0, 0, 0, 0],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: -0.08, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [0, 2, 4, 6, 10],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 0.13, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        pentanomial: [10, 6, 4, 2, 0],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: -0.13, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/live_elo/69675ab9d5a3b5895b50fb44
        pentanomial: [19, 4020, 10316, 4215, 24],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/live_elo/6984bbe6473df9d1d24a937b
        pentanomial: [103, 3851, 8316, 3728, 98],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: -2.03, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/6983867b473df9d1d24a9148
        pentanomial: [291, 10353, 21899, 10175, 306],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: -3.08, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/698432f5473df9d1d24a926d
        pentanomial: [99, 3323, 8399, 3606, 109],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.98, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/6984bb68473df9d1d24a9378
        pentanomial: [2, 40, 72, 14, 0],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: -0.36, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/69839ed7473df9d1d24a91ae
        pentanomial: [326, 12015, 26044, 12357, 362],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.93, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/6982cf46eb87369ff4d0c888
        pentanomial: [59, 6427, 15570, 6693, 91],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/69840701473df9d1d24a924f
        pentanomial: [328, 12094, 26412, 11964, 338],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: -2.93, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/697e32ae5f56030af97b59c9
        pentanomial: [900, 30596, 67292, 30899, 809],
        config: { elo0: 0, elo1: 2, alpha: 0.05, beta: 0.05 },
        expected: { llr: -2.96, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/6983946d473df9d1d24a916d
        pentanomial: [45, 8506, 25934, 8883, 57],
        config: { elo0: 0.5, elo1: 2.5, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/69843133473df9d1d24a9269
        pentanomial: [14, 6935, 20257, 7273, 30],
        config: { elo0: 0.5, elo1: 2.5, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.95, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/697f19db5f56030af97b5b01
        pentanomial: [105, 19880, 51075, 20005, 108],
        config: { elo0: 0.5, elo1: 2.5, alpha: 0.05, beta: 0.05 },
        expected: { llr: -2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/698154f56362aee5c8a5544d
        pentanomial: [68, 15448, 39104, 15441, 94],
        config: { elo0: 0.5, elo1: 2.5, alpha: 0.05, beta: 0.05 },
        expected: { llr: -2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/69827c6beb87369ff4d0c7d5
        pentanomial: [41, 5118, 12924, 5334, 31],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
      {
        // https://tests.stockfishchess.org/tests/view/6980e5846362aee5c8a55396
        pentanomial: [36, 5804, 14811, 5986, 39],
        config: { elo0: -1.75, elo1: 0.25, alpha: 0.05, beta: 0.05 },
        expected: { llr: 2.94, lowerBound: -2.94, upperBound: 2.94 },
      },
    ];
    for (const { pentanomial, config, expected } of testCases) {
      const { llr, lowerBound, upperBound } = calculateSPRT(
        {
          loseLose: pentanomial[0],
          loseDraw: pentanomial[1],
          drawDrawOrWinLose: pentanomial[2],
          winDraw: pentanomial[3],
          winWin: pentanomial[4],
        },
        config,
      );
      expect(llr).toBeCloseTo(expected.llr, 2);
      expect(lowerBound).toBeCloseTo(expected.lowerBound, 2);
      expect(upperBound).toBeCloseTo(expected.upperBound, 2);
    }
  });
});
