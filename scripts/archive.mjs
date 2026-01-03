/* eslint-disable no-console */
import archiver from "archiver";
import fs from "node:fs";

const platform = process.argv[2];
const version = process.argv[3];
const variant = process.argv[4] || "installer";
const outputPath =
  variant === "portable"
    ? `dist/release-${version}-portable.zip`
    : `dist/release-${version}-${platform}.zip`;

const packageJson = JSON.parse(fs.readFileSync("./package.json"));
if (`v${packageJson.version}` !== version) {
  throw new Error("invalid release version");
}

const output = fs.createWriteStream(outputPath).on("error", function (err) {
  throw err;
});
const archive = archiver
  .create("zip")
  .on("warning", function (err) {
    if (err.code === "ENOENT") {
      console.log(err);
    } else {
      throw err;
    }
  })
  .on("error", function (err) {
    throw err;
  });
archive.pipe(output);

switch (platform) {
  case "win":
    archive.glob("*.exe", { cwd: "dist" });
    break;
  case "mac":
    archive.glob("*.dmg", { cwd: "dist" });
    break;
  case "linux":
    archive.glob("*.AppImage", { cwd: "dist" });
    break;
  default:
    throw new Error("unknown platform");
}
archive.file("LICENSE", { name: "LICENSE.txt" });
archive.file("docs/third-party-licenses.html", {
  name: "third-party-licenses.html",
});
archive.glob("third-party-licenses/*.txt", { cwd: "docs" });

archive.finalize();
