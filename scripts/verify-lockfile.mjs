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
//     unless it appears in ALLOWED_TRANSITIVE_ALIASES below and some third-party package's
//     alias request actually resolves to that entry (nearest-match, the way npm resolves).
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

// A nested entry ("<owner>/node_modules/foo") is only visible to <owner> itself and to
// packages installed inside it. A top-level entry is hoisted and has no owner (null).
function scopeOwnerForKey(key) {
  const index = key.lastIndexOf("/node_modules/");
  return index < 0 ? null : key.slice(0, index);
}

// npm resolves a dependency name by looking in the requester's own "node_modules", then in
// each enclosing scope's, and takes the NEAREST match — entries farther up are shadowed.
// Mirror that walk over the lockfile keys to find the one entry a request resolves to.
function resolveRequestKey(packages, requesterKey, name) {
  for (let scope = requesterKey; ; scope = scopeOwnerForKey(scope)) {
    const candidate = scope === null ? `node_modules/${name}` : `${scope}/node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) {
      return candidate;
    }
    if (scope === null) {
      return null;
    }
  }
}

// npm matches the alias protocol case-insensitively (npm-package-arg does
// `spec.toLowerCase().startsWith('npm:')`), so "NPM:foo@1.2.3" is an alias too. It does not
// trim, so lowercasing is the whole normalization.
function isAliasSpec(spec) {
  return typeof spec === "string" && spec.toLowerCase().startsWith(ALIAS_SPEC_PREFIX);
}

function aliasTarget(spec) {
  // "npm:foo@^1.2.3" / "npm:@scope/foo@^1.2.3" / "npm:foo" (version omitted)
  const rest = spec.slice(ALIAS_SPEC_PREFIX.length);
  const separator = rest.lastIndexOf("@");
  return separator > 0 ? rest.slice(0, separator) : rest;
}

function formatRequesters(records) {
  const names = new Set(records.map(({ requesterKey }) => installedNameForKey(requesterKey)));
  return [...names].map((name) => `"${name}"`).join(", ");
}

function formatTargets(records) {
  return [...new Set(records.map(({ target }) => target))].join('", "');
}

// Yields every alias spec in an "overrides" map. A nested value is another overrides map,
// scoped to the package named by its key, where "." overrides the package itself.
function* aliasSpecsOfOverrides(overrides, path) {
  if (!overrides || typeof overrides !== "object") {
    return;
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (typeof value === "string") {
      if (isAliasSpec(value)) {
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
      if (isAliasSpec(spec)) {
        yield { field, name, spec };
      }
    }
  }
  yield* aliasSpecsOfOverrides(manifest.overrides, ["overrides"]);
}

// Collects the aliases requested by third-party packages, keyed by the alias name, so that an
// aliased lockfile entry can be traced back to the package that asked for it. Each request is
// resolved to its nearest matching entry up front, because that entry — and only that entry —
// is what the request justifies.
function collectRequestedAliases(packages) {
  const requested = new Map();
  for (const [key, pkg] of Object.entries(packages)) {
    if (key === "") {
      continue; // The root project is checked against package.json instead.
    }
    for (const { name, spec } of aliasSpecsOf(pkg)) {
      let records = requested.get(name);
      if (!records) {
        records = [];
        requested.set(name, records);
      }
      records.push({
        requesterKey: key,
        target: aliasTarget(spec),
        resolvedKey: resolveRequestKey(packages, key, name),
      });
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

  // The alias must be justified by a request that actually resolves to this entry: a request
  // that npm resolves to a nearer copy — or elsewhere in the tree — says nothing about why
  // the alias sits at this path.
  const records = requestedAliases.get(installedName) ?? [];
  const resolvingHere = records.filter(({ resolvedKey }) => resolvedKey === key);
  if (resolvingHere.length === 0) {
    errors.push(
      records.length === 0
        ? `"${key}" is an npm alias that no package in the lockfile requests — remove it or fix the lockfile`
        : `"${key}" is an npm alias that no request resolves to` +
            ` (${formatRequesters(records)} request "${installedName}", but npm resolves those requests elsewhere)`,
    );
    return null;
  }
  if (!resolvingHere.some(({ target }) => target === allowedTarget)) {
    errors.push(
      `"${key}" aliases "${allowedTarget}" but its requester(s) ${formatRequesters(resolvingHere)}` +
        ` ask for "${formatTargets(resolvingHere)}"`,
    );
    return null;
  }
  return allowedTarget;
}

function verifyRequestedAliases(requestedAliases, errors) {
  for (const [name, records] of requestedAliases) {
    const allowedTarget = ALLOWED_TRANSITIVE_ALIASES.get(name);
    if (allowedTarget === undefined) {
      errors.push(
        `${formatRequesters(records)} request the npm alias "${name}"` +
          ` (for "${formatTargets(records)}") — aliases are not allowed in this project`,
      );
      continue;
    }
    for (const { requesterKey, target } of records) {
      if (target !== allowedTarget) {
        errors.push(
          `the npm alias "${name}" is allowed to point at "${allowedTarget}"` +
            ` but "${installedNameForKey(requesterKey)}" requests "${target}"`,
        );
      }
    }
  }
}

// Checks the aliases from the requesting side. Verifying entries alone is not enough: dropping
// the "name" field turns an alias entry into what looks like an ordinary package, and the
// name/version check then only compares it against its own install name. An attacker who
// publishes a package actually called "string-width-cjs" could therefore take the place of the
// "string-width" that @isaacs/cliui asked for. So every allow-listed alias request must
// resolve (nearest-match, as npm does) to an entry that still declares the allow-listed
// target as its "name".
function verifyAliasRequestsResolve(packages, requestedAliases, errors) {
  for (const [aliasName, records] of requestedAliases) {
    const allowedTarget = ALLOWED_TRANSITIVE_ALIASES.get(aliasName);
    if (allowedTarget === undefined) {
      continue; // Already reported by verifyRequestedAliases().
    }
    for (const { requesterKey, target, resolvedKey } of records) {
      if (target !== allowedTarget) {
        continue; // Already reported by verifyRequestedAliases().
      }
      const requesterName = installedNameForKey(requesterKey);
      if (resolvedKey === null) {
        errors.push(
          `"${requesterName}" requests the npm alias "${aliasName}" but no lockfile entry provides it`,
        );
        continue;
      }
      const resolved = packages[resolvedKey];
      if (resolved.name !== allowedTarget) {
        errors.push(
          `"${requesterName}" requests the npm alias "${aliasName}" for "${allowedTarget}",` +
            ` but it resolves to "${resolvedKey}" which declares` +
            ` "${resolved.name ?? installedNameForKey(resolvedKey)}" — that entry must declare` +
            ` "name": "${allowedTarget}"`,
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
  verifyAliasRequestsResolve(packages, requestedAliases, errors);

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
