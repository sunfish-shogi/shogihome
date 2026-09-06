import { Color, formatMove, ImmutableRecord, Move } from "tsshogi";
import { PositionImageHeaderType } from "@/common/settings/app.js";

type HeaderFormat = {
  text?: "bookmark" | "custom"; // 見出しに含めるテキストの取得元
  ply?: boolean; // 手数を含めるかどうか
  lastMove?: boolean; // 最終手を含めるかどうか
  brackets?: boolean; // 【 】で囲むかどうか
};

const headerFormats: { [type in PositionImageHeaderType]: HeaderFormat } = {
  [PositionImageHeaderType.NONE]: {},
  [PositionImageHeaderType.BOOKMARK]: { text: "bookmark" },
  [PositionImageHeaderType.CUSTOM]: { text: "custom" },
  [PositionImageHeaderType.LAST_MOVE]: { lastMove: true },
  [PositionImageHeaderType.PLY_AND_LAST_MOVE]: { ply: true, lastMove: true },
  [PositionImageHeaderType.BOOKMARK_AND_LAST_MOVE]: { text: "bookmark", lastMove: true },
  [PositionImageHeaderType.CUSTOM_AND_LAST_MOVE]: { text: "custom", lastMove: true },
  [PositionImageHeaderType.BRACKETED_BOOKMARK]: { text: "bookmark", brackets: true },
  [PositionImageHeaderType.BRACKETED_CUSTOM]: { text: "custom", brackets: true },
  [PositionImageHeaderType.BRACKETED_LAST_MOVE]: { lastMove: true, brackets: true },
  [PositionImageHeaderType.BRACKETED_PLY_AND_LAST_MOVE]: {
    ply: true,
    lastMove: true,
    brackets: true,
  },
  [PositionImageHeaderType.BRACKETED_BOOKMARK_AND_LAST_MOVE]: {
    text: "bookmark",
    lastMove: true,
    brackets: true,
  },
  [PositionImageHeaderType.BRACKETED_CUSTOM_AND_LAST_MOVE]: {
    text: "custom",
    lastMove: true,
    brackets: true,
  },
};

/** しおりを使う形式かどうかを返す。 */
export function usesBookmark(type: PositionImageHeaderType): boolean {
  return headerFormats[type].text === "bookmark";
}

/** 自由入力のテキストを使う形式かどうかを返す。 */
export function usesCustomText(type: PositionImageHeaderType): boolean {
  return headerFormats[type].text === "custom";
}

/**
 * 局面図の見出しを組み立てる。
 * @param record 対象の棋譜（現在の局面が見出しの対象になる。）
 * @param type 見出しの形式
 * @param texts 見出しに使うテキスト（形式に応じてどちらか一方だけを使う。）
 */
export function buildPositionImageHeader(
  record: ImmutableRecord,
  type: PositionImageHeaderType,
  texts: { bookmark: string; custom: string },
): string {
  const format = headerFormats[type];
  const text =
    format.text === "bookmark" ? texts.bookmark : format.text === "custom" ? texts.custom : "";
  let body = text;
  if (format.lastMove) {
    const lastMove = record.current.move instanceof Move ? record.current.move : null;
    // 最終手が無い場合は手番を表示する。
    const lastMoveText = lastMove
      ? `${formatMove(record.position, lastMove)}まで`
      : record.current.nextColor === Color.BLACK
        ? "先手番"
        : "後手番";
    // 手数は最終手が有る場合のみ表示する。
    const plyText = format.ply && lastMove ? `${record.current.ply}手目 ` : "";
    body = text ? `${text} は ${plyText}${lastMoveText}` : `${plyText}${lastMoveText}`;
  }
  return body && format.brackets ? `【${body}】` : body;
}
