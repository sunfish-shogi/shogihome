import events from "node:events";
import { Writable } from "node:stream";
import { Move, Position } from "tsshogi";
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
  if (parts.length < 3) {
    return undefined;
  }
  return parts.slice(0, 3).join(" ") + " 1";
}

export function loadSbkBook(data: Buffer | Uint8Array): SbkBook {
  const book = SBook.decode(data);

  const idToState = new Map<number, SBookState>();
  const idToSfen = new Map<number, string>();
  const rootIds: number[] = [];
  for (const state of book.BookStates) {
    idToState.set(state.Id, state);
    if (state.Position) {
      const sfen = normalizeSfen(state.Position);
      if (sfen && !idToSfen.has(state.Id)) {
        idToSfen.set(state.Id, sfen);
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
      return [
        moves[index].usi, // usi
        undefined, // usi2
        undefined, // score
        undefined, // depth
        m.Weight || undefined, // count
        "", // comment
        m.Evaluation, // evaluation
      ];
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
    const rootSfen = idToSfen.get(rootId)!;
    const pos = Position.newBySFEN(rootSfen);
    if (!pos) {
      continue;
    }
    const stack: { state: SBookState; moves: Move[]; index: number; lastMove?: Move }[] = [];
    const rootState = idToState.get(rootId)!;
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
      if (idToSfen.has(nextStateId)) {
        continue;
      }
      if (!pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      const nextState = idToState.get(nextStateId);
      if (!nextState) {
        pos.undoMove(move);
        continue;
      }
      const nextSfen = pos.sfen;
      idToSfen.set(nextStateId, nextSfen);
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
  const bookSuccessors = new Map<string, string[]>();
  for (const [sfen, entry] of book.entries) {
    const pos = Position.newBySFEN(sfen);
    if (!pos) {
      continue;
    }
    for (const bookMove of entry.moves) {
      const move = pos.createMoveByUSI(bookMove[IDX_USI]);
      if (!move || !pos.doMove(move)) {
        continue;
      }
      const nextSfen = pos.sfen;
      if (book.entries.has(nextSfen)) {
        // Phase 3 の DFS のためにエッジの Map を構築
        let succs = bookSuccessors.get(sfen);
        if (!succs) {
          succs = [];
          bookSuccessors.set(sfen, succs);
        }
        succs.push(nextSfen);
      } else if (!leafSfens.has(nextSfen)) {
        leafSfens.add(nextSfen);
      }
      pos.undoMove(move);
    }
  }

  // Phase 2: DFS による Root ノードの特定
  const sfenToRootSfen = new Map<string, string>();
  for (const sfen of book.entries.keys()) {
    if (sfenToRootSfen.has(sfen)) {
      continue; // 訪問済み
    }
    const dfsStack: [string, string][] = [];
    for (const nextSfen of bookSuccessors.get(sfen) ?? []) {
      dfsStack.push([sfen, nextSfen]);
    }
    while (dfsStack.length > 0) {
      const [rootSfen, nextSfen] = dfsStack.pop()!;
      if (sfenToRootSfen.has(nextSfen)) {
        continue; // 訪問済み
      }
      if (nextSfen === rootSfen) {
        continue; // 循環
      }
      sfenToRootSfen.set(nextSfen, rootSfen);
      for (const succSfen of bookSuccessors.get(nextSfen) ?? []) {
        dfsStack.push([rootSfen, succSfen]);
      }
    }
  }
  const rootSfens = new Set<string>();
  for (const sfen of book.entries.keys()) {
    if (!sfenToRootSfen.has(sfen)) {
      rootSfens.add(sfen);
    }
  }

  // Phase 3: Root からの距離を計算
  const sfenToDepth = new Map<string, number>();
  for (const sfen of rootSfens) {
    const dfsStack: [string, number][] = [];
    dfsStack.push([sfen, 0]);
    while (dfsStack.length > 0) {
      const [curSfen, depth] = dfsStack.pop()!;
      const prevDepth = sfenToDepth.get(curSfen);
      if (prevDepth !== undefined && prevDepth <= depth) {
        continue; // 訪問済みかつより短い距離で到達済み
      }
      sfenToDepth.set(curSfen, depth);
      for (const nextSfen of bookSuccessors.get(curSfen) ?? []) {
        dfsStack.push([nextSfen, depth + 1]);
      }
    }
  }

  // Phase 4: Root からの距離が近い順に SFEN を並べる
  const orderedSfens = Array.from(book.entries.keys()).sort((a, b) => {
    const depthA = sfenToDepth.get(a) ?? Infinity;
    const depthB = sfenToDepth.get(b) ?? Infinity;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a < b ? -1 : a === b ? 0 : 1;
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
    const pos = Position.newBySFEN(sfen);
    const sbkMoves: SBookMoveProto[] = [];
    if (pos) {
      for (const bookMove of entry.moves) {
        const move = pos.createMoveByUSI(bookMove[IDX_USI]);
        if (!move || !pos.doMove(move)) {
          continue;
        }
        const nextSfen = pos.sfen;
        const nextStateId = sfenToId.get(nextSfen);
        if (nextStateId === undefined) {
          // ロジック上は必ず遷移先の ID が存在するのでここに到達することは無い
          pos.undoMove(move);
          continue;
        }
        sbkMoves.push({
          Move: toSbkMove(move),
          Evaluation: bookMove[IDX_EVALUATION] as SBookMoveEvaluation,
          Weight: bookMove[IDX_COUNT] ?? 0,
          NextStateId: nextStateId,
        });
        pos.undoMove(move);
      }
    }

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
