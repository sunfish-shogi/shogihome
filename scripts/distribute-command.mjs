/* eslint-disable no-console */
import * as fs from "fs";
import * as path from "path";
import depcheck from "depcheck";

const name = process.argv[2];

const packageJsonFileName = "package.json";
const srcDir = path.join("src/command", name);
const distDir = path.join("dist/command", name);
const programFilePath = path.join(distDir, "index.js");
const outputFilePath = path.join(distDir, packageJsonFileName);
const readmeSrcFilePath = path.join(srcDir, "README.md");
const readmeDistFilePath = path.join(distDir, "README.md");
const licenseSrcFilePath = path.join("LICENSE");
const licenseDistFilePath = path.join(distDir, "LICENSE");
const e2eSrcDir = path.join(srcDir, "e2e");
const e2eDistDir = path.join(distDir, "e2e");

const commonPackageJson = JSON.parse(fs.readFileSync(packageJsonFileName, "utf8"));
const packageJson = {
  name,
  version: commonPackageJson.version,
  description: `command line tool derived from ShogiHome(https://github.com/sunfish-shogi/shogihome)`,
  author: commonPackageJson.author,
  license: commonPackageJson.license,
  private: false,
  repository: commonPackageJson.repository,
  keywords: commonPackageJson.keywords,
  bugs: commonPackageJson.bugs,
  publishConfig: {
    access: "public",
  },
  homepage: `https://github.com/sunfish-shogi/shogihome/blob/main/src/command/${name}#readme`,
  type: "commonjs",
  main: "index.js",
  bin: {
    cli: "index.js",
  },
  files: ["LICENSE", "README.md", "index.js", "package.json"],
  scripts: {},
  dependencies: commonPackageJson.dependencies,
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

if (fs.existsSync(e2eSrcDir)) {
  fs.cpSync(e2eSrcDir, e2eDistDir, { recursive: true });
}

// Check if 'electron' is found in the program file
const program = fs.readFileSync(programFilePath, "utf-8");
const electronPattern = /\belectron\b/;
if (electronPattern.test(program)) {
  console.error(`❌ 'electron' (as a word) is found in ${programFilePath}`);
  process.exit(1);
}
