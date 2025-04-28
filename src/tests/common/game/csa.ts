import { isOfficialFloodgateGameName, isValidFloodgatePassword } from "@/common/game/csa.js";

describe("game/csa", () => {
  it("isOfficialFloodgateGameName", () => {
    // 持ち時間のルールは変更される可能性があるため、任意のパターンを true とする。
    expect(isOfficialFloodgateGameName("floodgate-300-10")).toBe(true);
    expect(isOfficialFloodgateGameName("floodgate-300-10F")).toBe(true);
    expect(isOfficialFloodgateGameName("floodgate-600-5F")).toBe(true);

    // 明らかに公式ルールではないパターンは false とする。
    expect(isOfficialFloodgateGameName("floodgate-300-10F-b")).toBe(false);
    expect(isOfficialFloodgateGameName("test-300-10F")).toBe(false);
  });

  it("isValidFloodgatePassword", () => {
    expect(isValidFloodgatePassword("floodgate-300-10F,trip")).toBe(true);
    expect(isValidFloodgatePassword("test-300-10F,trip")).toBe(true);
    expect(isValidFloodgatePassword("test-300-10,trip")).toBe(true);
    expect(isValidFloodgatePassword("test-600-0,trip")).toBe(true);

    expect(isValidFloodgatePassword("test-300-10F")).toBe(false);
    expect(isValidFloodgatePassword("test,test-300-10F,trip")).toBe(false);
    expect(isValidFloodgatePassword("test-300-x,trip")).toBe(false);
    expect(isValidFloodgatePassword("test-300-,trip")).toBe(false);
    expect(isValidFloodgatePassword("test-300-F,trip")).toBe(false);
    expect(isValidFloodgatePassword("test-x-10F,trip")).toBe(false);
    expect(isValidFloodgatePassword("test--10F,trip")).toBe(false);
  });
});
