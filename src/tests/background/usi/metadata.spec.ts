import fs from "node:fs";
import path from "node:path";
import { getTempPathForTesting } from "@/background/proc/env";
import { loadUSIEngineMeta } from "@/background/usi/metadata";

describe("usi/metadata", () => {
  const tmpdir = path.join(getTempPathForTesting(), "engine-metadata");

  beforeAll(async () => {
    fs.mkdirSync(tmpdir, { recursive: true });
  });

  describe("without extension", async () => {
    const testCases = [
      // native binary
      {
        name: "native",
        content: new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]),
        isShellScript: false,
      },

      // shell scripts
      { name: "sh", content: "#!/bin/sh\necho script engine", isShellScript: true },
      { name: "bash", content: "#!/bin/bash\necho script engine", isShellScript: true },
      { name: "bash-eu", content: "#!/bin/bash -eu\necho script engine", isShellScript: true },
      { name: "env-bash", content: "#!/usr/bin/env bash\necho script engine", isShellScript: true },
      { name: "plain", content: "#no shebang\necho script engine", isShellScript: true },

      // other interpreters
      {
        name: "python",
        content: "#!/usr/bin/python3\nprint('script engine')",
        isShellScript: false,
      },
      {
        name: "env-python",
        content: "#!/usr/bin/env python3\nprint('script engine')",
        isShellScript: false,
      },
    ];
    const enginePath = path.join(tmpdir, "without-ext-engine");
    for (const testCase of testCases) {
      it(testCase.name, async () => {
        fs.writeFileSync(enginePath, testCase.content);
        await expect(loadUSIEngineMeta(enginePath)).resolves.toEqual({
          isShellScript: testCase.isShellScript,
        });
      });
    }
  });

  describe("with extension", async () => {
    const testCases = [
      { path: "/path/to/engine.exe", isShellScript: false },
      { path: "/path/to/engine.py", isShellScript: false },
      { path: "/path/to/engine.bat", isShellScript: true },
      { path: "/path/to/engine.cmd", isShellScript: true },
      { path: "/path/to/engine.sh", isShellScript: true },
      { path: "/path/to/engine.ps1", isShellScript: true },
    ];
    for (const testCase of testCases) {
      it(testCase.path, async () => {
        await expect(loadUSIEngineMeta(testCase.path)).resolves.toEqual({
          isShellScript: testCase.isShellScript,
        });
      });
    }
  });
});
