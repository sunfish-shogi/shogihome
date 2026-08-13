// @vitest-environment node
//
// public/engines/basic/ に commit された WebAssembly エンジンが、
// TypeScript 実装 (src/renderer/players/basic.ts) と同じ手を選ぶことを確認する。
// 期待値は src/tests/renderer/players/basic.spec.ts と同じ局面から取っている。
// 仕様全般の確認は conformance.spec.ts が行う。
import { Position } from "tsshogi";
import { EngineHandle, handshake, launchEngine } from "./driver.js";

async function launchBasic(style: string): Promise<EngineHandle> {
  const engine = await launchEngine("basic");
  await handshake(engine);
  engine.command(`setoption name Style value ${style}`);
  // テストを高速化するため擬似思考時間を無効化する。
  engine.command("setoption name MinimumThinkingTime value 0");
  engine.command("isready");
  await engine.waitFor((line) => line === "readyok", "readyok");
  engine.command("usinewgame");
  engine.lines.length = 0;
  return engine;
}

async function bestMove(style: string, position: string): Promise<string> {
  const engine = await launchBasic(style);
  engine.command(position);
  engine.command("go btime 60000 wtime 60000 byoyomi 10000");
  const result = await engine.waitForResult();
  engine.quit();
  return result.substring("bestmove ".length).split(" ")[0];
}

describe("engines/basic (wasm)", () => {
  it("handshake", async () => {
    const engine = await launchEngine("basic");
    engine.command("usi");
    await engine.waitFor((line) => line === "usiok", "usiok");
    expect(engine.lines).toEqual([
      "id name ShogiHome Basic Engine",
      "id author Kubo, Ryosuke",
      "option name Style type combo default static_rook var static_rook var ranging_rook var random",
      "option name MinimumThinkingTime type spin default 500 min 0 max 60000",
      "option name USI_Ponder type check default false",
      "usiok",
    ]);
    engine.quit();
  });

  it("specificMoves", async () => {
    const testCases = [
      { style: "static_rook", moves: "2g2f 3c3d 7g7f 2b8h+ 7i8h 4a3b 2f2e", want: "3a2b" },
      { style: "static_rook", moves: "2g2f 8c8d 2f2e 8d8e", want: "7g7f" },
      { style: "ranging_rook", moves: "7g7f 3c3d 2g2f 4c4d 2f2e", want: "2b3c" },
      { style: "ranging_rook", moves: "7g7f 8c8d 2h6h 8d8e", want: "8h7g" },
    ];
    for (const testCase of testCases) {
      // 乱数によるタイブレークがあるため複数回試す。
      for (let i = 0; i < 3; i++) {
        const got = await bestMove(testCase.style, `position startpos moves ${testCase.moves}`);
        expect(got).toBe(testCase.want);
      }
    }
  }, 30000);

  it("resign", async () => {
    const sfen = "5+S2l/1+R7/2p1p+Bsp1/1p1p4p/8k/L3P1p1L/6PPP/1PGB3R1/3K2SNL w 3GS3N6P 1";
    for (const style of ["static_rook", "ranging_rook", "random"]) {
      const got = await bestMove(style, `position sfen ${sfen}`);
      expect(got).toBe("resign");
    }
  }, 20000);

  it("goMate/notImplemented", async () => {
    const engine = await launchBasic("static_rook");
    engine.command("position startpos");
    engine.command("go mate 1000");
    const result = await engine.waitForResult();
    expect(result).toBe("checkmate notimplemented");
    engine.quit();
  });

  it("minimumThinkingTime", async () => {
    const engine = await launchEngine("basic");
    await handshake(engine);
    engine.command("setoption name MinimumThinkingTime value 300");
    engine.command("isready");
    await engine.waitFor((line) => line === "readyok", "readyok");
    engine.lines.length = 0;
    const started = Date.now();
    engine.command("position startpos");
    engine.command("go btime 60000 wtime 60000 byoyomi 10000");
    await engine.waitForResult();
    // 探索自体は一瞬で終わるが、指定した思考時間までは bestmove を返さない。
    expect(Date.now() - started).toBeGreaterThanOrEqual(280);
    engine.quit();
  });

  it("randomPlayerGeneratesLegalMoves", async () => {
    const engine = await launchBasic("random");
    const position = new Position();
    const moves: string[] = [];
    for (let ply = 0; ply < 40; ply++) {
      engine.lines.length = 0;
      engine.command(`position startpos moves ${moves.join(" ")}`.trimEnd());
      engine.command("go btime 60000 wtime 60000 byoyomi 10000");
      const result = await engine.waitForResult();
      const usiMove = result.substring("bestmove ".length).split(" ")[0];
      if (usiMove === "resign") {
        break;
      }
      const move = position.createMoveByUSI(usiMove);
      expect(move, `invalid move notation: ${usiMove}`).toBeTruthy();
      expect(position.doMove(move!), `illegal move: ${usiMove}`).toBeTruthy();
      moves.push(usiMove);
    }
    expect(moves.length).toBeGreaterThan(0);
    engine.quit();
  }, 30000);
});
