import {
  getDateString,
  getDateTimeString,
  getDateTimeStringMs,
} from "@/common/helpers/datetime.js";

describe("helpers/datetime", () => {
  it("getDateTimeString", async () => {
    expect(getDateString()).toMatch(/^[0-9]{4}\/[0-9]{2}\/[0-9]{2}$/);
    expect(getDateString(new Date(1714966496789))).toMatch(/^2024\/05\/0[56]$/);
  });

  it("getDateTimeString", async () => {
    expect(getDateTimeString()).toMatch(
      /^[0-9]{4}\/[0-9]{2}\/[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/,
    );
    expect(getDateTimeString(new Date(1714966496789))).toMatch(
      /^2024\/05\/0[56] [0-9]{2}:[0-9]{2}:56$/,
    );
  });

  it("getDateTimeStringMs", async () => {
    expect(getDateTimeStringMs()).toMatch(
      /^[0-9]{4}\/[0-9]{2}\/[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$/,
    );
    expect(getDateTimeStringMs(new Date(1714966496789))).toMatch(
      /^2024\/05\/0[56] [0-9]{2}:[0-9]{2}:56.789$/,
    );
    expect(getDateTimeStringMs(new Date(1714966496007))).toMatch(
      /^2024\/05\/0[56] [0-9]{2}:[0-9]{2}:56.007$/, // zero padding
    );
  });
});
