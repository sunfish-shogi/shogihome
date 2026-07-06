/* eslint-disable no-console */
// Verifies that every package in package-lock.json is fetched from the official npm registry.
//
// This guards against a supply-chain attack where a PR rewrites the "resolved" URL of an
// existing dependency to point at an attacker-controlled host (with a matching "integrity"
// hash for the malicious tarball), causing `npm ci` to silently install malicious code even
// though the package name/version in package-lock.json look unchanged.
//
// This script only uses Node.js built-ins so it can run before `npm ci`/`npm install`.

import fs from "node:fs";

const TRUSTED_RESOLVED_PREFIX = "https://registry.npmjs.org/";
const INTEGRITY_PATTERN = /^sha(1|256|512)-[A-Za-z0-9+/]+={0,2}$/;

function main() {
  const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf-8"));

  if (lockfile.lockfileVersion !== 3) {
    throw new Error(
      `Unsupported lockfileVersion: ${lockfile.lockfileVersion} (this script only supports lockfileVersion 3)`,
    );
  }

  const packages = lockfile.packages;
  if (!packages || typeof packages !== "object") {
    throw new Error('package-lock.json is missing a top-level "packages" object');
  }

  const errors = [];
  let checked = 0;

  for (const [key, pkg] of Object.entries(packages)) {
    // The root project itself and local/workspace symlinks have no "resolved" URL.
    if (key === "" || pkg.link) {
      continue;
    }

    if (!pkg.resolved) {
      errors.push(`"${key}" has no "resolved" field`);
      continue;
    }

    if (!pkg.resolved.startsWith(TRUSTED_RESOLVED_PREFIX)) {
      errors.push(`"${key}" resolves to an untrusted URL: ${pkg.resolved}`);
      continue;
    }

    if (!pkg.integrity || !INTEGRITY_PATTERN.test(pkg.integrity)) {
      errors.push(`"${key}" has a missing or malformed "integrity" field: ${pkg.integrity}`);
      continue;
    }

    checked++;
  }

  if (errors.length > 0) {
    throw new Error(
      `package-lock.json failed verification:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  console.log(
    `OK: ${checked} package(s) in package-lock.json resolve to ${TRUSTED_RESOLVED_PREFIX}`,
  );
}

main();
