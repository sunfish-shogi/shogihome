export type WindowRule = { limit: number; windowMs: number };

export class RateLimiter {
  private timeStamps: number[] = [];
  private maxWindowMs: number;

  constructor(private rules: WindowRule[]) {
    this.maxWindowMs = Math.max(...this.rules.map((r) => r.windowMs));
  }

  async waitUntilAllowed(): Promise<void> {
    while (true) {
      const now = Date.now();

      // remove old timestamps that are outside the max window
      const threshold = now - this.maxWindowMs;
      this.timeStamps = this.timeStamps.filter((t) => t >= threshold);

      let shouldWait = false;
      let waitForMs = 0;
      for (const { limit, windowMs } of this.rules) {
        const windowThreshold = now - windowMs;
        const inWindow = this.timeStamps.filter((t) => t >= windowThreshold);
        if (inWindow.length >= limit) {
          const oldest = inWindow[0];
          const earliestRelease = oldest + windowMs;
          const delta = earliestRelease - now;
          if (delta > waitForMs) {
            waitForMs = delta;
          }
          shouldWait = true;
        }
      }

      if (!shouldWait) {
        this.timeStamps.push(now);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, waitForMs));
    }
  }
}
