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
// It also enforces this project's ban on npm aliases (`"foo": "npm:bar@1.2.3"`):
//
//   - The root package.json must not declare any alias, in any dependency field or in
//     "overrides".
//   - An aliased lockfile entry (one whose "name" differs from its install path) is rejected
//     unless it appears in ALLOWED_TRANSITIVE_ALIASES below and is genuinely requested by a
//     third-party package.
//
// The alias syntax is what makes "install package X at the path of package Y" a legitimate
// lockfile state, so an unrestricted alias is exactly the escape hatch the name/version check
// above is meant to close: adding `"name": "evil"` to the "node_modules/vue" entry would
// otherwise turn a malicious substitution into a "correctly aliased" dependency. Aliases buy
// this project nothing, so they are banned outright and the few transitive ones that our
// dependencies force upon us are pinned in an explicit allowlist.
//
// This script only uses Node.js built-ins so it can run before `npm ci`/`npm install`.

import fs from "node:fs";

const TRUSTED_RESOLVED_PREFIX = "https://registry.npmjs.org/";
const INTEGRITY_PATTERN = /^sha(1|256|512)-[A-Za-z0-9+/]+={0,2}$/;
const RESOLVED_URL_PATTERN = /^https:\/\/registry\.npmjs\.org\/(.+)\/-\/([^/]+)\.tgz$/;
const ALIAS_SPEC_PREFIX = "npm:";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

// Aliases this project cannot avoid because a third-party package declares them. Each entry
// maps the alias (the name it is installed under) to the real package it must resolve to.
// Do not add entries here for our own dependencies: aliases are banned in package.json.
const ALLOWED_TRANSITIVE_ALIASES = new Map([
  // Requested by @isaacs/cliui to load the CommonJS builds alongside the ESM ones.
  ["string-width-cjs", "string-width"],
  ["strip-ansi-cjs", "strip-ansi"],
  ["wrap-ansi-cjs", "wrap-ansi"],
]);

// Packages bundled inside their parent's tarball (bundleDependencies) have no tarball of
// their own, so npm records them without a "resolved"/"integrity" field.
function isBundledOrLinked(pkg) {
  return pkg.link === true || pkg.inBundle === true;
}

// The lockfile key is the install path, e.g. "node_modules/@scope/foo" or
// "node_modules/a/node_modules/foo". The name a package is installed under is whatever
// follows the last "node_modules/" segment.
function installedNameForKey(key) {
  const marker = "node_modules/";
  const index = key.lastIndexOf(marker);
  // Workspace entries are keyed by their directory instead; they are linked, not installed.
  return index < 0 ? key : key.slice(index + marker.length);
}

function aliasTarget(spec) {
  // "npm:foo@^1.2.3" / "npm:@scope/foo@^1.2.3" / "npm:foo" (version omitted)
  const rest = spec.slice(ALIAS_SPEC_PREFIX.length);
  const separator = rest.lastIndexOf("@");
  return separator > 0 ? rest.slice(0, separator) : rest;
}

// Yields every alias spec in an "overrides" map. A nested value is another overrides map,
// scoped to the package named by its key, where "." overrides the package itself.
function* aliasSpecsOfOverrides(overrides, path) {
  if (!overrides || typeof overrides !== "object") {
    return;
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (typeof value === "string") {
      if (value.startsWith(ALIAS_SPEC_PREFIX)) {
        // "." overrides the package named by the enclosing key.
        const target = name === "." && path.length > 1 ? path[path.length - 1] : name;
        yield { field: path.join("."), name: target, spec: value };
      }
    } else {
      yield* aliasSpecsOfOverrides(value, [...path, name]);
    }
  }
}

// Yields every alias spec declared by a manifest-like object, including nested "overrides".
function* aliasSpecsOf(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return;
  }
  for (const field of DEPENDENCY_FIELDS) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object") {
      continue;
    }
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === "string" && spec.startsWith(ALIAS_SPEC_PREFIX)) {
        yield { field, name, spec };
      }
    }
  }
  yield* aliasSpecsOfOverrides(manifest.overrides, ["overrides"]);
}

// Collects the aliases requested by third-party packages, keyed by the alias name, so that an
// aliased lockfile entry can be traced back to the package that asked for it.
function collectRequestedAliases(packages) {
  const requested = new Map();
  for (const [key, pkg] of Object.entries(packages)) {
    if (key === "") {
      continue; // The root project is checked against package.json instead.
    }
    for (const { name, spec } of aliasSpecsOf(pkg)) {
      let entry = requested.get(name);
      if (!entry) {
        entry = { targets: new Set(), requesters: new Set() };
        requested.set(name, entry);
      }
      entry.targets.add(aliasTarget(spec));
      entry.requesters.add(installedNameForKey(key));
    }
  }
  return requested;
}

function verifyRootHasNoAliases(errors) {
  const manifest = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  for (const { field, name, spec } of aliasSpecsOf(manifest)) {
    errors.push(
      `package.json declares the npm alias "${name}": "${spec}" in "${field}" — aliases are not allowed in this project`,
    );
  }
}

// Returns the real package name the entry must resolve to, or null if the entry is an alias
// that this project does not allow.
function resolveDeclaredName(key, pkg, requestedAliases, errors) {
  const installedName = installedNameForKey(key);
  if (!pkg.name || pkg.name === installedName) {
    return installedName;
  }

  // From here on the entry is an alias: it installs pkg.name under a different name.
  const allowedTarget = ALLOWED_TRANSITIVE_ALIASES.get(installedName);
  if (allowedTarget === undefined) {
    errors.push(
      `"${key}" is an npm alias for "${pkg.name}" — aliases are not allowed in this project` +
        ` (add it to ALLOWED_TRANSITIVE_ALIASES only if a third-party package requires it)`,
    );
    return null;
  }
  if (allowedTarget !== pkg.name) {
    errors.push(
      `"${key}" is allowed to alias "${allowedTarget}" but the lockfile entry aliases "${pkg.name}"`,
    );
    return null;
  }

  const requested = requestedAliases.get(installedName);
  if (!requested) {
    errors.push(
      `"${key}" is an npm alias that no package in the lockfile requests — remove it or fix the lockfile`,
    );
    return null;
  }
  if (!requested.targets.has(allowedTarget)) {
    errors.push(
      `"${key}" aliases "${allowedTarget}" but its requester(s) ${[...requested.requesters]
        .map((name) => `"${name}"`)
        .join(", ")} ask for "${[...requested.targets].join('", "')}"`,
    );
    return null;
  }
  return allowedTarget;
}

function verifyRequestedAliases(requestedAliases, errors) {
  for (const [name, { targets, requesters }] of requestedAliases) {
    const allowedTarget = ALLOWED_TRANSITIVE_ALIASES.get(name);
    if (allowedTarget === undefined) {
      errors.push(
        `${[...requesters].map((r) => `"${r}"`).join(", ")} request the npm alias "${name}"` +
          ` (for "${[...targets].join('", "')}") — aliases are not allowed in this project`,
      );
      continue;
    }
    for (const target of targets) {
      if (target !== allowedTarget) {
        errors.push(
          `the npm alias "${name}" is allowed to point at "${allowedTarget}" but ${[...requesters]
            .map((r) => `"${r}"`)
            .join(", ")} request "${target}"`,
        );
      }
    }
  }
}

function verifyResolvedIdentity(key, pkg, expectedName, errors) {
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
  let aliases = 0;

  verifyRootHasNoAliases(errors);

  const requestedAliases = collectRequestedAliases(packages);
  verifyRequestedAliases(requestedAliases, errors);

  for (const [key, pkg] of Object.entries(packages)) {
    // The root project itself has no "resolved" URL.
    if (key === "" || isBundledOrLinked(pkg)) {
      continue;
    }

    const expectedName = resolveDeclaredName(key, pkg, requestedAliases, errors);
    if (expectedName === null) {
      continue;
    }
    if (expectedName !== installedNameForKey(key)) {
      aliases++;
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

    verifyResolvedIdentity(key, pkg, expectedName, errors);
    checked++;
  }

  if (errors.length > 0) {
    throw new Error(
      `package-lock.json failed verification:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  console.log(
    `OK: ${checked} package(s) in package-lock.json resolve to ${TRUSTED_RESOLVED_PREFIX} with matching name/version` +
      ` (${aliases} allow-listed transitive alias(es), no other npm aliases)`,
  );
}

main();
