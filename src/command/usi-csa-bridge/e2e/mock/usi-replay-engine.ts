/* eslint-disable no-console */
import path from "node:path";
import { createInterface } from "node:readline";
import { parseScript, Replayer } from "./replayer";

const COMMAND_FILE = process.argv[2];

if (!COMMAND_FILE) {
  console.error("Usage: tsx csa-replay-server.ts <command-list>");
  process.exit(1);
}

const steps = parseScript(path.resolve(COMMAND_FILE));
console.log(`Loaded ${steps.length} steps from ${COMMAND_FILE}`);

function start() {
  const replayer = new Replayer(
    steps,
    (line) => {
      console.log(line);
    },
    (exitCode) => {
      process.exit(exitCode);
    },
  );

  process.stdin.setEncoding("utf8");
  createInterface({
    input: process.stdin,
  }).on("line", (line) => {
    replayer.feed(line);
  });

  replayer.start();
}

start();
