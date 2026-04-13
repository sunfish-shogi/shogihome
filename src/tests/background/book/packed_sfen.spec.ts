import {
  packPositionToPackedSfen,
  packSfenToPackedSfen,
  unpackPackedSfenToSfen,
} from "@/background/book/packed_sfen.js";
import { Position } from "tsshogi";

function wordsToHex(words: Uint32Array): string {
  return Buffer.from(new Uint8Array(words.buffer)).toString("hex");
}

function hexToWords(hex: string): Uint32Array {
  const bytes = new Uint8Array(Buffer.from(hex, "hex"));
  return new Uint32Array(bytes.buffer);
}

describe("background/book/packed_sfen", () => {
  it("packs startpos sfen", () => {
    const words = packSfenToPackedSfen(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
    expect(wordsToHex(words)).toBe(
      "9884713ddff75c47bfe0536666666602000020222222227c801fc3723ccfb10c",
    );
  });

  it("packs a sfen with hand piece", () => {
    const words = packSfenToPackedSfen(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPP1/1B5R1/LNSGKGSNL b P 1",
    );
    expect(wordsToHex(words)).toBe(
      "9884713ddff75c47bfe0536666666602000020222222820ff063588ee7399601",
    );
  });

  it("always produces 8 words (piece-box case)", () => {
    const words = packSfenToPackedSfen("4k4/9/9/9/9/9/9/9/4K4 b - 1");
    expect(words.length).toBe(8);
  });

  it("unpacks startpos vector", () => {
    const packed = hexToWords("9884713ddff75c47bfe0536666666602000020222222227c801fc3723ccfb10c");
    expect(unpackPackedSfenToSfen(packed)).toBe(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
  });

  it("round-trips piece-box case", () => {
    const sfen = "4k4/9/9/9/9/9/9/9/4K4 b - 1";
    const packed = packSfenToPackedSfen(sfen);
    expect(unpackPackedSfenToSfen(packed)).toBe(sfen);
  });

  it("packs from immutable position as same as sfen", () => {
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPP1/1B5R1/LNSGKGSNL b P 1";
    const pos = Position.newBySFEN(sfen);
    if (!pos) {
      throw new Error("failed to create position for test");
    }
    const fromSfen = packSfenToPackedSfen(sfen);
    const fromPosition = packPositionToPackedSfen(pos);
    expect(wordsToHex(fromPosition)).toBe(wordsToHex(fromSfen));
  });
});
