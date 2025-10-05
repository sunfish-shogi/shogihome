import fs from "node:fs";

function checkPackageJson(packageJsonPath: string) {
  const stat = fs.statSync(packageJsonPath);
  if (!stat.isFile()) {
    return;
  }
  const packageJson = fs.readFileSync(packageJsonPath, "utf-8");
  const { name, version, scripts } = JSON.parse(packageJson);

  // All packages should have preinstall scripts
  if (scripts?.preinstall) {
    throw new Error(`Package ${name}@${version} has unexpected preinstall scripts`);
  }

  switch (name) {
    // These packages have install.js scripts
    case "electron":
    case "esbuild":
      if (!scripts?.postinstall) {
        throw new Error(`Package ${name}@${version} is missing postinstall scripts`);
      }
      if (scripts.postinstall !== "node install.js") {
        throw new Error(`Package ${name}@${version} has unexpected postinstall scripts`);
      }
      break;

    // The postinstall is introduced since https://github.com/unrs/unrs-resolver/pull/66 (v1.6.0)
    case "unrs-resolver":
      if (!scripts?.postinstall) {
        throw new Error(`Package ${name}@${version} is missing postinstall scripts`);
      }
      if (!scripts.postinstall.match(/^napi-postinstall unrs-resolver [\d.]+ check$/)) {
        throw new Error(`Package ${name}@${version} has unexpected postinstall scripts`);
      }
      break;

    // Other packages should not have postinstall scripts
    default:
      if (scripts?.postinstall) {
        throw new Error(`Package ${name}@${version} has unexpected postinstall scripts`);
      }
      break;
  }
}

function main() {
  const nodeModules = fs.readdirSync("node_modules");
  for (const module of nodeModules) {
    if (module.startsWith(".")) {
      continue;
    }
    if (module.startsWith("@")) {
      const subModules = fs.readdirSync(`node_modules/${module}`);
      for (const subModule of subModules) {
        checkPackageJson(`node_modules/${module}/${subModule}/package.json`);
      }
      continue;
    }
    checkPackageJson(`node_modules/${module}/package.json`);
  }
}

main();
