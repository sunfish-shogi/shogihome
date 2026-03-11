#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginPath = path.resolve(root, "node_modules/.bin/protoc-gen-ts_proto");

const protoFiles = [
  "src/background/book/proto/sbk.proto",
  // Add more .proto files here as needed
];

for (const protoFile of protoFiles) {
  execFileSync(
    "protoc",
    [
      `--plugin=protoc-gen-ts_proto=${pluginPath}`,
      `--ts_proto_out=${root}`,
      "--ts_proto_opt=esModuleInterop=true",
      `--proto_path=${root}`,
      protoFile,
    ],
    { cwd: root, stdio: "inherit" },
  );

  const outPath = path.resolve(root, protoFile.replace(/\.proto$/, ".ts"));
  process.stdout.write(`Generated: ${outPath}\n`);
}
