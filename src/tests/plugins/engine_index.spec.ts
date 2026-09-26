// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  buildEngineIndex,
  builtinEngineRoots,
  listBuiltinEngines,
  PUBLIC_ENGINES_DIR,
} from "@plugins/builtin_engines.js";
import { parseEngineIndex } from "@/common/wasm-engine/package.js";

const INDEX_URL = "https://example.com/webapp/engines/index.json";

describe("plugins/builtin_engines/index", () => {
  it("本家のエンジンがインデックスに載り、実行時の検証を通ること", () => {
    const engines = listBuiltinEngines(builtinEngineRoots());
    const index = parseEngineIndex(buildEngineIndex(engines), INDEX_URL);
    expect(index.engines.length).toBeGreaterThan(0);
    for (const pkg of index.engines) {
      const dir = path.join(PUBLIC_ENGINES_DIR, pkg.id);
      if (!fs.existsSync(dir)) {
        continue;
      }
      expect(pkg.packageURL).toBe(`https://example.com/webapp/engines/${pkg.id}/`);
      for (const file of pkg.files) {
        const data = fs.readFileSync(path.join(dir, file.path));
        expect(file.size).toBe(data.byteLength);
        expect(file.sha256).toBe(crypto.createHash("sha256").update(data).digest("hex"));
      }
    }
  });

  it("外部のエンジンを並べ、id の重複を拒否すること", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-engine-index-"));
    const external = path.join(tmp, "external.json");
    const entry = {
      id: "example.engine",
      version: "1",
      name: "Example",
      author: "Author",
      publisher: "example",
      licenses: ["MIT"],
      packageURL: "https://engines.example.com/e/1/",
      files: [{ path: "engine.json", sha256: "0".repeat(64), size: 1 }],
    };
    fs.writeFileSync(external, JSON.stringify({ engines: [entry] }));
    const index = parseEngineIndex(buildEngineIndex([], external), INDEX_URL);
    expect(index.engines.map((e) => e.id)).toEqual(["example.engine"]);

    const builtin = listBuiltinEngines([PUBLIC_ENGINES_DIR]);
    fs.writeFileSync(external, JSON.stringify({ engines: [{ ...entry, id: builtin[0].name }] }));
    expect(() => buildEngineIndex(builtin, external)).toThrow(/duplicated engine id/);
  });
});
