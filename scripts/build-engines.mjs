/* eslint-disable no-console */
// engines/ 配下の C++ エンジンをビルドする。
//
//   node scripts/build-engines.mjs            WebAssembly へビルドし public/engines/ へ配置する
//   node scripts/build-engines.mjs --native   ネイティブへビルドする (デバッグと対話実行用)
//   node scripts/build-engines.mjs --native --test  ネイティブへビルドしてテストを実行する
//
// package.json からは次の名前で呼べる。
//   npm run engines:build   (WebAssembly)
//   npm run engines:native  (ネイティブ)
//   npm run engines:test    (ネイティブ + テスト)
//
// WebAssembly ビルドに使う Emscripten は CI にも開発環境にも入っていないのが前提なので、
// 次の順で探す。
//   1. Docker (emscripten/emsdk イメージ)
//   2. 環境変数 EMSDK が指すディレクトリ (emsdk_env.sh を実行済みの場合)
//   3. PATH 上の emcmake
//
// Docker を優先するのは、生成物を commit する運用だから。バージョンを固定した
// イメージなら誰がビルドしても同じ結果になるが、ローカルの Emscripten は
// バージョンがまちまちで、無関係な差分が commit に混ざる。
// ローカルを使いたい場合は ENGINES_NO_DOCKER=1 を指定する。
//
// 生成物 (public/engines/<name>/<name>.js と .wasm) はリポジトリに commit する。
// これにより Emscripten の無い環境でも npm run build / npm test が通り、
// commit 済みの wasm に対する回帰テストを CI で実行できる。
//
// ネイティブビルドに必要なのは CMake と C++20 のコンパイラだけで、Emscripten は要らない。

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Docker を使う場合のイメージ。再現性のためタグを固定する。
const EMSDK_IMAGE = "emscripten/emsdk:6.0.6";

const rootDir = path.resolve(import.meta.dirname, "..");
const enginesDir = path.join(rootDir, "engines");
const outDir = path.join(rootDir, "public", "engines");

// engines/CMakeLists.txt で定義しているターゲット名と出力先の対応。
const ENGINES = [{ target: "basic", outName: "basic" }];

const args = process.argv.slice(2);
const nativeMode = args.includes("--native");
const testMode = args.includes("--test");
// ビルドディレクトリは wasm とネイティブで分ける (どちらも .gitignore 済み)。
const buildDirName = nativeMode ? "build-native" : "build";
const buildDir = path.join(enginesDir, buildDirName);

function hasCommand(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

// docker --version はデーモンが止まっていても成功するので、実際に繋がるかまで見る。
function hasDocker() {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function resolveLocalRunner() {
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
  return undefined;
}

function resolveRunner() {
  // バージョンを固定した Docker イメージを優先する (先頭のコメントを参照)。
  if (!process.env.ENGINES_NO_DOCKER && hasDocker()) {
    return { kind: "docker" };
  }
  const local = resolveLocalRunner();
  if (local) {
    return local;
  }
  throw new Error(
    "Emscripten が見つかりません。Docker を利用できるようにするか、emsdk_env.sh を読み込んでください。",
  );
}

function run(command, args, options) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", ...options });
}

const configureArgs = [
  "cmake",
  "-S",
  "engines",
  "-B",
  `engines/${buildDirName}`,
  "-DCMAKE_BUILD_TYPE=Release",
];
const buildArgs = ["cmake", "--build", `engines/${buildDirName}`, "-j"];

function buildNative() {
  if (!hasCommand("cmake")) {
    throw new Error("CMake が見つかりません。https://cmake.org からインストールしてください。");
  }
  run(configureArgs[0], configureArgs.slice(1), { cwd: rootDir });
  run(buildArgs[0], buildArgs.slice(1), { cwd: rootDir });
}

function buildWasm(runner) {
  if (runner.kind === "local") {
    run(runner.emcmake, configureArgs, { cwd: rootDir });
    run(buildArgs[0], buildArgs.slice(1), { cwd: rootDir });
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
    `emcmake ${configureArgs.join(" ")} && ${buildArgs.join(" ")}`,
  ];
  run("docker", dockerArgs, { cwd: rootDir });
}

function runTests() {
  run("ctest", ["--test-dir", `engines/${buildDirName}`, "--output-on-failure"], { cwd: rootDir });
}

function copyArtifacts() {
  for (const engine of ENGINES) {
    const destDir = path.join(outDir, engine.outName);
    fs.mkdirSync(destDir, { recursive: true });
    const files = [
      // マニフェストはソースツリー側が正で、ビルド結果と一緒に配置する。
      { src: path.join(enginesDir, engine.target, "engine.json"), dest: "engine.json" },
      { src: path.join(buildDir, `${engine.target}.js`), dest: `${engine.outName}.js` },
      { src: path.join(buildDir, `${engine.target}.wasm`), dest: `${engine.outName}.wasm` },
    ];
    for (const file of files) {
      if (!fs.existsSync(file.src)) {
        throw new Error(`ファイルが見つかりません: ${file.src}`);
      }
      const dest = path.join(destDir, file.dest);
      fs.copyFileSync(file.src, dest);
      fs.chmodSync(dest, 0o644);
      const size = fs.statSync(dest).size;
      console.log(`${path.relative(rootDir, dest)} (${(size / 1024).toFixed(1)} KB)`);
    }
  }
}

// 標準入出力で対話できる実行ファイルの場所を案内する。
// Visual Studio のようなマルチ構成のジェネレーターでは構成名のサブディレクトリに置かれる。
function printExecutables() {
  console.log("");
  for (const engine of ENGINES) {
    const candidates = [
      path.join(buildDir, engine.target),
      path.join(buildDir, `${engine.target}.exe`),
      path.join(buildDir, "Release", `${engine.target}.exe`),
      path.join(buildDir, "Debug", `${engine.target}.exe`),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) {
      console.log(`USI エンジン: ${path.relative(rootDir, found)}`);
    }
  }
}

if (nativeMode) {
  buildNative();
  if (testMode) {
    runTests();
  }
  printExecutables();
} else {
  if (testMode) {
    throw new Error("--test は --native と一緒に指定してください。");
  }
  const runner = resolveRunner();
  if (runner.kind === "docker") {
    console.log(`Emscripten: ${EMSDK_IMAGE} (Docker)`);
  } else {
    console.log(`Emscripten: ${runner.emcmake} (ローカル)`);
    console.log(`  生成物を commit する場合は ${EMSDK_IMAGE} でビルドし直すこと。`);
  }
  buildWasm(runner);
  copyArtifacts();
}
console.log("done");
