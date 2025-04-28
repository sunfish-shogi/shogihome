import { urlSafeBase64Encode } from "@/common/helpers/base64.js";
import { ImmutableRecord } from "tsshogi";

const sharedBoardURL = "https://www.shogi-extend.com/share-board";

export function shogiExtendSharedBoardURL(record: ImmutableRecord): string {
  const base64 = urlSafeBase64Encode(
    record.getUSI({
      startpos: true,
      resign: true,
      allMoves: true,
    }),
  );
  return `${sharedBoardURL}?turn=${record.current.ply}&xbody=${base64}`;
}
