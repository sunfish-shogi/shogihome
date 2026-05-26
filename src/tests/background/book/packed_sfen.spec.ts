import {
  positionToPackedSfen,
  sfenToPackedSfen,
  packedSfenToSfen,
} from "@/background/book/packed_sfen.js";
import { Position } from "tsshogi";

function wordsToHex(words: Uint32Array): string {
  return Buffer.from(new Uint8Array(words.buffer)).toString("hex");
}

describe("background/book/packed_sfen", () => {
  it("packs", () => {
    const testCases = [
      {
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
        expected: "9884713ddff75c47bfe0536666666602000020222222227c801fc3723ccfb10c",
      },
      {
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPP1/1B5R1/LNSGKGSNL b P 1",
        expected: "9884713ddff75c47bfe0536666666602000020222222820ff063588ee7399601",
      },
    ];
    for (const { sfen, expected } of testCases) {
      const words = sfenToPackedSfen(sfen);
      expect(wordsToHex(words)).toBe(expected);
    }
  });

  it("reversibility", () => {
    const testCases = [
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1", // 平手初期配置
      "lnsgkgsnl/7b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1", // 飛車落ち
      "1nsgkgsn1/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1", // 四枚落ち
      "4k4/9/9/9/9/9/9/9/4K4 b 2R2B4G4S4N4L18P 1", // 全て先手の持ち駒
      "4k4/9/9/9/9/9/9/9/4K4 b 2r2b4g4s4n4l18p 1", // 全て後手の持ち駒
      "4k4/9/9/9/9/9/9/9/4K4 b - 1", // 玉のみ
      "5g3/1+P1g1ks2/2p1pp1+P+L/3p2p2/1PP3s2/R8/B1NS1PP2/L4GS1K/2L4N1 w RB2NL7Pg 1", // 平手
      "Rn4bnl/lg2k2g1/5sp1p/p3pp1p1/2ps3lP/5P3/2+n1P1P2/r3+b1S2/4KG1NL b gs7p 1", // 平手
      "l1s4+R+B/1p1g1s3/p2kp+P1p1/2p5p/3p2n2/1R7/P2PPP+pPP/2G1K4/L6GL b BG2S3NL3P 1", // 平手
      "lnb2g1nl/1r4sk1/3s1g1p1/p1ppp1p1p/1p3p3/P1PPP1P1P/1PSS1P1P1/1KGB2G2/LN3R1NL b - 1", // 平手
      "ln5n1/5gks1/p3Npp+P1/2pp1b2l/8p/Prg3PR1/3PPPN2/2S1KG3/L+p1G2S1L w SP4p 1", // 角落ち
    ];
    for (const sfen of testCases) {
      const packed = sfenToPackedSfen(sfen);
      expect(packed.length).toBe(8);
      const unpacked = packedSfenToSfen(packed);
      expect(unpacked).toBe(sfen);
    }
  });

  it("too many pieces", () => {
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B2G2R1/LNSGKGSNL b - 1";
    expect(() => sfenToPackedSfen(sfen)).toThrow("Invalid SFEN: too many G pieces");
  });

  it("packs from immutable position as same as sfen", () => {
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPP1/1B5R1/LNSGKGSNL b P 1";
    const pos = Position.newBySFEN(sfen);
    if (!pos) {
      throw new Error("failed to create position for test");
    }
    const fromSfen = sfenToPackedSfen(sfen);
    const fromPosition = positionToPackedSfen(pos);
    expect(wordsToHex(fromPosition)).toBe(wordsToHex(fromSfen));
  });
});
