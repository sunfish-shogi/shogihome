import { Color, formatMove, ImmutableRecord, Move } from "tsshogi";
import { PositionImageHeaderType } from "@/common/settings/app.js";

const bracketedTypes: PositionImageHeaderType[] = [
  PositionImageHeaderType.BRACKETED_PLY_AND_LAST_MOVE,
  PositionImageHeaderType.BRACKETED_CUSTOM,
  PositionImageHeaderType.BRACKETED_LAST_MOVE,
  PositionImageHeaderType.BRACKETED_CUSTOM_AND_LAST_MOVE,
];

/**
 * 局面図の見出しを組み立てる。
 * @param record 対象の棋譜（現在の局面が見出しの対象になる。）
 * @param type 見出しの形式
 * @param customText 見出しに使うテキスト（しおりが設定されている場合はしおりを優先する。）
 */
export function buildPositionImageHeader(
  record: ImmutableRecord,
  type: PositionImageHeaderType,
  customText: string,
): string {
  const custom = record.current.bookmark || customText;
  const lastMove = record.current.move instanceof Move ? record.current.move : null;
  // 最終手が無い場合は手番を表示する。
  const lastMoveText = lastMove
    ? `${formatMove(record.position, lastMove)}まで`
    : record.current.nextColor === Color.BLACK
      ? "先手番"
      : "後手番";
  const plyAndLastMoveText = lastMove ? `${record.current.ply}手目 ${lastMoveText}` : lastMoveText;
  let text: string;
  switch (type) {
    default:
      text = plyAndLastMoveText;
      break;
    case PositionImageHeaderType.CUSTOM:
    case PositionImageHeaderType.BRACKETED_CUSTOM:
      text = custom || plyAndLastMoveText;
      break;
    case PositionImageHeaderType.LAST_MOVE:
    case PositionImageHeaderType.BRACKETED_LAST_MOVE:
      text = lastMoveText;
      break;
    case PositionImageHeaderType.CUSTOM_AND_LAST_MOVE:
    case PositionImageHeaderType.BRACKETED_CUSTOM_AND_LAST_MOVE:
      text = custom ? `${custom} は ${lastMoveText}` : lastMoveText;
      break;
  }
  return bracketedTypes.includes(type) ? `【${text}】` : text;
}
