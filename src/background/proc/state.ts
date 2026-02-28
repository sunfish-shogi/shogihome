import os from "node:os";
import { exec } from "node:child_process";
import { MachineSpec, OSState } from "@/common/advanced/monitor";

// Cache the PowerShell Promise so the command runs at most once across concurrent callers.
let powershellPromise: Promise<number> | undefined = undefined;

/**
 * Reads NUMBER_OF_PROCESSORS from the environment. Fast but limited to the current
 * processor group on Windows (~64 threads). Returns 0 on failure.
 */
function getEnvLogicalProcessorCount(): number {
  const value = parseInt(process.env.NUMBER_OF_PROCESSORS ?? "", 10);
  return isNaN(value) || value <= 0 ? 0 : value;
}

/**
 * Starts (or returns the cached) PowerShell query for the total logical processor count
 * across all processor groups. Call early at startup to amortize the latency.
 * Returns 0 on failure.
 */
function getPowershellLogicalProcessorCount(): Promise<number> {
  if (powershellPromise === undefined) {
    powershellPromise = new Promise<number>((resolve) => {
      exec(
        'powershell -Command "(Get-CimInstance Win32_Processor).NumberOfLogicalProcessors | Measure-Object -Sum | Select-Object -ExpandProperty Sum"',
        { timeout: 10000, windowsHide: true },
        (error, stdout) => {
          if (error) {
            resolve(0);
            return;
          }
          const value = parseInt(stdout.trim(), 10);
          resolve(isNaN(value) || value <= 0 ? 0 : value);
        },
      );
    });
  }
  return powershellPromise;
}

/**
 * On Windows, os.cpus() and os.availableParallelism() are limited to the current
 * processor group (~64 threads). Combine NUMBER_OF_PROCESSORS (fast) and
 * PowerShell Get-CimInstance (accurate across all groups), taking the larger value.
 * Returns 0 only if both sources fail, so the caller can fall back to os.availableParallelism().
 */
async function getWindowsLogicalProcessorCount(): Promise<number> {
  return Math.max(getEnvLogicalProcessorCount(), await getPowershellLogicalProcessorCount());
}

/**
 * Kicks off the PowerShell query early at app startup so that the result is likely
 * ready (or nearly so) by the time getMachineSpec() / getCPUInfo() are called.
 * Safe to call on non-Windows platforms — it does nothing in that case.
 */
export function prefetchWindowsLogicalProcessorCount(): void {
  if (process.platform === "win32") {
    getPowershellLogicalProcessorCount();
  }
}

async function getAvailableParallelism(): Promise<number> {
  if (process.platform === "win32") {
    const count = await getWindowsLogicalProcessorCount();
    if (count > 0) {
      return count;
    }
  }
  return os.availableParallelism();
}

function getOSVersion() {
  const osVersion = process.getSystemVersion();
  switch (process.platform) {
    case "darwin":
      return `macOS ${osVersion}`;
    case "win32":
      return `Windows ${osVersion}`;
    case "linux":
      return `Linux ${osVersion}`;
    default:
      return `${process.platform} ${osVersion}`;
  }
}

let osVersion = "";

export function collectOSState(): OSState {
  if (!osVersion) {
    osVersion = getOSVersion();
  }
  const cpus = os.cpus();
  const cpuIdleTime = cpus.reduce((prev, cpu) => prev + cpu.times.idle, 0);
  const cpuTotalTime =
    cpuIdleTime +
    cpus.reduce(
      (prev, cpu) => prev + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq,
      0,
    );
  const mem = process.getSystemMemoryInfo();
  return {
    version: osVersion,
    arch: process.arch,
    cpuTotalTime,
    cpuIdleTime,
    memoryTotal: mem.total,
    memoryFree: mem.free + (process.platform === "darwin" ? mem.fileBacked : 0),
  };
}

export async function getMachineSpec(): Promise<MachineSpec> {
  return {
    cpuCores: await getAvailableParallelism(),
    memory: os.totalmem() / 1024,
  };
}

type CPUInfo = {
  architecture: string;
  availableCores: number;
  cores: { [model: string]: number };
};

export async function getCPUInfo(): Promise<CPUInfo> {
  const cpus = os.cpus();
  cpus.sort((a, b) => {
    const model = a.model.localeCompare(b.model);
    if (model !== 0) {
      return model;
    }
    return b.speed - a.speed;
  });
  const cores: { [model: string]: number } = {};
  for (let i = 0; i < cpus.length; i++) {
    const cpu = cpus[i];
    const name = `${cpu.model} / ${cpu.speed} MHz`;
    cores[name] = (cores[name] || 0) + 1;
  }
  return {
    architecture: os.machine(),
    availableCores: await getAvailableParallelism(),
    cores,
  };
}
