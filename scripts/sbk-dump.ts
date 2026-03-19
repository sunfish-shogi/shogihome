// sbk-dump: output the content of .sbk file as YAML for debugging
//
// Usage:
//   npx tsx scripts/sbk-dump.ts path/to/file.sbk

import fs from "node:fs";
import { stringify } from "yaml";
import { SBook, SBookMoveEvalution } from "@/background/book/proto/sbk.js";

const path = process.argv[2];
if (!path) {
  process.stderr.write("Usage: sbk-dump <file.sbk>\n");
  process.exit(1);
}

const data = fs.readFileSync(path);

const raw = SBook.decode(data);

const evalutionNames: Record<number, string> = {
  [SBookMoveEvalution.None]: "None",
  [SBookMoveEvalution.Forced]: "Forced",
  [SBookMoveEvalution.Good]: "Good",
  [SBookMoveEvalution.Bad]: "Bad",
  [SBookMoveEvalution.Blunder]: "Blunder",
};

const states = raw.BookStates.map((state) => ({
  Id: state.Id,
  Games: state.Games,
  WonBlack: state.WonBlack,
  WonWhite: state.WonWhite,
  BoardKey: state.BoardKey.toString(),
  HandKey: state.HandKey,
  Position: state.Position || null,
  Comment: state.Comment || null,
  Moves: state.Moves.map((m) => ({
    Move: `0x${(m.Move >>> 0).toString(16).padStart(8, "0")}`,
    Evalution: evalutionNames[m.Evalution] ?? m.Evalution,
    Weight: m.Weight,
    NextStateId: m.NextStateId,
  })),
  Evals: state.Evals.map((e) => ({
    EvalutionValue: e.EvalutionValue,
    Depth: e.Depth,
    SelDepth: e.SelDepth,
    Nodes: e.Nodes.toString(),
    Variation: e.Variation || null,
    EngineName: e.EngineName || null,
  })),
}));

const output = {
  file: path,
  Author: raw.Author || null,
  Description: raw.Description || null,
  stateCount: raw.BookStates.length,
  states,
};

// eslint-disable-next-line no-console
console.log(stringify(output, { lineWidth: 120 }));
