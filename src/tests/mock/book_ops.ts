// 定跡のテストで共通して使う操作。
// 公開 API だけを使うため、JavaScript 版・WebAssembly 版のどちらの実装にも使える。

import fs from "node:fs";
import path from "node:path";
import { Position } from "tsshogi";
import {
  importBookMoves,
  removeBookMove,
  searchBookEntry,
  updateBookMove,
  updateBookMoveOrder,
  updateBookPositionComment,
} from "@/background/book/index.js";
import { BookPositionEntry } from "@/common/book.js";
import { defaultBookImportSettings, SourceType } from "@/common/settings/book.js";

export const initialSfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
export const after76 = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1";
export const after7634 = "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 1";

const records = [
  "position startpos moves 7g7f 3c3d 2g2f 8c8d 2f2e 8d8e resign",
  "position startpos moves 7g7f 3c3d 6g6f 8c8d 2h6h resign",
  "position startpos moves 2g2f 8c8d 7g7f 3c3d 2f2e resign",
  "position startpos moves 7g7f 8c8d 2g2f 8d8e 8h7g 3c3d 7i8h resign",
];

/** 棋譜の取り込みと、指し手・コメントの追加/変更/削除/並べ替えを行う */
export async function editBook(session: number, tmpdir: string): Promise<void> {
  const sfenPath = path.join(tmpdir, "book-ops-records.sfen");
  fs.writeFileSync(sfenPath, records.join("\n") + "\n");
  await importBookMoves(session, {
    ...defaultBookImportSettings(),
    sourceType: SourceType.FILE,
    sourceRecordFile: sfenPath,
    maxPly: 6,
  });
  await updateBookMove(session, initialSfen, { usi: "5g5f", count: 1, comment: "中飛車" });
  await updateBookMove(session, after76, { usi: "8c8d", count: 10, score: 30, depth: 12 });
  await updateBookPositionComment(session, after76, "角道を開ける");
  await updateBookPositionComment(session, after7634, "");
  await updateBookMoveOrder(session, initialSfen, "5g5f", 0);
  await removeBookMove(session, after7634, "2g2f");
}

/**
 * 初期局面から定跡手をたどって到達できる局面のエントリーを列挙する。
 * 保存によって変わりうる SBK の State ID (sbkId) は除く。
 */
export async function snapshotBook(
  session: number,
  maxPositions = 300,
): Promise<{ sfen: string; entry: BookPositionEntry }[]> {
  const result: { sfen: string; entry: BookPositionEntry }[] = [];
  const visited = new Set<string>([initialSfen]);
  const queue = [initialSfen];
  while (queue.length > 0 && result.length < maxPositions) {
    const sfen = queue.shift() as string;
    const entry = await searchBookEntry(session, sfen);
    if (!entry) {
      continue;
    }
    // JavaScript 版は保持しているオブジェクトをそのまま返すため、後の変更の影響を受けないようコピーする
    const copy = structuredClone(entry);
    copy.moves = copy.moves.map((m) => ({ ...m, sbkId: undefined }));
    result.push({ sfen, entry: copy });
    const pos = Position.newBySFEN(sfen);
    for (const m of entry.moves) {
      const move = pos?.createMoveByUSI(m.usi);
      if (!pos || !move || !pos.doMove(move, { ignoreValidation: true })) {
        continue;
      }
      const next = pos.sfen;
      pos.undoMove(move);
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return result;
}

/**
 * SBK 形式で保存できる項目だけを取り出す。
 * (指し手のコメント・評価値・探索深さ・手数は SBK 形式では保存されない。0 や空文字は省略される)
 */
export function sbkFields(snapshot: { sfen: string; entry: BookPositionEntry }[]) {
  return snapshot.map(({ sfen, entry }) => ({
    sfen,
    moves: entry.moves.map((m) => ({
      usi: m.usi,
      count: m.count || undefined,
      sbkEval: m.sbkEval || undefined,
    })),
    comment: entry.comment || undefined,
    games: entry.games || undefined,
    wonBlack: entry.wonBlack || undefined,
    wonWhite: entry.wonWhite || undefined,
    sbkEvals: entry.sbkEvals?.length ? entry.sbkEvals : undefined,
  }));
}

/**
 * やねうら王形式で保存できる項目だけを取り出す。
 * (指し手の無い局面は保存されない。統計情報や SBK 固有の項目は保存されない。空文字は省略される)
 */
export function yaneFields(snapshot: { sfen: string; entry: BookPositionEntry }[]) {
  return snapshot
    .filter(({ entry }) => entry.moves.length > 0)
    .map(({ sfen, entry }) => ({
      sfen,
      moves: entry.moves.map((m) => ({
        usi: m.usi,
        usi2: m.usi2 || undefined,
        score: m.score,
        depth: m.depth,
        count: m.count,
        comment: m.comment || undefined,
      })),
      comment: entry.comment || undefined,
    }));
}
