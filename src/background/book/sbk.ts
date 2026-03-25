import events from "node:events";
import { Writable } from "node:stream";
import { Move, Position } from "tsshogi";
import {
  SBook,
  SBookMove as SBookMoveProto,
  SBookMoveEvaluation,
  SBookState,
} from "./proto/sbk.js";
import { BookEntry, SbkBook, SbkEval } from "./types.js";
import { fromSbkMove, toSbkMove } from "./sbk_move.js";
import { BookMove } from "@/common/book.js";

function normalizeSfen(position: string): string | undefined {
  let s = position.trim();
  if (s.startsWith("position sfen ")) {
    s = s.slice("position sfen ".length);
  } else if (s.startsWith("sfen ")) {
    s = s.slice("sfen ".length);
  }
  // SFEN format: "board color hand moveCount" — normalize moveCount to 1
  const parts = s.split(" ");
  if (parts.length < 3) {
    return undefined;
  }
  return parts.slice(0, 3).join(" ") + " 1";
}

export function loadSbkBook(data: Buffer | Uint8Array): SbkBook {
  const book = SBook.decode(data);

  const idToSfen: (string | undefined)[] = new Array(book.BookStates.length);
  const rootIds: number[] = [];
  for (const state of book.BookStates) {
    if (state.Position) {
      const sfen = normalizeSfen(state.Position);
      if (sfen && idToSfen[state.Id] === undefined) {
        idToSfen[state.Id] = sfen;
        rootIds.push(state.Id);
      }
    }
  }

  const entries = new Map<string, BookEntry>();
  function addEntry(sfen: string, state: SBookState, moves: Move[]) {
    // 何も情報を持たないリーフノードを除外
    if (
      state.Moves.length === 0 &&
      state.Evals.length === 0 &&
      !state.Comment &&
      !state.Games &&
      !state.WonBlack &&
      !state.WonWhite
    ) {
      return;
    }

    const bookMoves: BookMove[] = state.Moves.map((m, index) => {
      return {
        usi: moves[index].usi,
        count: m.Weight || undefined,
        comment: "",
        evaluation: m.Evaluation,
      };
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
      moves: bookMoves,
      minPly: 0,
      games: state.Games,
      wonBlack: state.WonBlack,
      wonWhite: state.WonWhite,
      sbkEvals: sbkEvals.length > 0 ? sbkEvals : undefined,
    });
  }

  for (const rootId of rootIds) {
    const rootSfen = idToSfen[rootId]!;
    const pos = Position.newBySFEN(rootSfen);
    if (!pos) {
      continue;
    }
    const stack: { state: SBookState; moves: Move[]; index: number; lastMove?: Move }[] = [];
    const rootState = book.BookStates[rootId];
    const moves = rootState.Moves.map((m) => fromSbkMove(pos, m.Move));
    stack.push({ state: rootState, moves, index: 0 });
    addEntry(rootSfen, rootState, moves);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.moves.length) {
        stack.pop();
        if (frame.lastMove) {
          pos.undoMove(frame.lastMove);
        }
        continue;
      }
      const sbkMove = frame.state.Moves[frame.index];
      const move = frame.moves[frame.index];
      frame.index++;
      const nextStateId = sbkMove.NextStateId;
      if (idToSfen[nextStateId] !== undefined) {
        continue;
      }
      if (!pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      const nextState = book.BookStates[nextStateId];
      if (!nextState) {
        pos.undoMove(move);
        continue;
      }
      const nextSfen = pos.sfen;
      idToSfen[nextStateId] = nextSfen;
      const nextMoves = nextState.Moves.map((m) => fromSbkMove(pos, m.Move));
      stack.push({ state: nextState, moves: nextMoves, index: 0, lastMove: move });
      addEntry(nextSfen, nextState, nextMoves);
    }
  }

  return { format: "sbk", entries, sbkAuthor: book.Author, sbkDescription: book.Description };
}

export async function storeSbkBook(book: SbkBook, output: Writable): Promise<void> {
  // Phase 1: リーフノードの列挙とエントリー間のエッジの収集
  const leafSfens = new Set<string>();
  const sfenToEdges = new Map<string, [BookMove, number, string][]>();
  for (const [rootSfen, rootEntry] of book.entries) {
    if (sfenToEdges.has(rootSfen)) {
      continue; // 訪問済み
    }
    const pos = Position.newBySFEN(rootSfen);
    if (!pos) {
      continue;
    }
    const stack: { sfen: string; bookMoves: BookMove[]; index: number; lastMove?: Move }[] = [
      { sfen: rootSfen, bookMoves: rootEntry.moves, index: 0 },
    ];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.bookMoves.length) {
        stack.pop();
        if (frame.lastMove) {
          pos.undoMove(frame.lastMove);
        }
        continue;
      }
      const bookMove = frame.bookMoves[frame.index];
      frame.index++;
      const move = pos.createMoveByUSI(bookMove.usi);
      if (!move || !pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      const nextSfen = pos.sfen;
      let edges = sfenToEdges.get(frame.sfen);
      if (!edges) {
        edges = [];
        sfenToEdges.set(frame.sfen, edges);
      }
      edges.push([bookMove, toSbkMove(move), nextSfen]);
      if (sfenToEdges.has(nextSfen)) {
        pos.undoMove(move);
        continue; // 訪問済み
      }
      const nextEntry = book.entries.get(nextSfen);
      if (!nextEntry) {
        leafSfens.add(nextSfen);
        pos.undoMove(move);
        continue;
      }
      stack.push({ sfen: nextSfen, bookMoves: nextEntry.moves, index: 0, lastMove: move });
    }
  }

  // Phase 2: DFS による Root ノードの特定
  const sfenToRootSfen = new Map<string, string>();
  for (const sfen of book.entries.keys()) {
    if (sfenToRootSfen.has(sfen)) {
      continue; // 訪問済み
    }
    const stack: [string, string][] = [];
    for (const [, , nextSfen] of sfenToEdges.get(sfen) ?? []) {
      stack.push([sfen, nextSfen]);
    }
    while (stack.length > 0) {
      const [rootSfen, nextSfen] = stack.pop()!;
      if (sfenToRootSfen.has(nextSfen)) {
        continue; // 訪問済み
      }
      if (nextSfen === rootSfen) {
        continue; // 循環
      }
      sfenToRootSfen.set(nextSfen, rootSfen);
      for (const [, , succSfen] of sfenToEdges.get(nextSfen) ?? []) {
        stack.push([rootSfen, succSfen]);
      }
    }
  }
  const rootSfens = new Set<string>();
  for (const sfen of book.entries.keys()) {
    if (!sfenToRootSfen.has(sfen)) {
      rootSfens.add(sfen);
    }
  }

  // Phase 3: Root -> Internal -> Leaf の順で配置
  const orderedSfens = Array.from(book.entries.keys()).sort((a, b) => {
    const aIsRoot = rootSfens.has(a);
    const bIsRoot = rootSfens.has(b);
    return aIsRoot === bIsRoot ? (a < b ? -1 : a === b ? 0 : 1) : aIsRoot ? -1 : 1;
  });
  const orderedLeafSfens = Array.from(leafSfens).sort((a, b) => (a < b ? -1 : a === b ? 0 : 1));

  let newId = 0;
  const sfenToId = new Map<string, number>();
  for (const sfen of orderedSfens) {
    sfenToId.set(sfen, newId++);
  }
  for (const sfen of orderedLeafSfens) {
    sfenToId.set(sfen, newId++);
  }

  const states: SBookState[] = [];

  for (const sfen of orderedSfens) {
    const entry = book.entries.get(sfen)!;
    const edges = sfenToEdges.get(sfen) ?? [];
    const sbkMoves: SBookMoveProto[] = edges.map(([bookMove, move, nextSfen]) => {
      const nextStateId = sfenToId.get(nextSfen)!;
      return {
        Move: move,
        Evaluation: bookMove.evaluation || SBookMoveEvaluation.None,
        Weight: bookMove.count ?? 0,
        NextStateId: nextStateId,
      };
    });

    states.push({
      Id: sfenToId.get(sfen)!,
      // ShogiGUI のハッシュ関数が非公開のため BoardKey と HandKey は省略
      // 定義上は required だが BookConv が 0 を出力しているので問題ないと思われる
      BoardKey: 0n,
      HandKey: 0,
      Games: entry.games ?? 1,
      WonBlack: entry.wonBlack ?? 0,
      WonWhite: entry.wonWhite ?? 0,
      // 他のエントリーから参照されているノードの Position は省略
      Position: sfenToRootSfen.has(sfen) ? undefined : sfen,
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
  for (const sfen of orderedLeafSfens) {
    states.push({
      Id: sfenToId.get(sfen)!,
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
