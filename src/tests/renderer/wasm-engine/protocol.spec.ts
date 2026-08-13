import { SCORE_MATE_INFINITE } from "@/common/game/usi.js";
import {
  buildTimeOptions,
  parseBestMove,
  parseInfoCommand,
  parseOptionCommand,
} from "@/renderer/wasm-engine/protocol.js";
import { Color } from "tsshogi";

describe("wasm-engine/protocol", () => {
  it("parseInfoCommand", () => {
    expect(
      parseInfoCommand("depth 2 seldepth 3 time 12 nodes 1097 nps 91416 score cp 42 pv 7g7f 3c3d"),
    ).toEqual({
      depth: 2,
      seldepth: 3,
      timeMs: 12,
      nodes: 1097,
      nps: 91416,
      scoreCP: 42,
      pv: ["7g7f", "3c3d"],
    });
    expect(parseInfoCommand("score mate + multipv 2 hashfull 500 lowerbound")).toEqual({
      scoreMate: SCORE_MATE_INFINITE,
      multipv: 2,
      hashfullPerMill: 500,
      lowerbound: true,
    });
    expect(parseInfoCommand("score mate -5 upperbound currmove 2g2f")).toEqual({
      scoreMate: -5,
      upperbound: true,
      currmove: "2g2f",
    });
    expect(parseInfoCommand("string hello world")).toEqual({ string: "hello world" });
  });

  it("parseOptionCommand", () => {
    expect(parseOptionCommand("name USI_Hash type spin default 32 min 1 max 1024", 100)).toEqual({
      name: "USI_Hash",
      type: "spin",
      order: 100,
      default: 32,
      min: 1,
      max: 1024,
    });
    expect(
      parseOptionCommand("name Style type combo default static_rook var static_rook var random", 5),
    ).toEqual({
      name: "Style",
      type: "combo",
      order: 5,
      default: "static_rook",
      vars: ["static_rook", "random"],
    });
    expect(parseOptionCommand("name Clear type button", 1)).toEqual({
      name: "Clear",
      type: "button",
      order: 1,
    });
    expect(parseOptionCommand("invalid", 1)).toBeUndefined();
  });

  it("parseBestMove", () => {
    expect(parseBestMove("7g7f")).toEqual({ move: "7g7f", ponder: undefined });
    expect(parseBestMove("7g7f ponder 3c3d")).toEqual({ move: "7g7f", ponder: "3c3d" });
    expect(parseBestMove("resign")).toEqual({ move: "resign", ponder: undefined });
  });

  it("buildTimeOptions/byoyomi", () => {
    const timeStates = {
      black: { timeMs: 300000, byoyomi: 30, increment: 0 },
      white: { timeMs: 250000, byoyomi: 30, increment: 0 },
    };
    expect(buildTimeOptions(Color.BLACK, timeStates)).toBe(
      "btime 300000 wtime 250000 byoyomi 30000",
    );
  });

  it("buildTimeOptions/increment", () => {
    // 加算後の値を保持しているため、増加分を差し引いた値が送られる。
    const timeStates = {
      black: { timeMs: 300000, byoyomi: 0, increment: 5 },
      white: { timeMs: 250000, byoyomi: 0, increment: 10 },
    };
    expect(buildTimeOptions(Color.WHITE, timeStates)).toBe(
      "btime 295000 wtime 240000 binc 5000 winc 10000",
    );
  });

  it("buildTimeOptions/mixed", () => {
    // 自分が秒読みの場合は秒読みを優先し、相手の加算時間は記述しない。
    // ただし btime/wtime からの減算は双方に対して行う。
    const timeStates = {
      black: { timeMs: 300000, byoyomi: 30, increment: 0 },
      white: { timeMs: 250000, byoyomi: 0, increment: 10 },
    };
    expect(buildTimeOptions(Color.BLACK, timeStates)).toBe(
      "btime 300000 wtime 240000 byoyomi 30000",
    );
  });
});
