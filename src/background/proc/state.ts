import os from "node:os";
import { MachineSpec, OSState } from "@/common/advanced/monitor";

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

export function getMachineSpec(): MachineSpec {
  const cpus = os.cpus();
  return {
    cpuCores: cpus.length,
    memory: os.totalmem() / 1024,
  };
}
