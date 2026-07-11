import { selectWeightedRandom } from "@/common/helpers/math.js";

describe("helpers/math", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selectWeightedRandom", () => {
    const items = [
      { name: "a", weight: 10 },
      { name: "b", weight: 30 },
      { name: "c", weight: 60 },
    ];
    const getWeight = (item: { weight: number }) => item.weight;
    const random = vi.spyOn(Math, "random");

    random.mockReturnValue(0);
    expect(selectWeightedRandom(items, getWeight).name).toBe("a");
    random.mockReturnValue(0.09);
    expect(selectWeightedRandom(items, getWeight).name).toBe("a");
    random.mockReturnValue(0.1);
    expect(selectWeightedRandom(items, getWeight).name).toBe("b");
    random.mockReturnValue(0.39);
    expect(selectWeightedRandom(items, getWeight).name).toBe("b");
    random.mockReturnValue(0.4);
    expect(selectWeightedRandom(items, getWeight).name).toBe("c");
    random.mockReturnValue(0.999);
    expect(selectWeightedRandom(items, getWeight).name).toBe("c");
  });

  it("selectWeightedRandom/zeroWeight", () => {
    const items = [
      { name: "a", weight: 0 },
      { name: "b", weight: 100 },
    ];
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    expect(selectWeightedRandom(items, (item) => item.weight).name).toBe("b");
  });

  it("selectWeightedRandom/totalWeightIsZero", () => {
    const items = [
      { name: "a", weight: 0 },
      { name: "b", weight: 0 },
    ];
    // 重みの合計が 0 の場合は先頭の要素を返す。
    expect(selectWeightedRandom(items, (item) => item.weight).name).toBe("a");
  });

  it("selectWeightedRandom/negativeWeight", () => {
    const items = [
      { name: "a", weight: -10 },
      { name: "b", weight: 10 },
    ];
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    // 負の重みは 0 として扱う。
    expect(selectWeightedRandom(items, (item) => item.weight).name).toBe("b");
  });

  it("selectWeightedRandom/nonFiniteWeight", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.99);
    // NaN や ±Infinity の重みは 0 として扱い、正常な重みのみで選択する。
    expect(
      selectWeightedRandom(
        [
          { name: "a", weight: NaN },
          { name: "b", weight: 100 },
        ],
        (item) => item.weight,
      ).name,
    ).toBe("b");
    expect(
      selectWeightedRandom(
        [
          { name: "a", weight: Infinity },
          { name: "b", weight: 100 },
        ],
        (item) => item.weight,
      ).name,
    ).toBe("b");
    // 全ての重みが非有限の場合は先頭の要素を返す。
    expect(
      selectWeightedRandom(
        [
          { name: "a", weight: NaN },
          { name: "b", weight: Infinity },
        ],
        (item) => item.weight,
      ).name,
    ).toBe("a");
  });
});
