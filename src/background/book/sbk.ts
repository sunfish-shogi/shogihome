import events from "node:events";
import { Writable } from "node:stream";
import { Color, Position } from "tsshogi";
import {
  SBook,
  SBookEval,
  SBookMove as SBookMoveProto,
  SBookMoveEvalution,
  SBookState,
} from "./proto/sbk.js";
import { BookEntry, BookMove, IDX_COUNT, IDX_DEPTH, IDX_SCORE, IDX_USI, SbkBook } from "./types.js";
import { fromSbkMove, toSbkMove } from "./sbk_move.js";

function normalizeSfen(position: string): string | undefined {
  let s = position.trim();
  if (s.startsWith("position sfen ")) {
    s = s.slice("position sfen ".length);
  } else if (s.startsWith("sfen ")) {
    s = s.slice("sfen ".length);
  }
  // SFEN format: "board color hand moveCount" — normalize moveCount to 1
  const parts = s.split(" ");
  if (parts.length < 3) return undefined;
  return parts.slice(0, 3).join(" ") + " 1";
}

export function loadSbkBook(data: Buffer | Uint8Array): SbkBook {
  const book = SBook.decode(data);
  const entries = new Map<string, BookEntry>();

  for (const state of book.BookStates) {
    if (!state.Position) continue;
    const sfen = normalizeSfen(state.Position);
    if (!sfen) continue;

    const scoreFromEval = state.Evals[0]?.EvalutionValue;
    const depthFromEval = state.Evals[0]?.Depth;

    const moves: BookMove[] = state.Moves.map((m) => {
      const usi = fromSbkMove(m.Move);
      return [usi, undefined, scoreFromEval, depthFromEval, m.Weight || undefined, ""];
    });

    entries.set(sfen, {
      type: "normal",
      comment: state.Comment ?? "",
      moves,
      minPly: 0,
    });
  }

  return { format: "sbk", entries };
}

export async function storeSbkBook(book: SbkBook, output: Writable): Promise<void> {
  // Assign state IDs
  const sfenToId = new Map<string, number>();
  let nextId = 1;
  for (const sfen of book.entries.keys()) {
    sfenToId.set(sfen, nextId++);
  }

  const states: SBookState[] = [];

  for (const [sfen, entry] of book.entries) {
    const stateId = sfenToId.get(sfen)!;
    const color = sfen.split(" ")[1] === "b" ? Color.BLACK : Color.WHITE;
    const pos = Position.newBySFEN(sfen);

    const sbkMoves: SBookMoveProto[] = entry.moves.map((bookMove) => {
      const usi = bookMove[IDX_USI];
      let nextStateId = 0;
      if (pos) {
        const move = pos.createMoveByUSI(usi);
        if (move) {
          const nextPos = pos.clone();
          nextPos.doMove(move);
          nextStateId = sfenToId.get(nextPos.sfen) ?? 0;
        }
      }
      return {
        Move: toSbkMove(usi, color),
        Evalution: SBookMoveEvalution.None,
        Weight: bookMove[IDX_COUNT] ?? 0,
        NextStateId: nextStateId,
      };
    });

    const evals: SBookEval[] = [];
    const firstWithScore = entry.moves.find((m) => m[IDX_SCORE] !== undefined);
    if (firstWithScore) {
      evals.push({
        EvalutionValue: firstWithScore[IDX_SCORE] ?? 0,
        Depth: firstWithScore[IDX_DEPTH] ?? 0,
        SelDepth: 0,
        Nodes: 0n,
        Variation: "",
      });
    }

    states.push({
      Id: stateId,
      BoardKey: 0n,
      HandKey: 0,
      Games: 0,
      WonBlack: 0,
      WonWhite: 0,
      Position: sfen,
      Comment: entry.comment || undefined,
      Moves: sbkMoves,
      Evals: evals,
    });
  }

  const encoded = SBook.encode({ Author: "", Description: "", BookStates: states }).finish();
  if (!output.write(encoded)) {
    await events.once(output, "drain");
  }
  output.end();
  await events.once(output, "finish");
}
