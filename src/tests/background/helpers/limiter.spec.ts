import { RateLimiter } from "@/background/helpers/limiter";

describe("limiter", () => {
  it("should limit", async () => {
    const limiter = new RateLimiter([
      { limit: 3, windowMs: 100 },
      { limit: 5, windowMs: 200 },
    ]);
    const start = Date.now();
    await limiter.waitUntilAllowed();
    await limiter.waitUntilAllowed();
    await limiter.waitUntilAllowed();
    expect(Date.now() - start).toBeLessThan(100);
    await limiter.waitUntilAllowed();
    await limiter.waitUntilAllowed();
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
    expect(Date.now() - start).toBeLessThan(200);
    await limiter.waitUntilAllowed();
    expect(Date.now() - start).toBeGreaterThanOrEqual(200);
  });
});
