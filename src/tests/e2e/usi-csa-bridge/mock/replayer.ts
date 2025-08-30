/* eslint-disable no-console */
import fs from "node:fs";

export type Step = {
  kind: "send" | "recv";
  body: string;
  srcLine: number;
};

export function parseScript(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const steps: Step[] = [];
  for (const [i, line0] of lines.entries()) {
    const line = line0.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(send|recv)\s*:(.*)$/.exec(line);
    if (!m) {
      throw new Error(
        `Invalid script line ${i + 1}: ${line0}\nExpected "send:<text>" or "recv:<text>"`,
      );
    }
    const [, kind, body] = m;
    steps.push({
      kind: kind as "send" | "recv",
      body: body.trim(),
      srcLine: i + 1,
    });
  }
  if (steps.length === 0) {
    throw new Error("Script is empty after filtering comments/blank lines.");
  }
  return steps;
}

export class Replayer {
  private idx = 0;

  constructor(
    private steps: Step[],
    private sendLine: (text: string) => void,
    private end: (exitCode: number) => void,
  ) {}

  public start() {
    this.advance();
  }

  public feed(line: string) {
    if (this.idx >= this.steps.length) {
      console.warn("ERR unexpected input after script end\n");
      this.end(1);
      return;
    }
    const exp = this.steps[this.idx];
    if (exp.kind !== "recv") {
      console.warn("ERR server script error: recv while expecting send\n");
      this.end(1);
      return;
    }

    if (line === exp.body) {
      this.idx++;
      this.advance();
    } else {
      const msg = `ERR expected: "${exp.body}", got: "${line}"`;
      console.warn(`[mismatch] ${msg}`);
      this.end(1);
    }
  }

  private advance() {
    while (this.idx < this.steps.length && this.steps[this.idx].kind === "send") {
      this.sendLine(this.steps[this.idx].body);
      this.idx++;
    }
    if (this.idx >= this.steps.length) {
      this.end(0);
      return;
    }
  }
}
