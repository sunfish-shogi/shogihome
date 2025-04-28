import { USIInfoCommand } from "@/common/game/usi.js";
import { USIPlayerMonitor } from "@/renderer/store/usi.js";
import { bench } from "vitest";

function pv(s: string): string[] {
  return s.split(" ");
}

describe("store/usi", () => {
  const monitorUpdateTestCases: { sfen: string; update: USIInfoCommand }[] = [];
  for (let i = 0; i < 50; i++) {
    monitorUpdateTestCases.push({
      sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      update: {
        depth: 8 + i,
        seldepth: 10 + i,
        timeMs: 1000 * i,
        nodes: 10000 * i,
        pv: pv(
          "7g7f 8c8d 6i7h 8d8e 8h7g 3c3d 7i6h 4a3b 3g3f 7a6b 1g1f 2b7g+ 6h7g 1c1d 2g2f 3a2b 2i3g 9c9d 3i3h 2b3c 9g9f 5a4b 5i6h 7c7d 4g4f 6c6d 3h4g 6b6c 2f2e 8a7c 4g5f 8b8a 4i4h 6c5d",
        ),
        multipv: 1,
        scoreCP: 120,
        currmove: "7g7f",
        hashfullPerMill: 32,
        nps: 40000,
      },
    });
  }
  for (let i = 0; i < 50; i++) {
    monitorUpdateTestCases.push({
      sfen: "l3k2nl/1r2g1gp1/p1ns1p2p/2p1psp2/Pp7/2PS1SP2/1P2PPN1P/2G1G2R1/LNK5L b B2Pbp 1",
      update: {
        depth: 15 + i,
        seldepth: 17 + i,
        timeMs: 2000 * i,
        nodes: 20000 * i,
        pv: pv(
          "4f4e 8e8f 8g8f B*6d B*1e 5a4a P*6e 6d8f P*8g 8f3a 4e4d 4c4d 3g2e 6c7b 5h6g P*6d 8i7g 6d6e 7g6e 3a6d 2h2i 7c6e 6f6e 6d5e N*6d",
        ),
        multipv: i % 3,
        scoreCP: -20,
        currmove: "4f4e",
        hashfullPerMill: 25,
        nps: 90000,
      },
    });
  }
  for (let i = 0; i < 50; i++) {
    monitorUpdateTestCases.push({
      sfen: "l4k1nl/4g1gp1/p1n2p2p/2pspsp2/P8/2PS1SP2/+rGN1PPN1P/3G3R1/L1K5L b 2P2b3p 1",
      update: {
        depth: 12 + i,
        seldepth: 15 + i,
        timeMs: 1800 * i,
        nodes: 15000 * i,
        pv: pv(
          "9i9g P*6e R*7a 4a4b 7a2a+ B*9h 8g8h 9h7f+ N*2d 6e6f 2d3b+ 4b5c 2a6a 6f6g+ P*6e 6g6h 2h6h",
        ),
        scoreCP: 70,
        currmove: "9i9g",
        hashfullPerMill: 30,
        nps: 80000,
      },
    });
  }
  const monitor = new USIPlayerMonitor(1, "name");

  bench(
    "USIPlayerMonitor",
    () => {
      for (const testCase of monitorUpdateTestCases) {
        monitor.update(testCase.sfen, testCase.update, 100, undefined);
      }
    },
    { time: 1000, throws: true },
  );
});
