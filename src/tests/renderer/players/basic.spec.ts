import { listMovesFast, listMovesLegacy } from "@/renderer/players/basic.js";
import { ImmutablePosition, Position } from "tsshogi";

describe("basic fast move generation", () => {
  function mustPosition(sfen: string): Position {
    const position = Position.newBySFEN(sfen);
    expect(position).not.toBeNull();
    return position as Position;
  }

  function toLegalUSISet(
    position: ImmutablePosition,
    moves: ReturnType<typeof listMovesFast>,
  ): Set<string> {
    return new Set(moves.filter((m) => position.isValidMove(m)).map((m) => m.usi));
  }

  function expectEquivalent(position: ImmutablePosition): void {
    const legacy = toLegalUSISet(position, listMovesLegacy(position));
    const fast = toLegalUSISet(position, listMovesFast(position));
    expect(fast).toEqual(legacy);
  }

  it("matches legacy legal-move set in representative SFENs", () => {
    const sfens = [
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      "3sks3/9/4+P4/9/9/8+B/9/9/9 b S2rb4gs4n4l17p 1",
      "+B3g3l/5rgk1/pB+P1ppn1p/n4spp1/1G1SP3P/K2P5/1+pS3P2/P2+l+r4/LNP6 b SNL2Pg2p 31",
    ];
    for (const sfen of sfens) {
      const position = mustPosition(sfen);
      expectEquivalent(position);
    }
  });

  it("matches legacy legal-move set on random playout positions", () => {
    const position = mustPosition(
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
    );

    let seed = 123456789;
    const next = (n: number): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed % n;
    };

    for (let i = 0; i < 40; i++) {
      expectEquivalent(position);
      const legal = listMovesLegacy(position).filter((m) => position.isValidMove(m));
      if (legal.length === 0) {
        break;
      }
      const move = legal[next(legal.length)];
      position.doMove(move);
    }
  });
});
