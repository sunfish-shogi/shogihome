/* eslint-disable no-console */
// Judges the output of `npm audit --json` against an allowlist of advisories that have been
// reviewed and judged harmless for this project.
//
// npm audit itself has no way to ignore a specific advisory, so the scheduled audit workflow
// (.github/workflows/audit.yml) runs `npm audit --json` and passes the report to this script.
// See specs/npm-audit-allowlist.md for the allowlist format and the review policy.
//
// Usage:
//   node scripts/audit-check.mjs --allowlist <allowlist.json> [--level <severity>] <report.json>
//
// Exit status is 0 when every advisory at or above the given severity is allow-listed, and 1
// when any is not, or when the report or the allowlist cannot be trusted (an npm error, an
// unknown report format, a malformed allowlist entry, ...).
//
// The workflow audits released tags, whose checkouts do not contain this script or the
// allowlist, so it copies both out of the default branch before checking out a tag. Because of
// that, this script only uses Node.js built-ins and must not depend on anything in the
// repository.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const DEFAULT_LEVEL = "critical";
const GHSA_PATTERN = /GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}/;
const GHSA_ID_PATTERN = new RegExp(`^${GHSA_PATTERN.source}$`);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWLIST_KEYS = ["id", "package", "reason", "expires"];

function parseArgs(argv) {
  const args = { allowlist: null, level: DEFAULT_LEVEL, report: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allowlist" || arg === "--level") {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`${arg} requires a value`);
      }
      args[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (args.report === null) {
      args.report = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  if (!args.allowlist) {
    throw new Error("--allowlist is required");
  }
  if (!args.report) {
    throw new Error("a path to the `npm audit --json` report is required");
  }
  if (!SEVERITIES.includes(args.level)) {
    throw new Error(`--level must be one of ${SEVERITIES.join(", ")}: ${args.level}`);
  }
  return args;
}

function readJSON(path, label) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`failed to read the ${label} (${path}): ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`the ${label} (${path}) is not valid JSON: ${e.message}`);
  }
}

function isValidDate(text) {
  if (!DATE_PATTERN.test(text)) {
    return false;
  }
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}

/**
 * Validates the allowlist strictly: every entry must say what it ignores, why, and until when.
 * A sloppy entry is an error rather than a warning, because a silently broken entry could hide
 * a vulnerability that nobody has reviewed.
 */
export function validateAllowlist(allowlist) {
  if (!Array.isArray(allowlist)) {
    throw new Error("the allowlist must be a JSON array");
  }
  const errors = [];
  const seen = new Set();
  allowlist.forEach((entry, index) => {
    const at = `allowlist[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!ALLOWLIST_KEYS.includes(key)) {
        errors.push(`${at} has an unknown key "${key}"`);
      }
    }
    if (typeof entry.id !== "string" || !GHSA_ID_PATTERN.test(entry.id)) {
      errors.push(`${at}.id must be a GHSA ID like "GHSA-xxxx-xxxx-xxxx": ${entry.id}`);
    }
    if (typeof entry.package !== "string" || entry.package.trim() === "") {
      errors.push(`${at}.package must be a non-empty package name`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      errors.push(`${at}.reason must explain why the advisory is harmless for this project`);
    }
    if (typeof entry.expires !== "string" || !isValidDate(entry.expires)) {
      errors.push(`${at}.expires must be a date in YYYY-MM-DD format: ${entry.expires}`);
    }
    const key = `${entry.id}|${entry.package}`;
    if (seen.has(key)) {
      errors.push(`${at} duplicates ${entry.id} for "${entry.package}"`);
    }
    seen.add(key);
  });
  if (errors.length > 0) {
    throw new Error(`the allowlist is invalid:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}

/**
 * Collects the advisories from an `npm audit --json` report (auditReportVersion 2).
 * Only the advisory objects in `via` are collected. A string in `via` names another vulnerable
 * package this one depends on, whose advisories are listed under that package itself.
 */
export function collectAdvisories(report) {
  if (report === null || typeof report !== "object") {
    throw new Error("the audit report must be a JSON object");
  }
  if (report.error) {
    const { code, summary, detail } = report.error;
    throw new Error(
      `npm audit failed: ${[code, summary, detail].filter(Boolean).join(": ") || "unknown error"}`,
    );
  }
  if (report.auditReportVersion !== 2) {
    throw new Error(`unsupported audit report version: ${report.auditReportVersion}`);
  }
  const vulnerabilities = report.vulnerabilities;
  if (vulnerabilities === null || typeof vulnerabilities !== "object") {
    throw new Error('the audit report has no "vulnerabilities" object');
  }

  const advisories = new Map();
  for (const vulnerability of Object.values(vulnerabilities)) {
    for (const via of vulnerability?.via ?? []) {
      if (typeof via === "string") {
        continue;
      }
      if (via === null || typeof via !== "object" || typeof via.name !== "string") {
        throw new Error(`unexpected advisory in the audit report: ${JSON.stringify(via)}`);
      }
      if (!SEVERITIES.includes(via.severity)) {
        throw new Error(`unknown severity "${via.severity}" in the audit report (${via.url})`);
      }
      const id = typeof via.url === "string" ? via.url.match(GHSA_PATTERN)?.[0] : undefined;
      const key = `${id ?? via.source}|${via.name}`;
      const advisory = advisories.get(key) ?? {
        id: id ?? null,
        source: via.source,
        package: via.name,
        severity: via.severity,
        title: via.title ?? "",
        url: via.url ?? "",
        range: via.range ?? "",
        nodes: new Set(),
      };
      for (const node of vulnerability.nodes ?? []) {
        advisory.nodes.add(node);
      }
      advisories.set(key, advisory);
    }
  }
  return [...advisories.values()];
}

/**
 * Splits the advisories at or above `level` into allow-listed ones and the rest.
 * `today` is a YYYY-MM-DD string; an entry applies through the end of its `expires` date (UTC).
 */
export function evaluate(advisories, allowlist, level, today) {
  const threshold = SEVERITIES.indexOf(level);
  const targets = advisories.filter((a) => SEVERITIES.indexOf(a.severity) >= threshold);
  const findEntry = (advisory) =>
    allowlist.find((e) => e.id === advisory.id && e.package === advisory.package);

  const ignored = [];
  const failures = [];
  const expiredMatches = [];
  for (const advisory of targets) {
    const entry = advisory.id ? findEntry(advisory) : undefined;
    if (entry && entry.expires >= today) {
      ignored.push({ advisory, entry });
    } else {
      if (entry) {
        expiredMatches.push({ advisory, entry });
      }
      failures.push(advisory);
    }
  }

  // Entries are matched against every advisory, not just the ones at or above the level, so
  // that lowering the severity of an advisory does not make its entry look unused.
  const unused = allowlist.filter(
    (e) => !advisories.some((a) => a.id === e.id && a.package === e.package),
  );
  const expired = allowlist.filter((e) => e.expires < today);
  return { ignored, failures, expiredMatches, unused, expired };
}

function describe(advisory) {
  const id = advisory.id ?? `advisory ${advisory.source}`;
  const nodes = [...advisory.nodes].join(", ");
  return (
    `[${advisory.severity}] ${id} ${advisory.package}@${advisory.range}: ${advisory.title}\n` +
    `      ${advisory.url}` +
    (nodes ? `\n      installed at: ${nodes}` : "")
  );
}

function warn(message) {
  // Shown as an annotation on the workflow run summary when running on GitHub Actions.
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning::${message.replaceAll("%", "%25").replaceAll("\n", "%0A")}`);
  } else {
    console.log(`WARNING: ${message}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowlist = readJSON(args.allowlist, "allowlist");
  validateAllowlist(allowlist);
  const report = readJSON(args.report, "audit report");
  const advisories = collectAdvisories(report);
  const today = new Date().toISOString().slice(0, 10);
  const result = evaluate(advisories, allowlist, args.level, today);

  for (const { advisory, entry } of result.ignored) {
    console.log(`ignored (until ${entry.expires}): ${describe(advisory)}`);
    console.log(`      reason: ${entry.reason}`);
  }
  for (const entry of result.expired) {
    warn(`allowlist entry ${entry.id} for "${entry.package}" expired on ${entry.expires}`);
  }
  for (const entry of result.unused) {
    // The same allowlist is shared by every audited version, so an entry may legitimately
    // match only some of them. Remove it once no audited version matches it any more.
    warn(`allowlist entry ${entry.id} for "${entry.package}" matches nothing in this report`);
  }

  if (result.failures.length > 0) {
    throw new Error(
      `${result.failures.length} advisory(ies) at or above "${args.level}" are not allow-listed:\n` +
        result.failures.map((a) => `  - ${describe(a)}`).join("\n") +
        (result.expiredMatches.length > 0
          ? `\n(${result.expiredMatches.length} of them matched an expired allowlist entry)`
          : ""),
    );
  }

  console.log(
    `OK: ${advisories.length} advisory(ies) in the report, ` +
      `none at or above "${args.level}" except ${result.ignored.length} allow-listed one(s)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
