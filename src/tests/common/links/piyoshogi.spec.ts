import { piyoShogiURL } from "@/common/links/piyoshogi.js";
import { Record } from "tsshogi";

describe("piyoshogi", () => {
  it("piyoShogiURL", () => {
    const record = Record.newByUSI(
      "position startpos moves 2g2f 3c3d 7g7f 5c5d 3i4h 8b5b 5i6h 5d5e 6h7h 2b3c 7i6h 3a4b",
    );
    expect(piyoShogiURL(record as Record)).toBe(
      "https://www.studiok-i.net/kifu/?sfen=position%20startpos%20moves%202g2f%203c3d%207g7f%205c5d%203i4h%208b5b%205i6h%205d5e%206h7h%202b3c%207i6h%203a4b",
    );
  });
});
