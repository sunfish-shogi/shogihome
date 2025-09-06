import { Readable } from "node:stream";
import { loadYaneuraOuBook, validateBookPositionOrdering } from "@/background/book/yaneuraou.js";

describe("background/book/yaneuraou", () => {
  describe("loadYaneuraOuBook", () => {
    it("ok", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 1.00\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
      ]);
      const book = await loadYaneuraOuBook(input);
      expect(Object.fromEntries(book.entries.entries())).toEqual({
        "+P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 1": {
          type: "normal",
          comment: "",
          moves: [
            ["4e4f", "9c9d", 120, 40, 2, ""],
            ["6e6f", "6g6h", -32, 32, 0, ""],
          ],
          minPly: 78,
        },
        "lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 1": {
          type: "normal",
          comment: "",
          moves: [
            ["4e7h+", undefined, 540, 38, 1, ""],
            ["2d8d", undefined, 140, 36, 1, ""],
          ],
          minPly: 64,
        },
        "+B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p 1": {
          type: "normal",
          comment: "",
          moves: [["9f9e", "8g7g", 0, 32, 1, ""]],
          minPly: 0,
        },
      });
    });

    it("invalid header", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 2.00\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
      ]);
      await expect(loadYaneuraOuBook(input)).rejects.toThrow(
        "Unsupported book header: #YANEURAOU-DB2016 2.00",
      );
    });
  });

  describe("validateBookPositionOrdering", async () => {
    it("ordered", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 1.00\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
      ]);
      expect(await validateBookPositionOrdering(input)).toBeTruthy();
    });

    it("not ordered", async () => {
      const input = Readable.from([
        "#YANEURAOU-DB2016 1.00\n",
        "sfen +P1kg3nl/1ps2b3/+P3p3p/2pgsr1p1/s2p1pP2/2P1P1pR1/1SNG1P2P/1KG6/7NL w N2LPb2p 78\n",
        "4e4f 9c9d 120 40 2\n",
        "6e6f 6g6h -32 32 0\n",
        "sfen lnB4nl/4k1g2/p3pps2/1G5rp/1pPPsb3/3p2P1P/PPS1PP3/2G1KSGP1/LN5NL w R2Pp 64\n",
        "4e7h+ none 540 38 1\n",
        "2d8d none 140 36 1\n",
        "sfen +B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p\n",
        "9f9e 8g7g 0 32 1\n",
      ]);
      expect(await validateBookPositionOrdering(input)).toBeFalsy();
    });
  });
});
