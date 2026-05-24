import { t } from "@/common/i18n/index.js";

const heapUpperGB = 1.6;
const heapLowerGB = 1.4;
const heapUpperBytes = heapUpperGB * 1024 * 1024 * 1024;
const heapLowerBytes = heapLowerGB * 1024 * 1024 * 1024;
const intervalMs = 5_000; // 5seconds

export function startHeapMonitor(onWarning: (message: string) => void): () => void {
  let warningActive = false;
  const id = setInterval(() => {
    const { heapUsed } = process.memoryUsage();
    if (!warningActive && heapUsed > heapUpperBytes) {
      warningActive = true;
      onWarning(t.heapUsageExceedsNGBMayHang(heapUpperGB));
    } else if (warningActive && heapUsed < heapLowerBytes) {
      warningActive = false;
    }
  }, intervalMs);
  return () => clearInterval(id);
}
