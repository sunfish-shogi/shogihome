// @vitest-environment node
//
// public/engines/basic/ に commit された WebAssembly エンジンの振る舞いを確認する。
// 仕様全般 (ハンドシェイク・stop・quit など) の確認は conformance.spec.ts が行うので、
// ここでは探索と評価に関する性質だけを扱う。
import { Position } from "tsshogi";
import { EngineHandle, handshake, launchEngine } from "./driver.js";

async function launchBasic(style: string, options: Record<string, string> = {}) {
  const engine = await launchEngine("basic");
  await handshake(engine);
  engine.command(`setoption name Style value ${style}`);
  // テストを高速化するため擬似思考時間を無効化する。
  engine.command("setoption name MinimumThinkingTime value 0");
  for (const [name, value] of Object.entries(options)) {
    engine.command(`setoption name ${name} value ${value}`);
  }
  engine.command("isready");
  await engine.waitFor((line) => line === "readyok", "readyok");
  engine.command("usinewgame");
  engine.lines.length = 0;
  return engine;
}

async function bestMove(engine: EngineHandle, position: string): Promise<string> {
  engine.lines.length = 0;
  engine.command(position);
  engine.command("go btime 60000 wtime 60000 byoyomi 10000");
  const result = await engine.waitForResult();
  return result.substring("bestmove ".length).split(" ")[0];
}

async function searchOnce(style: string, position: string): Promise<string> {
  const engine = await launchBasic(style);
  const move = await bestMove(engine, position);
  engine.quit();
  return move;
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
      "option name Depth type spin default 3 min 1 max 5",
      "option name MinimumThinkingTime type spin default 500 min 0 max 60000",
      "option name USI_Hash type spin default 16 min 1 max 256",
      "option name Randomize type check default true",
      "option name USI_Ponder type check default false",
      "usiok",
    ]);
    engine.quit();
  });

  it("ただ取りできる駒を取ること", async () => {
    // 5五 の飛車は取られても取り返せない。
    const sfen = "4k4/9/9/9/4r4/4P4/9/9/4K4 b - 1";
    for (const style of ["static_rook", "ranging_rook"]) {
      expect(await searchOnce(style, `position sfen ${sfen}`), style).toBe("5f5e");
    }
  }, 30000);

  it("1 手詰めを見つけること", async () => {
    const engine = await launchBasic("static_rook");
    engine.lines.length = 0;
    engine.command("position sfen 4k4/9/4G4/9/9/9/9/9/4K4 b G 1");
    engine.command("go btime 60000 wtime 60000 byoyomi 10000");
    const result = await engine.waitForResult();
    expect(result.substring("bestmove ".length).split(" ")[0]).toBe("G*5b");
    // 詰みは score mate として報告される。
    const info = engine.lines.filter((line) => line.startsWith("info "));
    expect(info.some((line) => line.includes("score mate 1"))).toBeTruthy();
    engine.quit();
  }, 20000);

  it("反復深化で深さ 3 まで読むこと", async () => {
    const engine = await launchBasic("static_rook");
    engine.lines.length = 0;
    engine.command("position startpos");
    engine.command("go btime 60000 wtime 60000 byoyomi 10000");
    await engine.waitForResult();
    const depths = engine.lines
      .filter((line) => line.startsWith("info depth "))
      .map((line) => Number(line.split(" ")[2]));
    // 浅い方から順に出力され、最終的に深さ 3 に到達すること。
    expect(depths).toContain(1);
    expect(Math.max(...depths)).toBe(3);
    // 読み筋が指し手の列として出ること。
    expect(engine.lines.some((line) => /\bpv( [0-9a-i+*A-Z]+){2,}/.test(line))).toBeTruthy();
    engine.quit();
  }, 20000);

  it("Depth オプションで深さを変更できること", async () => {
    const engine = await launchBasic("static_rook", { Depth: "1" });
    engine.lines.length = 0;
    engine.command("position startpos");
    engine.command("go btime 60000 wtime 60000 byoyomi 10000");
    await engine.waitForResult();
    const depths = engine.lines
      .filter((line) => line.startsWith("info depth "))
      .map((line) => Number(line.split(" ")[2]));
    expect(Math.max(...depths)).toBe(1);
    engine.quit();
  }, 20000);

  // Lv. 3 のプリセット (Depth=5) が実際に深く読むこと。
  it("Depth=5 で深さ 5 まで読むこと", async () => {
    const engine = await launchBasic("static_rook", { Depth: "5" });
    engine.lines.length = 0;
    engine.command("position startpos");
    engine.command("go btime 600000 wtime 600000 byoyomi 30000");
    await engine.waitForResult();
    const depths = engine.lines
      .filter((line) => line.startsWith("info depth "))
      .map((line) => Number(line.split(" ")[2]));
    expect(Math.max(...depths)).toBe(5);
    engine.quit();
  }, 30000);

  it("合法手が無ければ投了すること", async () => {
    const sfen = "5+S2l/1+R7/2p1p+Bsp1/1p1p4p/8k/L3P1p1L/6PPP/1PGB3R1/3K2SNL w 3GS3N6P 1";
    for (const style of ["static_rook", "ranging_rook", "random"]) {
      expect(await searchOnce(style, `position sfen ${sfen}`), style).toBe("resign");
    }
  }, 30000);

  // Emscripten は既定で例外を捕捉できず、throw がそのまま abort になる。
  // 数値の解析で例外を投げると、GUI から値を渡されただけでランタイムごと落ちる。
  it("不正な値でランタイムが落ちないこと", async () => {
    const engine = await launchEngine("basic");
    await handshake(engine);
    engine.command("setoption name Depth value abc");
    engine.command("setoption name MinimumThinkingTime value");
    engine.command("isready");
    await engine.waitFor((line) => line === "readyok", "readyok");
    engine.command("usinewgame");
    engine.lines.length = 0;
    // 未知のキーや数値でない値が混ざっていても思考できること。
    engine.command("position startpos");
    engine.command("go searchmoves 7g7f btime xyz wtime 60000 byoyomi 10000");
    const result = await engine.waitForResult();
    expect(result.startsWith("bestmove ")).toBeTruthy();
    expect(engine.lines.filter((line) => line.startsWith("ERR "))).toEqual([]);
    engine.quit();
  }, 20000);

  // ponderhit は go と同じ形式で時間を受け取る。
  // 解析を誤ると値のトークンをキーとして扱い、abort してランタイムが落ちる。
  it("go ponder から ponderhit で着手すること", async () => {
    const engine = await launchBasic("static_rook", { USI_Ponder: "true" });
    engine.lines.length = 0;
    engine.command("position startpos moves 7g7f");
    engine.command("go ponder btime 300000 wtime 300000 byoyomi 30000");
    // go ponder の間は bestmove を返さない。
    for (let i = 0; i < 20; i++) {
      engine.poll();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(engine.lines.some((line) => line.startsWith("bestmove "))).toBeFalsy();

    engine.command("ponderhit btime 300000 wtime 300000 byoyomi 30000");
    const result = await engine.waitForResult();
    expect(result.startsWith("bestmove ")).toBeTruthy();
    expect(engine.lines.filter((line) => line.startsWith("ERR "))).toEqual([]);
    engine.quit();
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
    engine.command("usinewgame");
    await engine.waitFor((line) => line === "readyok", "readyok");
    engine.lines.length = 0;
    const started = Date.now();
    engine.command("position startpos");
    engine.command("go btime 60000 wtime 60000 byoyomi 10000");
    await engine.waitForResult();
    // 探索が早く終わっても、指定した思考時間までは bestmove を返さない。
    expect(Date.now() - started).toBeGreaterThanOrEqual(280);
    engine.quit();
  }, 20000);

  // 最低思考時間より持ち時間の方が短い場合は、持ち時間の方を優先する。
  // 切れ負け (秒読みも加算も無い設定) で残りが少なくなると発生する。
  it("持ち時間が短ければ最低思考時間より早く指すこと", async () => {
    const engine = await launchEngine("basic");
    await handshake(engine);
    // 既定と同じ 500ms。持ち時間 1 秒の 1/40 = 25ms (下限 100ms) より長い。
    engine.command("setoption name MinimumThinkingTime value 500");
    engine.command("isready");
    engine.command("usinewgame");
    await engine.waitFor((line) => line === "readyok", "readyok");
    engine.lines.length = 0;
    const started = Date.now();
    engine.command("position startpos");
    engine.command("go btime 1000 wtime 1000");
    const result = await engine.waitForResult();
    const elapsed = Date.now() - started;
    expect(result.startsWith("bestmove ")).toBeTruthy();
    // poll の間隔と実行環境の揺れを見込んでも、最低思考時間より十分に早いこと。
    expect(elapsed).toBeLessThan(400);
    engine.quit();
  }, 20000);

  // ベンチマークで改良の効果をノード数で測れるようにするための性質。
  // 乱数は根の窓にも影響するため、無効にしないとノード数が数 % ぶれる。
  it("Randomize を無効にすると探索が決定的になること", async () => {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const engine = await launchBasic("static_rook", { Randomize: "false", Depth: "3" });
      engine.lines.length = 0;
      engine.command("position startpos moves 7g7f 3c3d 2g2f");
      engine.command("go btime 600000 wtime 600000 byoyomi 30000");
      const result = await engine.waitForResult();
      const info = engine.lines.filter((line) => line.startsWith("info ")).pop() as string;
      runs.push({
        bestMove: result,
        nodes: /\bnodes (\d+)/.exec(info)?.[1],
        score: /\bscore cp (-?\d+)/.exec(info)?.[1],
      });
      engine.quit();
    }
    expect(runs[0].nodes).toBeTruthy();
    expect(runs[1]).toEqual(runs[0]);
  }, 30000);

  it("ランダムプレイヤーが合法手を返すこと", async () => {
    const engine = await launchBasic("random");
    const position = new Position();
    const moves: string[] = [];
    for (let ply = 0; ply < 40; ply++) {
      const usiMove = await bestMove(
        engine,
        `position startpos moves ${moves.join(" ")}`.trimEnd(),
      );
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

  it("居飛車と振り飛車で玉の囲いが分かれること", async () => {
    // 双方が駒組を進めた局面で、玉をどちらへ寄せるかを確認する。
    const sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
    const moves: Record<string, string[]> = {};
    for (const style of ["static_rook", "ranging_rook"]) {
      // 乱数が入ると 24 手のうちに囲いへ寄り切らないことがあるので、決定的に指させる。
      const engine = await launchBasic(style, { Randomize: "false" });
      const played: string[] = [];
      const position = new Position();
      for (let ply = 0; ply < 24; ply++) {
        const usiMove = await bestMove(
          engine,
          `position sfen ${sfen} moves ${played.join(" ")}`.trimEnd(),
        );
        if (usiMove === "resign") {
          break;
        }
        const move = position.createMoveByUSI(usiMove);
        expect(move, `invalid move: ${usiMove}`).toBeTruthy();
        expect(position.doMove(move!), `illegal move: ${usiMove}`).toBeTruthy();
        played.push(usiMove);
      }
      moves[style] = played;
      engine.quit();
    }
    // 先手番のみを取り出し、玉が左右どちらへ動いたかを見る。
    const kingFile = (played: string[]) => {
      const position = new Position();
      for (const usiMove of played) {
        position.doMove(position.createMoveByUSI(usiMove)!);
      }
      for (const square of position.board.listNonEmptySquares()) {
        const piece = position.board.at(square)!;
        if (piece.type === "king" && piece.color === "black") {
          return square.file;
        }
      }
      return 5;
    };
    // 居飛車は左 (筋の数字が大きい方)、振り飛車は右へ玉を囲う。
    expect(kingFile(moves["static_rook"])).toBeGreaterThan(5);
    expect(kingFile(moves["ranging_rook"])).toBeLessThanOrEqual(5);
  }, 60000);
});
