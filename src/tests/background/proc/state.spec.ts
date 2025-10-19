import { getCPUInfo, getMachineSpec } from "@/background/proc/state";

describe("proc/state", () => {
  it("getMachineSpec", () => {
    const spec = getMachineSpec();
    expect(spec).toHaveProperty("cpuCores");
    expect(spec).toHaveProperty("memory");
    expect(typeof spec.cpuCores).toBe("number");
    expect(typeof spec.memory).toBe("number");
    expect(spec.cpuCores).toBeGreaterThan(0);
    expect(spec.memory).toBeGreaterThan(0);
  });

  it("getCPUInfo", () => {
    const cpuInfo = getCPUInfo();
    expect(cpuInfo).toHaveProperty("architecture");
    expect(cpuInfo).toHaveProperty("availableCores");
    expect(cpuInfo).toHaveProperty("cores");
    expect(typeof cpuInfo.architecture).toBe("string");
    expect(typeof cpuInfo.availableCores).toBe("number");
    expect(typeof cpuInfo.cores).toBe("object");
    expect(Object.keys(cpuInfo.cores).length).toBeGreaterThan(0);
  });
});
