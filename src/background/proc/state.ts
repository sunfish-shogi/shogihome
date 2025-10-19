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
  return {
    cpuCores: os.availableParallelism(),
    memory: os.totalmem() / 1024,
  };
}

type CPUInfo = {
  architecture: string;
  availableCores: number;
  cores: { [model: string]: number };
};

export function getCPUInfo(): CPUInfo {
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
    availableCores: os.availableParallelism(),
    cores,
  };
}
