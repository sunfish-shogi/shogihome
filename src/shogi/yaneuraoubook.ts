import * as nodeFsPromises from "node:fs/promises";

import {
  MetaMove, MoveMetadata,
  MetaPosition, PositionMetadata,
  MetaBook, BookMetadata,
} from "./book";

// コメントを表す文字列があった方が扱いやすい
// やねうらおさんは `//` を提案しているが、`#YANEURAOU-DB2016 1.00` は `#` から始まるので
// `#` にした方が統一的な感じがする。
const commentString = "#";

export async function parseFile(fileName: string): Promise<MetaBook> {
  const file = await nodeFsPromises.open(fileName);
  let n = 0;
  let position: MetaPosition | null = null;
  const book = MetaBook.MakeBook();
  for await (const line of file.readLines()) {
    if (n === 0 && line !== "#YANEURAOU-DB2016 1.00") {
      throw "Invalid YaneuraOu Book Format.";
    }
    if (line === "") {
      // empty line 
    } else if (line.substring(0, 1) === commentString) {
      // comment
    } else if (line.substring(0, 4) === "sfen") {
      // position
      const words = line.split(" ");
      const sfen = words.slice(1, 5).join(" ");
      // console.log(`sfen: ${sfen}`);
      position = new MetaPosition(sfen, [], new PositionMetadata());
      book.positions.push(position);
    } else if (position !== null) {
      const words = line.split(" ");
      const move = words[0];
      const ponder = words[1];
      // ３語目以降は optional
      // console.log(`move: ${move}`);
      // console.log(`ponder: ${ponder}`);
      position.moves.push(new MetaMove(move, new MoveMetadata()));
    }
    n += 1;
  }
  return book;
}