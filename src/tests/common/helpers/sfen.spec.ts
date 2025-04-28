import { flippedSFEN, flippedUSIMove } from "@/common/helpers/sfen.js";

describe("helpers/sfen", () => {
  it("flippedSFEN", () => {
    const testCases = [
      {
        sfen1: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        sfen2: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1",
      },
      {
        sfen1: "l8/2+P3s1R/b3g1kp1/p2p2psp/2nPSp3/PPP2LP1P/K3P4/2GSG4/LN4+b1L w G2Pr2n2p 114",
        sfen2: "l1+B4nl/4gsg2/4p3k/p1pl2ppp/3PspN2/PSP2P2P/1PK1G3B/r1S3+p2/8L b R2N2Pg2p 114",
      },
      {
        sfen1: "6+Pn1/6gk1/6gp1/9/9/6b1P/9/9/9 b 2R2Gb4s3n4l15p 1",
        sfen2: "9/9/9/p1B6/9/9/1PG6/1KG6/1N+p6 w B4S3N4L15P2r2g 1",
      },
    ];
    for (const { sfen1, sfen2 } of testCases) {
      expect(flippedSFEN(sfen1)).toBe(sfen2);
      expect(flippedSFEN(sfen2)).toBe(sfen1);
    }
  });

  it("flippedUSIMove", () => {
    const testCases = [
      { usi1: "7g7f", usi2: "3c3d" },
      { usi1: "8h2b+", usi2: "2b8h+" },
      { usi1: "L*3i", usi2: "L*7a" },
    ];
    for (const { usi1, usi2 } of testCases) {
      expect(flippedUSIMove(usi1)).toBe(usi2);
      expect(flippedUSIMove(usi2)).toBe(usi1);
    }
  });
});
