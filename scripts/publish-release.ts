/* eslint-disable no-console,no-restricted-imports */
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { Releases } from "../src/common/version";
import * as semver from "semver";

const releaseJSON = "docs/release.json";
const releaseWinJSON = "docs/release-win.json";
const releaseMacJSON = "docs/release-mac.json";
const releaseLinuxJSON = "docs/release-linux.json";

const platformJSONs: Record<string, string> = {
  win: releaseWinJSON,
  mac: releaseMacJSON,
  linux: releaseLinuxJSON,
};

type Target = "stable" | "latest";

type Args = {
  target: Target;
  /** Skip interactive prompts (for CI). */
  yes: boolean;
  /** Comma-separated platform list or "all". Only used with --yes. */
  platforms?: string;
};

function parseArgs(): Args {
  let target: Target = "latest";
  let yes = false;
  let platforms: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg.startsWith("--platforms=")) {
      platforms = arg.slice("--platforms=".length);
    } else if (arg === "stable" || arg === "latest") {
      target = arg;
    } else if (arg === "" || arg === undefined) {
      // ignore
    } else {
      throw new Error(`Invalid argument: ${arg}`);
    }
  }
  return { target, yes, platforms };
}

function resolvePlatformPaths(platforms?: string): string[] {
  const keys =
    !platforms || platforms === "all" ? Object.keys(platformJSONs) : platforms.split(",");
  return keys.map((key) => {
    const path = platformJSONs[key.trim()];
    if (!path) {
      throw new Error(`Invalid platform: ${key}`);
    }
    return path;
  });
}

async function inputPlatforms(): Promise<string[]> {
  const stdio = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const paths = [] as string[];
    if (!/^n/i.test(await stdio.question(`Do you want to update ${releaseWinJSON}? [Y/n]:`))) {
      paths.push(releaseWinJSON);
    }
    if (!/^n/i.test(await stdio.question(`Do you want to update ${releaseMacJSON}? [Y/n]:`))) {
      paths.push(releaseMacJSON);
    }
    if (!/^n/i.test(await stdio.question(`Do you want to update ${releaseLinuxJSON}? [Y/n]:`))) {
      paths.push(releaseLinuxJSON);
    }
    return paths;
  } finally {
    stdio.close();
  }
}

async function updateReleaseJSON(target: Target) {
  const releases = JSON.parse(fs.readFileSync(releaseJSON, "utf-8")) as Releases;

  console.log(`Current latest version: ${releases.latest.version}`);
  console.log(`Current stable version: ${releases.stable.version}`);

  let latest: string;
  let stable: string;

  if (target === "stable") {
    const stableSemver = semver.parse(releases.stable.version);
    if (!stableSemver) {
      throw new Error("Invalid stable version");
    }
    stableSemver.patch++;

    latest = releases.latest.version;
    stable = stableSemver.format() as string;
  } else {
    latest = semver.clean(JSON.parse(fs.readFileSync("package.json", "utf-8")).version) as string;

    const isMinorUpdate =
      semver.major(latest) !== semver.major(releases.latest.version) ||
      semver.minor(latest) !== semver.minor(releases.latest.version);
    stable = isMinorUpdate ? releases.latest.version : releases.stable.version;
  }

  console.log(`New latest version: ${latest}`);
  console.log(`New stable version: ${stable}`);

  releases.stable = {
    version: stable,
    tag: `v${stable}`,
    link: `https://github.com/sunfish-shogi/shogihome/releases/tag/v${stable}`,
  };
  releases.latest = {
    version: latest,
    tag: `v${latest}`,
    link: `https://github.com/sunfish-shogi/shogihome/releases/tag/v${latest}`,
  };
  const json = JSON.stringify(releases, null, 1);
  fs.writeFileSync(releaseJSON, json);
}

async function main() {
  const args = parseArgs();
  const paths = args.yes ? resolvePlatformPaths(args.platforms) : await inputPlatforms();
  await updateReleaseJSON(args.target);
  for (const path of paths) {
    fs.copyFileSync(releaseJSON, path);
  }
  console.log("updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
