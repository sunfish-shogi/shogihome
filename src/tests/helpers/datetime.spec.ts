import { getDateString, getDateTimeString } from "@/helpers/datetime";

describe("helpers/datetime", () => {
  it("getDateTimeString", async () => {
    expect(getDateString()).toMatch(/^[0-9]{4}\/[0-9]{2}\/[0-9]{2}$/);
  });

  it("getDateTimeString", async () => {
    expect(getDateTimeString()).toMatch(
      /^[0-9]{4}\/[0-9]{2}\/[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/
    );
  });
});
