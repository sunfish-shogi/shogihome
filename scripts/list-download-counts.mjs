/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import semver from "semver";

const apiURL = "https://api.github.com/repos/sunfish-shogi/shogihome/releases?per_page=100";
const platformNames = ["win", "mac", "linux"];
const distDir = "dist";
const outputCSV = path.join(distDir, "download-counts.csv");

fetch(apiURL)
  .then((response) => response.json())
  .then((releases) => {
    let csv = `tag,published,${platformNames.join(",")},sum\n`;
    releases = releases.sort((a, b) => semver.rcompare(a.tag_name, b.tag_name));
    for (const release of releases) {
      const tag = release.tag_name;
      if (tag.match(/-/)) {
        // Skip pre-releases (e.g., "v1.0.0-beta")
        continue;
      }
      const published = release.published_at;
      const m = Object.fromEntries(
        release.assets.map((asset) => {
          const platform = asset.name.match(/-([^-]+)\.zip$/)[1];
          return [platform, asset.download_count];
        }),
      );
      const columns = platformNames.map((platform) => m[platform] || 0);
      const sum = columns.reduce((a, b) => a + b, 0);
      csv += `${tag},${published},${columns.join(",")},${sum}\n`;
    }
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(outputCSV, csv);
    console.log(`Wrote ${outputCSV}`);
  })
  .catch((error) => {
    console.error(error);
  });
