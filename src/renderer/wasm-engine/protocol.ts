// USI プロトコルの行の解析と組み立て。副作用を持たない純粋関数だけを置く。
//
// NOTE: Electron 版は src/background/usi/engine.ts が同等の処理を持つ。
// renderer から background を参照できないため、WebAssembly エンジンに必要な範囲だけを
// ここに実装している。
import { SCORE_MATE_INFINITE, USIInfoCommand } from "@/common/game/usi.js";
import { USIEngineOption, USIEngineOptionType } from "@/common/settings/usi.js";
import { TimeStates } from "@/common/game/time.js";
import { Color } from "tsshogi";

function parseScoreMate(arg: string): number {
  switch (arg) {
    case "+":
    case "+0":
    case "0":
      return +SCORE_MATE_INFINITE;
    case "-":
    case "-0":
      return -SCORE_MATE_INFINITE;
    default:
      return Number(arg);
  }
}

export function parseInfoCommand(args: string): USIInfoCommand {
  const result: USIInfoCommand = {};
  const s = args.split(" ");
  for (let i = 0; i < s.length; i += 1) {
    switch (s[i]) {
      case "depth":
        result.depth = Number(s[i + 1]);
        i += 1;
        break;
      case "seldepth":
        result.seldepth = Number(s[i + 1]);
        i += 1;
        break;
      case "time":
        result.timeMs = Number(s[i + 1]);
        i += 1;
        break;
      case "nodes":
        result.nodes = Number(s[i + 1]);
        i += 1;
        break;
      case "pv":
        result.pv = s.slice(i + 1);
        i = s.length;
        break;
      case "multipv":
        result.multipv = Number(s[i + 1]);
        i += 1;
        break;
      case "score":
        switch (s[i + 1]) {
          case "cp":
            result.scoreCP = Number(s[i + 2]);
            i += 2;
            break;
          case "mate":
            result.scoreMate = parseScoreMate(s[i + 2]);
            i += 2;
            break;
        }
        break;
      case "lowerbound":
        result.lowerbound = true;
        break;
      case "upperbound":
        result.upperbound = true;
        break;
      case "currmove":
        result.currmove = s[i + 1];
        i += 1;
        break;
      case "hashfull":
        result.hashfullPerMill = Number(s[i + 1]);
        i += 1;
        break;
      case "nps":
        result.nps = Number(s[i + 1]);
        i += 1;
        break;
      case "string":
        result.string = s.slice(i + 1).join(" ");
        i = s.length;
        break;
    }
  }
  return result;
}

// "option " より後ろの文字列を解析する。
// NOTE: 名前に空白を含むオプションには対応しない。 (Electron 版も同じ制限を持つ)
export function parseOptionCommand(args: string, order: number): USIEngineOption | undefined {
  const s = args.split(" ");
  if (s.length < 4 || s[0] !== "name" || s[2] !== "type") {
    return;
  }
  const name = s[1];
  const type = s[3] as USIEngineOptionType;
  const option: USIEngineOption =
    type === "combo" ? { name, type, order, vars: [] } : { name, type, order };
  if (option.type !== "button") {
    for (let i = 4; i + 1 < s.length; i = i + 2) {
      switch (s[i]) {
        case "default":
          option.default = option.type === "spin" ? Number(s[i + 1]) : s[i + 1];
          break;
        case "min":
          if (option.type === "spin") {
            option.min = Number(s[i + 1]);
          }
          break;
        case "max":
          if (option.type === "spin") {
            option.max = Number(s[i + 1]);
          }
          break;
        case "var":
          if (option.type === "combo") {
            option.vars.push(s[i + 1]);
          }
          break;
      }
    }
  }
  return option;
}

export type BestMove = {
  move: string;
  ponder?: string;
};

// "bestmove " より後ろの文字列を解析する。
export function parseBestMove(args: string): BestMove {
  const s = args.split(" ");
  return {
    move: s[0],
    ponder: (s.length >= 3 && s[1] === "ponder" && s[2]) || undefined,
  };
}

// go / go ponder に付与する時間の指定を組み立てる。
// NOTE: src/background/usi/index.ts の buildTimeState と同じ換算を行う。
export function buildTimeOptions(color: Color, timeStates: TimeStates): string {
  const black = timeStates.black;
  const white = timeStates.white;
  const byoyomi = timeStates[color].byoyomi;
  // USI では btime + binc (または wtime + winc) が今回利用可能な時間を表すとしている。
  // ShogiHome では既に加算した後の値を保持しているため、ここで減算する。
  const btime = black.timeMs - black.increment * 1e3;
  const wtime = white.timeMs - white.increment * 1e3;
  // USI で byoyomi と binc, winc の同時使用は認められていない。
  // ShogiHome では一方が秒読みでもう一方がフィッシャーという設定も可能なので、
  // 自分が秒読みの場合はそれを優先し、相手の加算時間は記述しない。
  const binc = byoyomi === 0 ? black.increment * 1e3 : 0;
  const winc = byoyomi === 0 ? white.increment * 1e3 : 0;
  return (
    `btime ${btime} wtime ${wtime} ` +
    (binc !== 0 || winc !== 0 ? `binc ${binc} winc ${winc}` : `byoyomi ${byoyomi * 1e3}`)
  );
}
