import { kyokumenpediaURL } from "@/common/links/kyokumenpedia.js";
import { Position } from "tsshogi";

describe("kyokumenpedia", () => {
  it("kyokumenpediaURL", () => {
    const position = Position.newBySFEN(
      "lnsgkg1nl/5s1r1/pppp1p2p/4p1pp1/9/2P2P1P1/PP1PP1P1P/2SK1S1R1/LN1G1G1NL w Bb 14",
    );
    expect(kyokumenpediaURL(position as Position)).toBe(
      "http://kyokumen.jp/positions/lnsgkg1nl/5s1r1/pppp1p2p/4p1pp1/9/2P2P1P1/PP1PP1P1P/2SK1S1R1/LN1G1G1NL%20w%20Bb",
    );
  });
});
