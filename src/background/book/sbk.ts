import events from "node:events";
import { Writable } from "node:stream";
import { Move, Position } from "tsshogi";
import { BinaryWriter } from "@bufbuild/protobuf/wire";
import {
  SBookMove as SBookMoveProto,
  SBookMoveEvaluation,
  SBookState,
  SBook,
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
      const bookMove: BookMove = {
        usi: moves[index].usi,
      };
      if (m.Weight) {
        bookMove.count = m.Weight;
      }
      if (m.Evaluation !== SBookMoveEvaluation.None) {
        bookMove.evaluation = m.Evaluation;
      }
      return bookMove;
    });

    const sbkEvals: SbkEval[] = state.Evals.map((e) => ({
      EvaluationValue: e.EvaluationValue,
      Depth: e.Depth,
      SelDepth: e.SelDepth,
      Nodes: e.Nodes,
      Variation: e.Variation || undefined,
      EngineName: e.EngineName || undefined,
    }));

    const bookEntry: BookEntry = {
      type: "normal",
      moves: bookMoves,
    };
    if (state.Comment) {
      bookEntry.comment = state.Comment;
    }
    if (state.Games) {
      bookEntry.games = state.Games;
    }
    if (state.WonBlack) {
      bookEntry.wonBlack = state.WonBlack;
    }
    if (state.WonWhite) {
      bookEntry.wonWhite = state.WonWhite;
    }
    if (sbkEvals.length > 0) {
      bookEntry.sbkEvals = sbkEvals;
    }
    entries.set(sfen, bookEntry);
  }

  const visitedStateIds = new Set<number>();
  for (const rootState of book.BookStates) {
    if (!rootState.Position || visitedStateIds.has(rootState.Id)) {
      continue;
    }
    const rootSfen = normalizeSfen(rootState.Position);
    if (!rootSfen) {
      continue;
    }
    const pos = Position.newBySFEN(rootSfen);
    if (!pos) {
      continue;
    }
    const stack: { state: SBookState; moves: Move[]; index: number; lastMove?: Move }[] = [];
    const moves = rootState.Moves.map((m) => fromSbkMove(pos, m.Move));
    stack.push({ state: rootState, moves, index: 0 });
    addEntry(rootSfen, rootState, moves);
    visitedStateIds.add(rootState.Id);
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
      if (visitedStateIds.has(nextStateId)) {
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
      const nextMoves = nextState.Moves.map((m) => fromSbkMove(pos, m.Move));
      stack.push({ state: nextState, moves: nextMoves, index: 0, lastMove: move });
      addEntry(nextSfen, nextState, nextMoves);
      visitedStateIds.add(nextStateId);
    }
  }

  return { format: "sbk", entries, sbkAuthor: book.Author, sbkDescription: book.Description };
}

export async function storeSbkBook(book: SbkBook, output: Writable): Promise<void> {
  // SFEN の記述を最小限にしてデータを削減するためにルートではないノードを列挙する。
  const nonRootSfens = new Set<string>();

  // 局面と指し手のデコードの負荷が高いため、DFS の過程で局面と指し手を列挙しておく。
  const sfenToEdges = new Map<
    string,
    { bookMove: BookMove; sbkMove: number; nextSfen: string }[]
  >();

  for (const [rootSfen, rootEntry] of book.entries) {
    // DFS で訪問したことがある局面はそれ以上調べる必要がない。
    // ここで訪問済みでないノードはルートノードになる可能性があるが、
    // 他のノードからの探索がおわるまではルートノードかどうかが確定しない。
    if (sfenToEdges.has(rootSfen)) {
      continue; // 訪問済み
    }
    // newBySFEN は負荷が高いため、DFS の開始点だけで呼び出して残りは差分計算をする。
    const pos = Position.newBySFEN(rootSfen);
    if (!pos) {
      continue;
    }
    // ルートノードを特定するためにエッジを経由して到達可能な子ノードを DFS で列挙する。
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
      let edges = sfenToEdges.get(frame.sfen);
      if (!edges) {
        edges = [];
        sfenToEdges.set(frame.sfen, edges);
      }
      const nextSfen = pos.sfen;
      edges.push({ bookMove, sbkMove: toSbkMove(move), nextSfen });
      const nextEntry = book.entries.get(nextSfen);
      if (!nextEntry) {
        pos.undoMove(move);
        continue; // エントリーに含まれないリーフノード
      }
      if (nextSfen !== rootSfen) {
        // SFEN を省略してよいノード
        nonRootSfens.add(nextSfen);
      }
      if (sfenToEdges.has(nextSfen)) {
        pos.undoMove(move);
        continue; // 訪問済み
      }
      stack.push({ sfen: nextSfen, bookMoves: nextEntry.moves, index: 0, lastMove: move });
    }
  }

  // ノードに ID を割り当てる。
  // ID は書き出す時の順序と一致しなければならない。
  // ルートノードを先頭に書かないと ShogiGUI で正しく読み込まれない。
  let newId = 0;
  const sfenToId = new Map<string, number>();
  for (const [sfen] of book.entries) {
    if (!nonRootSfens.has(sfen)) {
      sfenToId.set(sfen, newId++);
    }
  }
  for (const [sfen] of book.entries) {
    if (nonRootSfens.has(sfen)) {
      sfenToId.set(sfen, newId++);
    }
  }

  // データ全体を一気に encode するとメモリを大量に消費してしまうため、チャンク単位で書き出す。
  const CHUNK_SIZE = 64 * 1024;
  const pendingChunks: Uint8Array[] = [];
  let pendingSize = 0;

  async function flush() {
    if (pendingChunks.length === 0) {
      return;
    }
    const combined = Buffer.concat(pendingChunks);
    pendingChunks.length = 0;
    pendingSize = 0;
    if (!output.write(combined)) {
      await events.once(output, "drain");
    }
  }

  async function writeBytes(bytes: Uint8Array) {
    pendingChunks.push(bytes);
    pendingSize += bytes.length;
    if (pendingSize >= CHUNK_SIZE) {
      await flush();
    }
  }

  const headerWriter = new BinaryWriter();
  if (book.sbkAuthor) {
    headerWriter.uint32(10).string(book.sbkAuthor);
  }
  if (book.sbkDescription) {
    headerWriter.uint32(18).string(book.sbkDescription);
  }
  await writeBytes(headerWriter.finish());

  async function writeState(sfen: string, entry: BookEntry): Promise<void> {
    const edges = sfenToEdges.get(sfen) ?? [];
    const sbkMoves: SBookMoveProto[] = edges.map(({ bookMove, sbkMove, nextSfen }) => ({
      Move: sbkMove,
      Evaluation: bookMove.evaluation || SBookMoveEvaluation.None,
      Weight: bookMove.count ?? 0,
      NextStateId: sfenToId.get(nextSfen) ?? -1, // 存在しない局面に対して BookConv は -1 を出力している
    }));

    const state: SBookState = {
      Id: sfenToId.get(sfen)!,
      // ShogiGUI のハッシュ関数が非公開のため BoardKey と HandKey は省略
      // 定義上は required だが BookConv が 0 を出力しているので問題ないと思われる
      BoardKey: 0n,
      HandKey: 0,
      Games: entry.games ?? 0,
      WonBlack: entry.wonBlack ?? 0,
      WonWhite: entry.wonWhite ?? 0,
      // 他のエントリーから参照されているノードの Position は省略
      Position: nonRootSfens.has(sfen) ? undefined : sfen,
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
    };

    const stateWriter = new BinaryWriter();
    SBookState.encode(state, stateWriter.uint32(26).fork()).join();
    await writeBytes(stateWriter.finish());
  }

  for (const [sfen, entry] of book.entries) {
    if (!nonRootSfens.has(sfen)) {
      await writeState(sfen, entry);
    }
  }
  for (const [sfen, entry] of book.entries) {
    if (nonRootSfens.has(sfen)) {
      await writeState(sfen, entry);
    }
  }

  await flush();
  output.end();
  await events.once(output, "finish");
}
