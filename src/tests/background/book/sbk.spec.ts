import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { Move, Position } from "tsshogi";
import {
  buildSbkOnTheFlyIndex,
  loadSbkBook,
  normalizeSfen,
  searchSbkBookEntryOnTheFly,
  storeSbkBook,
} from "@/background/book/sbk.js";
import { toSbkMove } from "@/background/book/sbk_move.js";
import { SBook, SBookMoveEvaluation } from "@/background/book/proto/sbk.js";
import { getTempPathForTesting } from "@/background/proc/env.js";

const tmpdir = path.join(getTempPathForTesting(), "book");

function createMoveCode(pos: Position, usi: string): number {
  const move = pos.createMoveByUSI(usi);
  if (!(move instanceof Move)) {
    throw new Error(`invalid usi for test: ${usi}`);
  }
  return toSbkMove(move);
}

function createLoopSbkBuffer(): {
  buffer: Buffer;
  normalizedTargets: string[];
} {
  const startSfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
  const pos = Position.newBySFEN(startSfen);
  if (!pos) {
    throw new Error("failed to create start position");
  }
  const move0 = createMoveCode(pos, "7g7f");
  const m0 = pos.createMoveByUSI("7g7f");
  if (!(m0 instanceof Move) || !pos.doMove(m0, { ignoreValidation: true })) {
    throw new Error("failed to apply move 7g7f");
  }
  const sfen1 = pos.sfen;
  const move1 = createMoveCode(pos, "3c3d");
  const m1 = pos.createMoveByUSI("3c3d");
  if (!(m1 instanceof Move) || !pos.doMove(m1, { ignoreValidation: true })) {
    throw new Error("failed to apply move 3c3d");
  }
  const sfen2 = pos.sfen;
  const move2 = createMoveCode(pos, "2g2f");

  const buffer = Buffer.from(
    SBook.encode({
      Author: "test",
      Description: "loop",
      BookStates: [
        {
          Id: 42,
          BoardKey: 0n,
          HandKey: 0,
          Games: 1,
          WonBlack: 0,
          WonWhite: 0,
          Position: startSfen,
          Comment: "",
          Moves: [
            {
              Move: move0,
              Evaluation: SBookMoveEvaluation.None,
              Weight: 10,
              NextStateId: 1,
            },
          ],
          Evals: [],
        },
        {
          Id: 100,
          BoardKey: 0n,
          HandKey: 0,
          Games: 2,
          WonBlack: 1,
          WonWhite: 0,
          Position: "",
          Comment: "",
          Moves: [
            {
              Move: move1,
              Evaluation: SBookMoveEvaluation.Good,
              Weight: 20,
              NextStateId: 2,
            },
          ],
          Evals: [],
        },
        {
          Id: 100, // duplicate id (intentional)
          BoardKey: 0n,
          HandKey: 0,
          Games: 3,
          WonBlack: 2,
          WonWhite: 0,
          Position: "",
          Comment: "",
          Moves: [
            {
              Move: move2,
              Evaluation: SBookMoveEvaluation.Forced,
              Weight: 30,
              NextStateId: 1, // loop back by state index
            },
          ],
          Evals: [],
        },
      ],
    }).finish(),
  );
  return {
    buffer,
    normalizedTargets: [
      normalizeSfen(startSfen) as string,
      normalizeSfen(sfen1) as string,
      normalizeSfen(sfen2) as string,
    ],
  };
}

describe("background/book/sbk", () => {
  const testCases = [
    { input: "shogigui01.sbk", expected: "shogihome01.sbk" },
    { input: "shogigui02.sbk", expected: "shogihome02.sbk" },
    { input: "shogihome01.sbk", expected: "shogihome01.sbk" },
    { input: "shogihome02.sbk", expected: "shogihome02.sbk" },
  ];
  for (const { input, expected } of testCases) {
    it(`${input} → ${expected}`, async () => {
      const book = loadSbkBook(fs.readFileSync(`src/tests/testdata/book/${input}`));

      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on("data", (chunk: Buffer) => chunks.push(chunk));
      const finished = new Promise<void>((resolve) => pass.on("finish", resolve));

      await storeSbkBook(book, pass);
      await finished;

      const outputHex = Buffer.concat(chunks).toString("hex");
      const expectedHex = fs.readFileSync(`src/tests/testdata/book/${expected}`).toString("hex");
      expect(outputHex).toBe(expectedHex);
    });
  }

  it("on-the-fly index: handles duplicate/non-sequential ids and loop edges by state index", async () => {
    fs.mkdirSync(tmpdir, { recursive: true });
    const fixturePath = path.join(tmpdir, "loop-index.sbk");
    const { buffer, normalizedTargets } = createLoopSbkBuffer();
    await fs.promises.writeFile(fixturePath, buffer);

    const baseline = loadSbkBook(buffer);
    const baselineByNormalized = new Map<string, string[]>();
    for (const [sfen, entry] of baseline.entries) {
      const normalized = normalizeSfen(sfen);
      if (!normalized) {
        continue;
      }
      baselineByNormalized.set(
        normalized,
        entry.moves.map((move) => move.usi),
      );
    }

    const index = buildSbkOnTheFlyIndex(buffer);
    expect(index.firstNonZeroRow).toBeLessThan(index.rowCount);
    const file = await fs.promises.open(fixturePath, "r");

    try {
      for (const target of normalizedTargets) {
        const expectedMoves = baselineByNormalized.get(target) ?? [];
        const actual = await searchSbkBookEntryOnTheFly(target, file, index);
        expect(actual?.moves.map((move) => move.usi) ?? []).toEqual(expectedMoves);
      }
    } finally {
      await file.close();
    }
  });
});
