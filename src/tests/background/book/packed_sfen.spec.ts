import { packSfenToPackedSfen, unpackPackedSfenToSfen } from "@/background/book/packed_sfen.js";

describe("background/book/packed_sfen", () => {
  it("packs startpos sfen", () => {
    const bytes = packSfenToPackedSfen(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
    expect(Buffer.from(bytes).toString("hex")).toBe(
      "9884713ddff75c47bfe0536666666602000020222222227c801fc3723ccfb10c",
    );
  });

  it("packs a sfen with hand piece", () => {
    const bytes = packSfenToPackedSfen(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPP1/1B5R1/LNSGKGSNL b P 1",
    );
    expect(Buffer.from(bytes).toString("hex")).toBe(
      "9884713ddff75c47bfe0536666666602000020222222820ff063588ee7399601",
    );
  });

  it("always produces 32 bytes (piece-box case)", () => {
    const bytes = packSfenToPackedSfen("4k4/9/9/9/9/9/9/9/4K4 b - 1");
    expect(bytes.length).toBe(32);
  });

  it("unpacks startpos vector", () => {
    const packed = Uint8Array.from(
      Buffer.from("9884713ddff75c47bfe0536666666602000020222222227c801fc3723ccfb10c", "hex"),
    );
    expect(unpackPackedSfenToSfen(packed)).toBe(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );
  });

  it("round-trips piece-box case", () => {
    const sfen = "4k4/9/9/9/9/9/9/9/4K4 b - 1";
    const packed = packSfenToPackedSfen(sfen);
    expect(unpackPackedSfenToSfen(packed)).toBe(sfen);
  });
});
