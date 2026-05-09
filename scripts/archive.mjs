/* eslint-disable no-console */
import archiver from "archiver";
import fs from "node:fs";

const platform = process.argv[2];
const version = process.argv[3];
const variant = process.argv[4] || "installer";

const packageJson = JSON.parse(fs.readFileSync("./package.json"));
if (`v${packageJson.version}` !== version) {
  throw new Error("invalid release version");
}

function createArchive(outputPath, globPattern) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath).on("error", reject).on("finish", resolve);
    const archive = archiver
      .create("zip")
      .on("warning", function (err) {
        if (err.code === "ENOENT") {
          console.log(err);
        } else {
          reject(err);
        }
      })
      .on("error", reject);
    archive.pipe(output);
    archive.glob(globPattern, { cwd: "dist" });
    archive.file("LICENSE", { name: "LICENSE.txt" });
    archive.file("docs/third-party-licenses.html", {
      name: "third-party-licenses.html",
    });
    archive.glob("third-party-licenses/*.txt", { cwd: "docs" });
    archive.finalize().catch(reject);
  });
}

switch (platform) {
  case "win":
    await createArchive(
      variant === "portable"
        ? `dist/release-${version}-portable.zip`
        : `dist/release-${version}-win.zip`,
      "*.exe",
    );
    break;
  case "mac":
    await createArchive(`dist/release-${version}-mac.zip`, "*.dmg");
    break;
  case "linux":
    await Promise.all([
      createArchive(`dist/release-${version}-linux-appimage.zip`, "*.AppImage"),
      createArchive(`dist/release-${version}-linux-deb.zip`, "*.deb"),
    ]);
    break;
  default:
    throw new Error("unknown platform");
}
