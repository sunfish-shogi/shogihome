/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import * as semver from "semver";

/**
 * Release types accepted by the CI release workflow.
 *
 * Each type maps to a set of `npm version` arguments. Whether the resulting
 * version is a pre-release is detected afterwards from package.json, and the
 * website (docs/release.json, docs HTML, webapp bundle) is only updated for
 * non-pre-release versions.
 *
 *   minor            1.1.0        -> 1.2.0
 *   patch            1.1.0        -> 1.1.1
 *   major            1.1.0        -> 2.0.0
 *   preminor-alpha   1.1.0        -> 1.2.0-alpha.0
 *   preminor-beta    1.1.0        -> 1.2.0-beta.0
 *   prerelease       1.1.0-alpha.0 -> 1.1.0-alpha.1
 *   prerelease-beta  1.1.0-alpha.0 -> 1.1.0-beta.0
 *   finalize         1.1.0-alpha.0 -> 1.1.0
 */
const releaseTypeToVersionArgs: Record<string, string[]> = {
  minor: ["minor"],
  patch: ["patch"],
  major: ["major"],
  "preminor-alpha": ["preminor", "--preid", "alpha"],
  "preminor-beta": ["preminor", "--preid", "beta"],
  prerelease: ["prerelease"],
  "prerelease-beta": ["prerelease", "--preid", "beta"],
  finalize: ["patch"],
};

function run(command: string, args: string[]) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit" });
}

function readVersion(): string {
  return JSON.parse(fs.readFileSync("package.json", "utf-8")).version;
}

function validateReleaseType(releaseType: string, currentVersion: string) {
  const currentIsPrerelease = semver.prerelease(currentVersion) !== null;

  // prerelease / prerelease-beta / finalize require the current version to be a prerelease
  if (["prerelease", "prerelease-beta", "finalize"].includes(releaseType) && !currentIsPrerelease) {
    throw new Error(
      `Release type '${releaseType}' requires the current version to be a prerelease. ` +
        `Current version: ${currentVersion}`,
    );
  }
}

function main() {
  const releaseType = process.argv[2];
  const versionArgs = releaseTypeToVersionArgs[releaseType];
  if (!versionArgs) {
    throw new Error(
      `Invalid release type: ${releaseType}. ` +
        `Valid types: ${Object.keys(releaseTypeToVersionArgs).join(", ")}`,
    );
  }

  const currentVersion = readVersion();
  validateReleaseType(releaseType, currentVersion);

  // 1. Commit the third-party license report if it changed.
  run("npm", ["run", "license:commit"]);

  // 2. Bump the version. This creates a commit and a `v<version>` tag.
  run("npm", ["version", ...versionArgs]);

  const version = readVersion();
  const isPrerelease = semver.prerelease(version) !== null;
  console.log(`New version: ${version} (prerelease: ${isPrerelease})`);

  // 3. For final (non-pre-release) versions, update the website assets that
  //    advertise the latest/stable versions and produce the release commit.
  //    Pre-releases only publish a tag, matching the previous local behavior.
  if (!isPrerelease) {
    run("npm", [
      "exec",
      "--",
      "tsx",
      "scripts/publish-release.ts",
      "latest",
      "--yes",
      "--platforms=all",
    ]);
    run("npm", ["run", "docs"]);
    run("npm", ["run", "release"]);
  }

  // Expose the tag name to the workflow via the step summary output file.
  const tag = `v${version}`;
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    fs.appendFileSync(outputPath, `tag=${tag}\nversion=${version}\nprerelease=${isPrerelease}\n`);
  }
  console.log(`Prepared release ${tag}.`);
}

main();
