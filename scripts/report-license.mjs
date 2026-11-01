/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

// Usage: node scripts/report-license.mjs [outputDir]
const rootDir = process.argv[2] || "./docs";
const licenseFileDir = "third-party-licenses";
const allowed = [
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "Zlib",
];
const LICENSE_FILE_PATTERNS = [/^LICEN[CS]E(-\w+)?$/, /^COPYING$/, /^README$/];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function findLicenseFile(dir) {
  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  for (const pattern of LICENSE_FILE_PATTERNS) {
    const f = files.find((f) => pattern.test(path.parse(f).name.toUpperCase()));
    if (f) {
      return path.join(dir, f);
    }
  }
}

function guessLicense(text) {
  if (/MIT License|Permission is hereby granted, free of charge/i.test(text)) {
    return "MIT*";
  }
  if (/ISC License|Permission to use, copy, modify, and\/or distribute/i.test(text)) {
    return "ISC*";
  }
  return "UNKNOWN";
}

function normalizeRepository(repo) {
  const url = typeof repo === "string" ? repo : repo?.url;
  if (!url) {
    return "";
  }
  return url
    .replace(/^git\+/, "")
    .replace(/^http:\/\/github\.com\//, "https://github.com/")
    .replace(/^(git|ssh):\/\/(git@)?github\.com[/:]/, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^github:/, "https://github.com/")
    .replace(/^(?!\w+:)([\w.-]+\/[\w.-]+)$/, "https://github.com/$1")
    .replace(/\.git$/, "");
}

function isAllowed(expr) {
  // Accept only if every license token in the SPDX expression is allowed (OR is treated strictly).
  const ids = expr
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR)\s+|\s+/)
    .filter(Boolean);
  return ids.length > 0 && ids.every((id) => allowed.includes(id.replace(/\*$/, "")));
}

function escapeHTML(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const packages = new Map();
for (const [p, entry] of Object.entries(lock.packages)) {
  if (p === "" || entry.dev || entry.link) {
    continue;
  }
  const packageJsonPath = path.join(p, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    // Optional dependencies (e.g. platform-specific binaries) may not be installed.
    if (entry.optional) {
      continue;
    }
    fail(`"${p}" is not installed. Run "npm ci" to sync node_modules with package-lock.json.`);
  }
  const json = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (json.version !== entry.version) {
    fail(
      `"${p}" is ${json.version} but package-lock.json expects ${entry.version}. Run "npm ci" to sync node_modules with package-lock.json.`,
    );
  }
  if (json.private) {
    continue;
  }
  const key = `${json.name}@${json.version}`;
  if (packages.has(key)) {
    continue;
  }
  const licenseFile = findLicenseFile(p);
  let licenses =
    json.license?.type ?? json.license ?? json.licenses?.map((l) => l.type ?? l).join(", ");
  if (!licenses) {
    licenses = licenseFile ? guessLicense(fs.readFileSync(licenseFile, "utf8")) : "UNKNOWN";
  }
  if (!isAllowed(licenses)) {
    fail(`Package "${key}" is licensed under "${licenses}" which is not permitted.`);
  }
  const publisher =
    typeof json.author === "string" ? json.author.replace(/\s*[<(].*$/, "") : json.author?.name;
  packages.set(key, {
    name: json.name,
    licenses,
    licenseFile,
    publisher,
    repository: normalizeRepository(json.repository),
  });
}

const outDir = path.join(rootDir, licenseFileDir);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
let html = `<html><body><table border="1px"><tr><th>Library</th><th>License</th><th>Publisher</th><th>Repository</th></tr>`;
[...packages.keys()].sort().forEach((key, index) => {
  const { name, licenses, licenseFile, publisher, repository } = packages.get(key);
  let license = escapeHTML(licenses);
  if (licenseFile) {
    fs.copyFileSync(licenseFile, path.join(outDir, `${index}.txt`));
    license = `<a href="${licenseFileDir}/${index}.txt">${license}</a>`;
  }
  const repo = repository
    ? `<a href="${escapeHTML(repository)}">${escapeHTML(repository)}</a>`
    : "";
  html += `<tr><td>${escapeHTML(name)}</td><td>${license}</td><td>${escapeHTML(publisher || "")}</td><td>${repo}</td></tr>`;
});
html += `</table></body></html>`;
fs.writeFileSync(path.join(rootDir, "third-party-licenses.html"), html);
