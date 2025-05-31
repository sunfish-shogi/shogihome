export type WindowRule = { limit: number; windowSec: number };

export class RateLimiter {
  private timeStamps: number[] = [];
  private maxWindowSec: number;

  constructor(private rules: WindowRule[]) {
    this.maxWindowSec = Math.max(...this.rules.map((r) => r.windowSec));
  }

  async waitUntilAllowed(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();

      // remove old timestamps that are outside the max window
      const threshold = now - this.maxWindowSec * 1000;
      this.timeStamps = this.timeStamps.filter((t) => t >= threshold);

      let shouldWait = false;
      let waitForMs = 0;
      for (const { limit, windowSec } of this.rules) {
        const windowThreshold = now - windowSec * 1000;
        const inWindow = this.timeStamps.filter((t) => t >= windowThreshold);
        if (inWindow.length >= limit) {
          const oldest = inWindow[0];
          const earliestRelease = oldest + windowSec * 1000;
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
