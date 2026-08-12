/* eslint-disable no-console */
// engines/ 配下の C++ エンジンを Emscripten でビルドし、public/engines/ へ配置する。
//
// Emscripten は CI にも開発環境にも入っていないのが前提なので、次の順で探す。
//   1. 環境変数 EMSDK が指すディレクトリ (emsdk_env.sh を実行済みの場合)
//   2. PATH 上の emcmake
//   3. Docker (emscripten/emsdk イメージ)
//
// 生成物 (public/engines/<name>/<name>.js と .wasm) はリポジトリに commit する。
// これにより Emscripten の無い環境でも npm run build / npm test が通り、
// commit 済みの wasm に対する回帰テストを CI で実行できる。

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Docker を使う場合のイメージ。再現性のためタグを固定する。
const EMSDK_IMAGE = "emscripten/emsdk:4.0.9";

const rootDir = path.resolve(import.meta.dirname, "..");
const enginesDir = path.join(rootDir, "engines");
const buildDir = path.join(enginesDir, "build");
const outDir = path.join(rootDir, "public", "engines");

// engines/CMakeLists.txt で定義しているターゲット名と出力先の対応。
const ENGINES = [{ target: "basic", outName: "basic" }];

function hasCommand(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function resolveRunner() {
  const emsdk = process.env.EMSDK;
  if (emsdk) {
    const emcmake = path.join(emsdk, "upstream", "emscripten", "emcmake");
    if (fs.existsSync(emcmake)) {
      return { kind: "local", emcmake };
    }
  }
  if (hasCommand("emcmake")) {
    return { kind: "local", emcmake: "emcmake" };
  }
  if (hasCommand("docker")) {
    return { kind: "docker" };
  }
  throw new Error(
    "Emscripten が見つかりません。emsdk_env.sh を読み込むか、Docker を利用できるようにしてください。",
  );
}

function run(command, args, options) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function build(runner) {
  const cmakeArgs = ["cmake", "-S", "engines", "-B", "engines/build", "-DCMAKE_BUILD_TYPE=Release"];
  const buildArgs = ["cmake", "--build", "engines/build", "-j"];
  if (runner.kind === "local") {
    run(runner.emcmake, cmakeArgs, { cwd: rootDir });
    run(cmakeArgs[0], buildArgs.slice(1), { cwd: rootDir });
    return;
  }
  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${rootDir}:/src`,
    "-w",
    "/src",
    "-u",
    `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
    EMSDK_IMAGE,
    "sh",
    "-c",
    `emcmake ${cmakeArgs.join(" ")} && ${buildArgs.join(" ")}`,
  ];
  run("docker", dockerArgs, { cwd: rootDir });
}

function copyArtifacts() {
  for (const engine of ENGINES) {
    const destDir = path.join(outDir, engine.outName);
    fs.mkdirSync(destDir, { recursive: true });
    for (const ext of [".js", ".wasm"]) {
      const src = path.join(buildDir, `${engine.target}${ext}`);
      if (!fs.existsSync(src)) {
        throw new Error(`ビルド結果が見つかりません: ${src}`);
      }
      const dest = path.join(destDir, `${engine.outName}${ext}`);
      fs.copyFileSync(src, dest);
      const size = fs.statSync(dest).size;
      console.log(`${path.relative(rootDir, dest)} (${(size / 1024).toFixed(1)} KB)`);
    }
  }
}

const runner = resolveRunner();
console.log(`Emscripten: ${runner.kind === "local" ? runner.emcmake : EMSDK_IMAGE}`);
build(runner);
copyArtifacts();
console.log("done");
