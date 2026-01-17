import { calculateGameStatistics } from "@/renderer/game/result.js";

describe("game/result", () => {
  it("statistics/case1", async () => {
    const statistics = calculateGameStatistics({
      player1: { name: "Player1", win: 15, winBlack: 8, winWhite: 7 },
      player2: { name: "Player2", win: 3, winBlack: 1, winWhite: 2 },
      draw: 2,
      invalid: 1,
      total: 21,
    });
    expect(statistics.rating.toPrecision(6)).toBe("279.588");
    expect(statistics.ratingLower.toPrecision(6)).toBe("116.129");
    expect(statistics.ratingUpper.toPrecision(6)).toBe("NaN");
    expect(statistics.zValue.toPrecision(6)).toBe("2.82843");
    expect(statistics.npIsGreaterThan5).toBeTruthy();
    expect(statistics.significance5pc).toBeTruthy();
    expect(statistics.significance1pc).toBeTruthy();
  });

  it("statistics/case2", async () => {
    const statistics = calculateGameStatistics({
      player1: { name: "Player1", win: 9, winBlack: 5, winWhite: 4 },
      player2: { name: "Player2", win: 1, winBlack: 0, winWhite: 1 },
      draw: 2,
      invalid: 1,
      total: 13,
    });
    expect(statistics.npIsGreaterThan5).toBeFalsy();
    expect(statistics.rating.toPrecision(6)).toBe("381.697");
    expect(statistics.ratingLower.toPrecision(6)).toBe("158.982");
    expect(statistics.ratingUpper.toPrecision(6)).toBe("NaN");
    expect(statistics.zValue.toPrecision(6)).toBe("2.52982");
    expect(statistics.significance5pc).toBeTruthy();
    expect(statistics.significance1pc).toBeFalsy();
  });

  it("statistics/case3", async () => {
    const statistics = calculateGameStatistics({
      player1: { name: "Player1", win: 76, winBlack: 31, winWhite: 45 },
      player2: { name: "Player2", win: 21, winBlack: 9, winWhite: 12 },
      draw: 2,
      invalid: 1,
      total: 100,
    });
    expect(statistics.npIsGreaterThan5).toBeTruthy();
    expect(statistics.rating.toPrecision(6)).toBe("223.438");
    expect(statistics.ratingLower.toPrecision(6)).toBe("148.469");
    expect(statistics.ratingUpper.toPrecision(6)).toBe("323.370");
    expect(statistics.zValue.toPrecision(6)).toBe("5.58440");
    expect(statistics.significance5pc).toBeTruthy();
    expect(statistics.significance1pc).toBeTruthy();
  });
});
