import { hash } from "@/background/book/apery_zobrist.js";

describe("apery_zobrist", () => {
  it("hash", () => {
    const testCases = [
      {
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        wants: "157eade1e78ebeee",
      },
      {
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
        wants: "d5207256821f7b3e",
      },
      {
        sfen: "lnsgk1snl/1r4g2/pppppp1pp/6p2/7P1/2P6/PP1PPPP1P/1+b5R1/LNSGKGSNL b b 7",
        wants: "dabcbe6950ce089a",
      },
      {
        sfen: "lnsgk1snl/1r4g2/p1pppp1pp/6p2/1p5P1/2P6/PPSPPPP1P/7R1/LN1GKGSNL w Bb 12",
        wants: "ac59e8ffb6da83e7",
      },
      {
        sfen: "ln1gk1snl/6gb1/2sppppp1/p7p/2R6/Pr4P2/2PPPPN1P/1BGK2S2/LNS2G2L w 3Pp 26",
        wants: "ffa73ad01aa22070",
      },
      {
        sfen: "ln1gk1snl/1r4gb1/2sppppp1/p7p/2R6/P5P2/2PPPPN1P/1BGK2S2/LNS2G2L b 3Pp 27",
        wants: "b7fac43349829798",
      },
    ];
    for (const { sfen, wants } of testCases) {
      const wantsBigInt = Buffer.from(wants, "hex").readBigUInt64LE();
      expect(hash(sfen)).toBe(wantsBigInt);
    }
  });
});
