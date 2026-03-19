import events from "node:events";
import { Writable } from "node:stream";
import { Position } from "tsshogi";
import {
  SBook,
  SBookMove as SBookMoveProto,
  SBookMoveEvaluation,
  SBookState,
} from "./proto/sbk.js";
import {
  BookEntry,
  BookMove,
  IDX_COUNT,
  IDX_EVALUATION,
  IDX_USI,
  SbkBook,
  SbkEval,
} from "./types.js";
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
      if (m.NextStateId < 0 || idToSfen.has(m.NextStateId)) continue;
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

    const pos = Position.newBySFEN(sfen);
    const moves: BookMove[] = state.Moves.flatMap((m) => {
      const usi = fromSbkMove(m.Move);
      if (!pos || !pos.createMoveByUSI(usi)) return [];
      return [[usi, undefined, undefined, undefined, m.Weight || undefined, "", m.Evaluation]];
    });

    const sbkEvals: SbkEval[] = state.Evals.map((e) => ({
      EvaluationValue: e.EvaluationValue,
      Depth: e.Depth,
      SelDepth: e.SelDepth,
      Nodes: e.Nodes,
      Variation: e.Variation || undefined,
      EngineName: e.EngineName || undefined,
    }));

    entries.set(sfen, {
      type: "normal",
      comment: state.Comment ?? "",
      moves,
      minPly: 0,
      games: state.Games,
      wonBlack: state.WonBlack,
      wonWhite: state.WonWhite,
      sbkEvals: sbkEvals.length > 0 ? sbkEvals : undefined,
    });
  }

  return { format: "sbk", entries, sbkAuthor: book.Author, sbkDescription: book.Description };
}

export async function storeSbkBook(book: SbkBook, output: Writable): Promise<void> {
  // Assign state IDs to book.entries states.
  const sfenToId = new Map<string, number>();
  let nextId = 0;
  for (const sfen of book.entries.keys()) {
    sfenToId.set(sfen, nextId++);
  }

  // Discover leaf next-states: positions reachable via moves but not in book.entries.
  // Also compute reachable state IDs (states that are destinations of any move).
  // Both are done in a single pass to avoid redundant Position computation.
  //
  // BookConv (SBook.cs) always creates a SBookState for every next position, so we must
  // do the same. BookConv.Load() resolves NextStateId using array index
  // (book.BookStates[move.NextStateId]), so every referenced Id must have a corresponding
  // entry at that index in the output array.
  const leafSfens = new Map<string, number>(); // SFEN → Id for leaf states
  const reachableIds = new Set<number>();
  for (const [sfen, entry] of book.entries) {
    const pos = Position.newBySFEN(sfen);
    if (!pos) continue;
    for (const bookMove of entry.moves) {
      const move = pos.createMoveByUSI(bookMove[IDX_USI]);
      if (!move) continue;
      const nextPos = pos.clone();
      nextPos.doMove(move);
      const nextSfen = nextPos.sfen;
      if (!sfenToId.has(nextSfen) && !leafSfens.has(nextSfen)) {
        leafSfens.set(nextSfen, nextId++);
      }
      const id = sfenToId.get(nextSfen) ?? leafSfens.get(nextSfen)!;
      reachableIds.add(id);
    }
  }

  const states: SBookState[] = [];

  for (const [sfen, entry] of book.entries) {
    const stateId = sfenToId.get(sfen)!;
    const pos = Position.newBySFEN(sfen);

    const sbkMoves: SBookMoveProto[] = [];

    for (const bookMove of entry.moves) {
      if (!pos) break;
      const move = pos.createMoveByUSI(bookMove[IDX_USI]);
      if (!move) continue;
      const nextPos = pos.clone();
      nextPos.doMove(move);
      const nextSfen = nextPos.sfen;
      const nextStateId = sfenToId.get(nextSfen) ?? leafSfens.get(nextSfen) ?? -1;
      sbkMoves.push({
        Move: toSbkMove(move),
        Evaluation: bookMove[IDX_EVALUATION] as SBookMoveEvaluation,
        Weight: bookMove[IDX_COUNT] ?? 0,
        NextStateId: nextStateId,
      });
    }

    states.push({
      Id: stateId,
      BoardKey: 0n,
      HandKey: 0,
      Games: entry.games ?? 1,
      WonBlack: entry.wonBlack ?? 0,
      WonWhite: entry.wonWhite ?? 0,
      // Only anchor states (not reachable via NextStateId) need Position.
      Position: reachableIds.has(stateId) ? undefined : sfen,
      Comment: entry.comment || undefined,
      Moves: sbkMoves,
      Evals: (entry.sbkEvals ?? []).map((e) => ({
        EvaluationValue: e.EvaluationValue,
        Depth: e.Depth,
        SelDepth: e.SelDepth,
        Nodes: e.Nodes,
        Variation: e.Variation ?? "",
        EngineName: e.EngineName ?? "",
      })),
    });
  }

  // Add empty leaf states (reachable next-positions that have no moves of their own).
  // These are required for BookConv compatibility: Load() uses array-index to resolve
  // NextStateId, so every referenced Id must occupy that index in BookStates.
  for (const [, id] of leafSfens) {
    states.push({
      Id: id,
      BoardKey: 0n,
      HandKey: 0,
      Games: 1,
      WonBlack: 0,
      WonWhite: 0,
      Position: undefined, // reachable — BFS from parent will propagate SFEN
      Comment: undefined,
      Moves: [],
      Evals: [],
    });
  }

  // BookConv resolves NextStateId by array index, so the array must be sorted by Id.
  states.sort((a, b) => a.Id - b.Id);

  const encoded = SBook.encode({
    Author: book.sbkAuthor ?? "",
    Description: book.sbkDescription ?? "",
    BookStates: states,
  }).finish();
  if (!output.write(encoded)) {
    await events.once(output, "drain");
  }
  output.end();
  await events.once(output, "finish");
}
