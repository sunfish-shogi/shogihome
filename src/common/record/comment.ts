import {
  ImmutablePosition,
  Move,
  parseCSAMove,
  formatPV,
  parsePV,
  formatCSAMove,
  formatKIFMove,
  Color,
} from "tsshogi";
import { SCORE_MATE_INFINITE } from "@/common/game/usi.js";
import { RecordCustomData, SearchInfo, SearchInfoSenderType } from "./types.js";
import { getSituationText } from "./score.js";

function parsePlayerMateScoreComment(line: string): number | undefined {
  const matched = /^\*詰み=(先手勝ち|後手勝ち)(?::([0-9]+)手)?/.exec(line);
  if (matched) {
    return Number(matched[2] || SCORE_MATE_INFINITE) * (matched[1] === "先手勝ち" ? 1 : -1);
  }
}

function parseResearchMateScoreComment(line: string): number | undefined {
  const matched = /^#詰み=(先手勝ち|後手勝ち)(?::([0-9]+)手)?/.exec(line);
  if (matched) {
    return Number(matched[2] || SCORE_MATE_INFINITE) * (matched[1] === "先手勝ち" ? 1 : -1);
  }
}

function parsePlayerScoreComment(line: string): number | undefined {
  const matched = /^\*評価値=([+-]?[0-9]+(?:\.[0-9]+)?)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseResearchScoreComment(line: string): number | undefined {
  const matched = /^#評価値=([+-]?[0-9]+(?:\.[0-9]+)?)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseFloodgateScoreComment(line: string): number | undefined {
  const matched = /^\* *([+-]?[0-9]+(?:\.[0-9]+)?)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseShogiGUIPlayerScoreComment(line: string): number | undefined {
  const matched = /^\*対局 .* 評価値 ([+-]?[0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseShogiGUIAnalysisScoreComment(line: string): number | undefined {
  const matched = /^\*解析 .* 評価値 ([+-]?[0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseKishinAnalyticsScoreComment(line: string): number | undefined {
  const matched = /^\* .* 評価値 ([+-]?[0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseKShogiPlayerScoreComment(line: string): number | undefined {
  const matched = /^#(?:形勢|指し手)\[([+-]?[0-9]+)\]/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parsePlayerDepthComment(line: string): number | undefined {
  const matched = /^\*深さ=([0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseResearchDepthComment(line: string): number | undefined {
  const matched = /^#深さ=([0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseShogiGUIPlayerDepthComment(line: string): number | undefined {
  if (!/^\*対局 /.test(line)) {
    return undefined;
  }
  const matched = / 深さ ([0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

function parseShogiGUIAnalysisDepthComment(line: string): number | undefined {
  if (!/^\*解析 /.test(line)) {
    return undefined;
  }
  const matched = / 深さ ([0-9]+)/.exec(line);
  return matched ? Number(matched[1]) : undefined;
}

export function parseComment(comment: string, base: RecordCustomData = {}): RecordCustomData {
  const data = { ...base };
  const lines = comment.split("\n");
  for (const line of lines) {
    const playerMateScore = parsePlayerMateScoreComment(line);
    if (playerMateScore !== undefined) {
      data.playerSearchInfo = {
        ...data.playerSearchInfo,
        mate: playerMateScore,
      };
    }
    const researchMateScore = parseResearchMateScoreComment(line);
    if (researchMateScore !== undefined) {
      data.researchInfo = {
        ...data.researchInfo,
        mate: researchMateScore,
      };
    }
    const playerScore =
      parsePlayerScoreComment(line) ??
      parseFloodgateScoreComment(line) ??
      parseShogiGUIPlayerScoreComment(line);
    if (playerScore !== undefined) {
      data.playerSearchInfo = {
        ...data.playerSearchInfo,
        score: playerScore,
      };
    }
    const researchScore =
      parseResearchScoreComment(line) ??
      parseShogiGUIAnalysisScoreComment(line) ??
      parseKishinAnalyticsScoreComment(line) ??
      parseKShogiPlayerScoreComment(line);
    if (researchScore !== undefined) {
      data.researchInfo = {
        ...data.researchInfo,
        score: researchScore,
      };
    }
    const playerDepth = parsePlayerDepthComment(line) ?? parseShogiGUIPlayerDepthComment(line);
    if (playerDepth !== undefined) {
      data.playerSearchInfo = {
        ...data.playerSearchInfo,
        depth: playerDepth,
      };
    }
    const researchDepth =
      parseResearchDepthComment(line) ?? parseShogiGUIAnalysisDepthComment(line);
    if (researchDepth !== undefined) {
      data.researchInfo = {
        ...data.researchInfo,
        depth: researchDepth,
      };
    }
  }
  return data;
}

export function buildSearchComment(
  position: ImmutablePosition,
  type: SearchInfoSenderType,
  searchInfo: SearchInfo,
  options?: {
    engineName?: string;
  },
): string {
  const prefix = type === SearchInfoSenderType.PLAYER ? "*" : "#";
  let comment = "";
  if (searchInfo.mate) {
    const result = searchInfo.mate >= 0 ? "先手勝ち" : "後手勝ち";
    comment += `${prefix}詰み=${result}`;
    if (Math.abs(searchInfo.mate) !== SCORE_MATE_INFINITE) {
      comment += `:${Math.abs(searchInfo.mate)}手`;
    }
    comment += "\n";
  }
  if (searchInfo.score !== undefined) {
    comment += getSituationText(searchInfo.score) + "\n";
    comment += `${prefix}評価値=${searchInfo.score}\n`;
  }
  if (searchInfo.pv && searchInfo.pv.length !== 0) {
    comment += `${prefix}読み筋=${formatPV(position, searchInfo.pv)}\n`;
  }
  if (searchInfo.depth) {
    comment += `${prefix}深さ=${searchInfo.depth}\n`;
  }
  if (searchInfo.nodes) {
    comment += `${prefix}ノード数=${searchInfo.nodes}\n`;
  }
  if (comment && options?.engineName) {
    comment += `${prefix}エンジン=${options.engineName}\n`;
  }
  return comment;
}

export function buildFloodgateSearchComment(searchInfo: SearchInfo): string {
  const score =
    searchInfo.mate !== undefined
      ? searchInfo.mate > 0
        ? 30000
        : -30000
      : searchInfo.score !== undefined
        ? searchInfo.score
        : 0;
  let comment = `* ${score}`;
  for (const move of searchInfo.pv || []) {
    comment += " " + formatCSAMove(move);
  }
  return comment;
}

export function buildCSA3SearchComment(searchInfo: SearchInfo): string {
  const floodgate = buildFloodgateSearchComment(searchInfo);
  return floodgate + (searchInfo.nodes !== undefined ? ` #${searchInfo.nodes}` : "");
}

export function buildShogiGUISearchComment(
  type: SearchInfoSenderType,
  searchInfo: SearchInfo,
): string {
  // *[<種類>] [<multipv>] [時間 <時間>] [深さ <深さ>] [ノード数 <ノード数>] [評価値 <評価値>] [<読み筋>]
  let comment = `*${type === SearchInfoSenderType.PLAYER ? "対局" : "解析"}`;
  if (searchInfo.depth !== undefined) {
    comment += ` 深さ ${searchInfo.depth}`;
  }
  if (searchInfo.nodes !== undefined) {
    comment += ` ノード数 ${searchInfo.nodes}`;
  }
  if (searchInfo.score !== undefined) {
    comment += ` 評価値 ${searchInfo.score}`;
  } else if (searchInfo.mate !== undefined) {
    comment += ` 評価値 ${searchInfo.mate > 0 ? 30000 : -30000}`;
  }
  if (searchInfo.pv?.length) {
    comment += " 読み筋";
    for (const move of searchInfo.pv) {
      comment += " " + (move.color === Color.BLACK ? "▲" : "△") + formatKIFMove(move);
    }
  }
  return comment;
}

function parseFloodgatePVComment(position: ImmutablePosition, line: string): Move[] {
  const begin = line.indexOf(" ", line.indexOf(" ") + 1) + 1;
  const pv: Move[] = [];
  const pos = position.clone();
  for (let i = begin; i < line.length; i += 8) {
    const csa = line.substring(i, i + 7);
    const move = parseCSAMove(pos, csa);
    if (move instanceof Error || !pos.doMove(move, { ignoreValidation: false })) {
      break;
    }
    pv.push(move);
  }
  return pv;
}

export function getPVsFromSearchComment(position: ImmutablePosition, comment: string): Move[][] {
  const pvs: Move[][] = [];
  for (const line of comment.split("\n")) {
    let pv: Move[] | undefined;
    // ShogiHome
    if (/^[#*]読み筋=/.test(line)) {
      pv = parsePV(position, line.substring(5));
    }
    // ShogiGUI or 棋神アナリティクス
    else if (/^\*.* 読み筋 /.test(line)) {
      const moveStr = line.substring(line.indexOf(" 読み筋 ") + 5);
      const sign = position.color === Color.BLACK ? "▲" : "△";
      pv = parsePV(position, moveStr.substring(moveStr.indexOf(sign)));
    }
    // K-Shogi or ぴよ将棋
    // "#推奨手[" という表記もあるが、それは 1 つ前の局面で別の手を指した場合の手順なので対象外とする。
    else if (/^#(?:指し手|形勢)\[/.test(line)) {
      const moveStr = line.substring(line.indexOf("]") + 1);
      const sign = position.color === Color.BLACK ? "▲" : "△";
      pv = parsePV(position, moveStr.substring(moveStr.indexOf(sign)));
    }
    // Floodgate
    else if (/^\* -?[0-9]+ /.test(line)) {
      pv = parseFloodgatePVComment(position, line);
    }
    if (pv?.length) {
      pvs.push(pv);
    }
  }
  return pvs;
}
