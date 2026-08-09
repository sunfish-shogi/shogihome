/* eslint-disable no-console */
// Verifies that every package in package-lock.json is fetched from the official npm registry
// AND that the resolved tarball actually corresponds to the package name/version recorded in
// the lockfile entry.
//
// This guards against a supply-chain attack where a PR rewrites the "resolved" URL of an
// existing dependency (e.g. "node_modules/vue") to point at a different package on the
// registry — one published by the attacker, with a matching "integrity" hash for that
// malicious tarball. A prefix-only check on the registry host would pass in that case, and
// `npm ci` would happily extract the attacker's package into the original dependency's path.
//
// This script only uses Node.js built-ins so it can run before `npm ci`/`npm install`.

import fs from "node:fs";

const TRUSTED_RESOLVED_PREFIX = "https://registry.npmjs.org/";
const INTEGRITY_PATTERN = /^sha(1|256|512)-[A-Za-z0-9+/]+={0,2}$/;
const RESOLVED_URL_PATTERN = /^https:\/\/registry\.npmjs\.org\/(.+)\/-\/([^/]+)\.tgz$/;

// Packages bundled inside their parent's tarball (bundleDependencies) have no tarball of
// their own, so npm records them without a "resolved"/"integrity" field.
function isBundledOrLinked(pkg) {
  return pkg.link === true || pkg.inBundle === true;
}

// The lockfile key is the install path, e.g. "node_modules/@scope/foo" or
// "node_modules/a/node_modules/foo". The package name is whatever follows the last
// "node_modules/" segment.
function pathNameForKey(key) {
  const marker = "node_modules/";
  return key.slice(key.lastIndexOf(marker) + marker.length);
}

function verifyResolvedIdentity(key, pkg, errors) {
  const match = pkg.resolved.match(RESOLVED_URL_PATTERN);
  if (!match) {
    errors.push(
      `"${key}" has a resolved URL that doesn't match the expected npm tarball format: ${pkg.resolved}`,
    );
    return;
  }

  const [, rawName, filename] = match;
  let resolvedName;
  try {
    // Older npm versions percent-encode the scope separator (e.g. "%2f").
    resolvedName = decodeURIComponent(rawName);
  } catch {
    errors.push(`"${key}" has a resolved URL with an unparsable package name: ${pkg.resolved}`);
    return;
  }

  // The expected name is always derived from the install path. An entry whose "name"
  // field disagrees with its path is how npm records aliased dependencies
  // (e.g. `"bar": "npm:foo@1.2.3"`), but it is also exactly how a lockfile-only edit
  // can relabel a swapped-in "resolved" URL as legitimate, and the lockfile itself
  // offers no trustworthy way to tell the two apart. No current dependency uses
  // aliases, so they are rejected outright; if one ever legitimately needs them,
  // update this script to allow that specific alias explicitly.
  const expectedName = pathNameForKey(key);
  if (pkg.name && pkg.name !== expectedName) {
    errors.push(
      `"${key}" declares name "${pkg.name}" which does not match its install path` +
        ` (npm aliases are not supported by this verifier)`,
    );
    return;
  }
  if (resolvedName !== expectedName) {
    errors.push(
      `"${key}" resolves to package "${resolvedName}" but the lockfile entry is for "${expectedName}"`,
    );
    return;
  }

  const shortName = expectedName.split("/").pop();
  if (!filename.startsWith(`${shortName}-`)) {
    errors.push(
      `"${key}" resolved tarball filename "${filename}" doesn't match package name "${shortName}"`,
    );
    return;
  }

  const resolvedVersion = filename.slice(shortName.length + 1);
  if (pkg.version && resolvedVersion !== pkg.version) {
    errors.push(
      `"${key}" resolves to version "${resolvedVersion}" but the lockfile declares version "${pkg.version}"`,
    );
  }
}

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
    // The root project itself has no "resolved" URL.
    if (key === "" || isBundledOrLinked(pkg)) {
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

    verifyResolvedIdentity(key, pkg, errors);
    checked++;
  }

  if (errors.length > 0) {
    throw new Error(
      `package-lock.json failed verification:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  console.log(
    `OK: ${checked} package(s) in package-lock.json resolve to ${TRUSTED_RESOLVED_PREFIX} with matching name/version`,
  );
}

main();
