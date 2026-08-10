/* eslint-disable no-console */
// Audits the install scripts of every package under node_modules.
//
// npm runs three lifecycle scripts when it installs a dependency: preinstall, install and
// postinstall. They are disabled by "ignore-scripts=true" in .npmrc, and this script verifies that
// no dependency has quietly gained one, which would be a strong signal of a supply-chain attack.
// The few packages that legitimately ship an install script are listed in ALLOWED_PACKAGES below
// together with the exact command they are allowed to run.
//
// A package can also gain an install script without declaring one: when it ships a binding.gyp and
// has neither install nor preinstall, npm defaults its install command to "node-gyp rebuild". The
// synthesized script exists only in npm's normalized manifest, never in the package.json on disk,
// so it is derived here the same way npm does it.
//
// npm nests packages (e.g. node_modules/a/node_modules/b) whenever versions conflict, so
// node_modules is walked recursively instead of only two levels deep.
//
// "prepare" is not audited because it only runs for git dependencies, which .npmrc forbids
// altogether via "allow-git=none". "prepublish" and "prepack" never run on install.

import fs from "node:fs";
import path from "node:path";

const NODE_MODULES = "node_modules";

const LIFECYCLES = ["preinstall", "install", "postinstall"] as const;

// The install command npm defaults to for a package that ships a binding.gyp
const NODE_GYP_REBUILD = "node-gyp rebuild";

type Lifecycle = (typeof LIFECYCLES)[number];

type PackageRule = Partial<Record<Lifecycle, string>> & {
  // Whether the listed scripts must be present. Some of them are run manually elsewhere (see the
  // "install:esbuild" npm script), so we also want to notice when upstream drops one.
  required?: boolean;
};

const ALLOWED_PACKAGES: Record<string, PackageRule> = {
  // This script is run manually by the "install:esbuild" npm script.
  esbuild: { required: true, postinstall: "node install.js" },

  // The postinstall is introduced since https://github.com/unrs/unrs-resolver/pull/66 (v1.6.0)
  "unrs-resolver": { required: true, postinstall: "node postinstall.js" },

  // Selects the bundled 7-Zip binary matching the host architecture. Not marked as required
  // because nothing in this repository depends on it having run.
  "electron-winstaller": { install: "node ./script/select-7z-arch.js" },

  // Native build of the macOS file watcher. It is an optional darwin-only dependency, so it is
  // absent on other platforms and cannot be required.
  fsevents: { install: "node-gyp rebuild" },
};

type Context = {
  // Real paths of the packages visited so far, used to stop symbolic links from causing cycles or
  // duplicated work.
  visited: Set<string>;
  errors: string[];
  checked: number;
};

// statSync follows symbolic links and returns undefined instead of throwing when the path is
// missing or broken.
function isDirectory(targetPath: string): boolean {
  return fs.statSync(targetPath, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function checkPackageJson(packageDir: string, ctx: Context) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const stat = fs.statSync(packageJsonPath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    // A package directory with no manifest means the install is incomplete or has been tampered
    // with. Skipping it would let the audit report OK while leaving that directory unaudited.
    ctx.errors.push(`${packageDir} has no package.json`);
    return;
  }

  let name: string | undefined;
  let version: string | undefined;
  let scripts: Record<string, unknown> | undefined;
  let gypfile: boolean | undefined;
  try {
    ({ name, version, scripts, gypfile } = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")));
  } catch (e) {
    ctx.errors.push(`${packageJsonPath} is not a valid package.json: ${e}`);
    return;
  }
  ctx.checked++;

  // Mirrors the "gypfile" step of npm's package.json normalization: a binding.gyp turns into an
  // implicit "node-gyp rebuild" install script unless the package declares install/preinstall
  // itself or opts out with "gypfile": false.
  const impliedByGypfile =
    !scripts?.install &&
    !scripts?.preinstall &&
    gypfile !== false &&
    fs.existsSync(path.join(packageDir, "binding.gyp"));

  // hasOwn keeps inherited members such as "constructor" from being mistaken for a rule.
  const rule = name && Object.hasOwn(ALLOWED_PACKAGES, name) ? ALLOWED_PACKAGES[name] : undefined;
  // The same package name can appear at several paths once nested packages are included, so the
  // directory is part of the message to make the offender identifiable.
  const label = `${packageDir} (${name}@${version})`;

  for (const lifecycle of LIFECYCLES) {
    const implied = lifecycle === "install" && impliedByGypfile;
    const actual = implied ? NODE_GYP_REBUILD : scripts?.[lifecycle];
    const expected = rule?.[lifecycle];
    if (!actual) {
      if (expected && rule?.required) {
        ctx.errors.push(`${label} is missing the ${lifecycle} script: ${expected}`);
      }
      continue;
    }
    if (actual !== expected) {
      const origin = implied ? " implied by binding.gyp" : "";
      ctx.errors.push(
        `${label} has an unexpected ${lifecycle} script${origin}: ${JSON.stringify(actual)}`,
      );
    }
  }
}

function visitPackage(packageDir: string, ctx: Context) {
  if (!isDirectory(packageDir)) {
    // Every entry walked here sits where npm places a package, so anything that is not a
    // directory (a stray file, a broken symbolic link) is unexpected.
    ctx.errors.push(`${packageDir} is not a package directory`);
    return;
  }
  const realPath = fs.realpathSync(packageDir);
  if (ctx.visited.has(realPath)) {
    return;
  }
  ctx.visited.add(realPath);

  checkPackageJson(packageDir, ctx);

  const nested = path.join(packageDir, NODE_MODULES);
  if (isDirectory(nested)) {
    walkNodeModules(nested, ctx);
  }
}

function walkNodeModules(nodeModulesDir: string, ctx: Context) {
  for (const entry of fs.readdirSync(nodeModulesDir)) {
    // Skips npm's own bookkeeping entries such as .bin, .cache and .package-lock.json
    if (entry.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(nodeModulesDir, entry);
    // A scope directory holds one more level of packages, and scopes are never nested.
    if (entry.startsWith("@")) {
      if (!isDirectory(entryPath)) {
        ctx.errors.push(`${entryPath} is not a scope directory`);
        continue;
      }
      for (const scoped of fs.readdirSync(entryPath)) {
        if (scoped.startsWith(".")) {
          continue;
        }
        visitPackage(path.join(entryPath, scoped), ctx);
      }
      continue;
    }
    visitPackage(entryPath, ctx);
  }
}

function main() {
  const ctx: Context = { visited: new Set(), errors: [], checked: 0 };
  walkNodeModules(NODE_MODULES, ctx);

  if (ctx.errors.length > 0) {
    throw new Error(
      `${NODE_MODULES} failed the install script audit:\n${ctx.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  console.log(`OK: ${ctx.checked} package(s) under ${NODE_MODULES} have no unexpected scripts`);
}

main();
