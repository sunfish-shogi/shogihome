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

  // ID → state のマップを構築
  const idToState = new Map<number, SBookState>();
  for (const state of book.BookStates) {
    idToState.set(state.Id, state);
  }

  // Position フィールドを持つ局面をシードとして BFS で SFEN を伝播させる
  const idToSfen = new Map<number, string>();
  const queue: number[] = [];

  for (const state of book.BookStates) {
    if (state.Position) {
      const sfen = normalizeSfen(state.Position);
      if (sfen && !idToSfen.has(state.Id)) {
        idToSfen.set(state.Id, sfen);
        queue.push(state.Id);
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const stateId = queue[head];
    const sfen = idToSfen.get(stateId)!;
    const state = idToState.get(stateId);
    if (!state) continue;

    const pos = Position.newBySFEN(sfen);
    if (!pos) continue;

    for (const m of state.Moves) {
      if (m.NextStateId === 0 || idToSfen.has(m.NextStateId)) continue;
      const usi = fromSbkMove(m.Move);
      const move = pos.createMoveByUSI(usi);
      if (!move) continue;
      const nextPos = pos.clone();
      nextPos.doMove(move);
      idToSfen.set(m.NextStateId, nextPos.sfen);
      queue.push(m.NextStateId);
    }
  }

  // SFEN が確定した局面をエントリーとして登録
  const entries = new Map<string, BookEntry>();
  for (const state of book.BookStates) {
    const sfen = idToSfen.get(state.Id);
    if (!sfen) continue;

    const scoreFromEval = state.Evals[0]?.EvalutionValue;
    const depthFromEval = state.Evals[0]?.Depth;

    const pos = Position.newBySFEN(sfen);
    const moves: BookMove[] = state.Moves.flatMap((m) => {
      const usi = fromSbkMove(m.Move);
      if (!pos || !pos.createMoveByUSI(usi)) return [];
      return [[usi, undefined, scoreFromEval, depthFromEval, m.Weight || undefined, ""]];
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

  // Collect all state IDs reachable via NextStateId.
  // Only states NOT in this set need a Position field as BFS anchor.
  const reachableIds = new Set<number>();
  for (const [sfen, entry] of book.entries) {
    const pos = Position.newBySFEN(sfen);
    if (!pos) continue;
    for (const bookMove of entry.moves) {
      const move = pos.createMoveByUSI(bookMove[IDX_USI]);
      if (!move) continue;
      const nextPos = pos.clone();
      nextPos.doMove(move);
      const nextId = sfenToId.get(nextPos.sfen);
      if (nextId !== undefined) reachableIds.add(nextId);
    }
  }

  const states: SBookState[] = [];

  for (const [sfen, entry] of book.entries) {
    const stateId = sfenToId.get(sfen)!;
    const color = sfen.split(" ")[1] === "b" ? Color.BLACK : Color.WHITE;
    const pos = Position.newBySFEN(sfen);

    const sbkMoves: SBookMoveProto[] = entry.moves.flatMap((bookMove) => {
      const usi = bookMove[IDX_USI];
      if (!pos) return [];
      const move = pos.createMoveByUSI(usi);
      if (!move) return [];
      const nextPos = pos.clone();
      nextPos.doMove(move);
      const nextStateId = sfenToId.get(nextPos.sfen) ?? 0;
      return [
        {
          Move: toSbkMove(usi, color),
          Evalution: SBookMoveEvalution.None,
          Weight: bookMove[IDX_COUNT] ?? 0,
          NextStateId: nextStateId,
        },
      ];
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
      // Only anchor states (not reachable via NextStateId) need Position.
      Position: reachableIds.has(stateId) ? undefined : sfen,
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
