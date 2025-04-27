import * as fs from "fs";
import * as path from "path";
import depcheck from "depcheck";

const name = process.argv[2];

const packageJsonFileName = "package.json";
const srcDir = path.join("src/command", name);
const distDir = path.join("dist/command", name);
const outputFilePath = path.join(distDir, packageJsonFileName);
const readmeSrcFilePath = path.join(srcDir, "README.md");
const readmeDistFilePath = path.join(distDir, "README.md");
const licenseSrcFilePath = path.join("LICENSE");
const licenseDistFilePath = path.join(distDir, "LICENSE");

const commonPackageJson = JSON.parse(fs.readFileSync(packageJsonFileName, "utf8"));
const packageJson = {
  ...commonPackageJson,
  name,
  description: `command line tool derived from ShogiHome(https://github.com/sunfish-shogi/shogihome)`,
  private: false,
  publishConfig: {
    access: "public",
  },
  homepage:
    "https://github.com/sunfish-shogi/shogihome/blob/main/src/command/usi-csa-bridge#readme",
  type: "commonjs",
  main: "index.js",
  bin: {
    cli: "index.js",
  },
  scripts: {},
  devDependencies: {},
};
depcheck(distDir, {
  package: packageJson,
}).then((result) => {
  packageJson.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).filter(([key]) => !result.dependencies.includes(key)),
  );
  fs.writeFileSync(outputFilePath, JSON.stringify(packageJson, null, 2), "utf8");
});

fs.copyFileSync(readmeSrcFilePath, readmeDistFilePath);
fs.copyFileSync(licenseSrcFilePath, licenseDistFilePath);
