import { filter, ordinal } from "@/common/helpers/string.js";

describe("helpers/string", () => {
  it("ordinal", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
    expect(ordinal(24)).toBe("24th");
    expect(ordinal(111)).toBe("111th");
    expect(ordinal(112)).toBe("112th");
    expect(ordinal(113)).toBe("113th");
    expect(ordinal(121)).toBe("121st");
    expect(ordinal(122)).toBe("122nd");
    expect(ordinal(123)).toBe("123rd");
    expect(ordinal(124)).toBe("124th");
  });

  it("filter", () => {
    expect(filter("Foo Bar Baz", ["Foo"])).toBeTruthy();
    expect(filter("Foo Bar Baz", ["ar"])).toBeTruthy();
    expect(filter("Foo Bar Baz", ["Foo", "Baz"])).toBeTruthy();
    expect(filter("Foo Bar Baz", ["Foo", "Qux"])).toBeFalsy();
  });
});
