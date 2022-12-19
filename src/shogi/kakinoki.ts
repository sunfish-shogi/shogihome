// KIF file format (.kif or .kifu)
// See http://kakinoki.o.oo7.jp/kif_format.html

import { appendLine } from "@/helpers/string";
import { millisecondsToHMMSS, millisecondsToMSS } from "@/helpers/time";
import {
  Color,
  Move,
  Position,
  ImmutablePosition,
  Record,
  RecordMetadata,
  RecordMetadataKey,
  Square,
} from ".";
import { Board, InitialPositionType } from "./board";
import { Hand, ImmutableHand } from "./hand";
import { Piece, PieceType } from "./piece";
import {
  ImmutableRecord,
  ImmutableRecordMetadata,
  SpecialMove,
} from "./record";

const metadataKeyMap: { [key: string]: RecordMetadataKey | undefined } = {
  先手: RecordMetadataKey.BLACK_NAME,
  後手: RecordMetadataKey.WHITE_NAME,
  開始日時: RecordMetadataKey.START_DATETIME,
  終了日時: RecordMetadataKey.END_DATETIME,
  対局日: RecordMetadataKey.DATE,
  棋戦: RecordMetadataKey.TOURNAMENT,
  戦型: RecordMetadataKey.STRATEGY,
  表題: RecordMetadataKey.TITLE,
  持ち時間: RecordMetadataKey.TIME_LIMIT,
  消費時間: RecordMetadataKey.TIME_SPENT,
  場所: RecordMetadataKey.PLACE,
  掲載: RecordMetadataKey.POSTED_ON,
  備考: RecordMetadataKey.NOTE,
  先手省略名: RecordMetadataKey.BLACK_SHORT_NAME,
  後手省略名: RecordMetadataKey.WHITE_SHORT_NAME,
  作品番号: RecordMetadataKey.OPUS_NO,
  作品名: RecordMetadataKey.OPUS_NAME,
  作者: RecordMetadataKey.AUTHOR,
  発表誌: RecordMetadataKey.PUBLISHED_ON,
  発表年月: RecordMetadataKey.PUBLISHED_AT,
  出典: RecordMetadataKey.SOURCE,
  手数: RecordMetadataKey.LENGTH,
  完全性: RecordMetadataKey.INTEGRITY,
  分類: RecordMetadataKey.CATEGORY,
  受賞: RecordMetadataKey.AWARD,
};

const metadataNameMap = {
  blackName: "先手",
  whiteName: "後手",
  startDatetime: "開始日時",
  endDatetime: "終了日時",
  date: "対局日",
  tournament: "棋戦",
  strategy: "戦型",
  title: "表題",
  timeLimit: "持ち時間",
  timeSpent: "消費時間",
  place: "場所",
  postedOn: "掲載",
  note: "備考",
  blackShortName: "先手省略名",
  whiteShortName: "後手省略名",
  opusNo: "作品番号",
  opusName: "作品名",
  author: "作者",
  publishedOn: "発表誌",
  publishedAt: "発表年月",
  source: "出典",
  length: "手数",
  integrity: "完全性",
  category: "分類",
  award: "受賞",
};

enum LineType {
  PROGRAM_COMMENT,
  METADATA,
  HANDICAP,
  BLACK_HAND,
  WHITE_HAND,
  BOARD,
  BLACK_TURN,
  WHITE_TURN,
  MOVE,
  COMMENT,
  UNKNOWN,
}

// & で始まる行はしおりを意味するらしいが用途がよくわらず実際の使用例を見たことがない。
const linePatterns = [
  {
    prefix: /^#/,
    type: LineType.PROGRAM_COMMENT,
    removePrefix: false,
    isPosition: false,
  },
  {
    prefix: /^手合割：/,
    type: LineType.HANDICAP,
    removePrefix: true,
    isPosition: true,
  },
  {
    prefix: /^先手の持駒：/,
    type: LineType.BLACK_HAND,
    removePrefix: true,
    isPosition: true,
  },
  {
    prefix: /^後手の持駒：/,
    type: LineType.WHITE_HAND,
    removePrefix: true,
    isPosition: true,
  },
  {
    prefix: /^\|/,
    type: LineType.BOARD,
    removePrefix: false,
    isPosition: true,
  },
  {
    prefix: /^先手番/,
    type: LineType.BLACK_TURN,
    removePrefix: false,
    isPosition: true,
  },
  {
    prefix: /^後手番/,
    type: LineType.WHITE_TURN,
    removePrefix: false,
    isPosition: true,
  },
  {
    prefix: /^ *[0-9]+ +/,
    type: LineType.MOVE,
    removePrefix: false,
    isPosition: false,
  },
  {
    prefix: /^\*/,
    type: LineType.COMMENT,
    removePrefix: true,
    isPosition: false,
  },
];

type Line = {
  type: LineType;
  data: string;
  isPosition: boolean;
  metadataKey: string;
};

function parseLine(line: string): Line {
  for (let i = 0; i < linePatterns.length; i++) {
    const pattern = linePatterns[i];
    const matched = line.match(pattern.prefix);
    if (matched) {
      const begin = pattern.removePrefix ? matched[0].length : 0;
      return {
        type: pattern.type,
        data: line.substring(begin),
        isPosition: pattern.isPosition,
        metadataKey: "",
      };
    }
  }
  const metadataPrefix = line.match(/^[^ ]+：/);
  if (metadataPrefix) {
    const prefix = metadataPrefix[0];
    return {
      type: LineType.METADATA,
      data: line.substring(prefix.length),
      isPosition: false,
      metadataKey: prefix.substring(0, prefix.length - 1),
    };
  }
  return {
    type: LineType.UNKNOWN,
    data: line,
    isPosition: false,
    metadataKey: "",
  };
}

function readHandicap(position: Position, data: string): Error | undefined {
  switch (data.trim()) {
    case "平手":
      position.reset(InitialPositionType.STANDARD);
      return;
    case "香落ち":
      position.reset(InitialPositionType.HANDICAP_LANCE);
      return;
    case "右香落ち":
      position.reset(InitialPositionType.HANDICAP_RIGHT_LANCE);
      return;
    case "角落ち":
      position.reset(InitialPositionType.HANDICAP_BISHOP);
      return;
    case "飛車落ち":
      position.reset(InitialPositionType.HANDICAP_ROOK);
      return;
    case "飛香落ち":
      position.reset(InitialPositionType.HANDICAP_ROOK_LANCE);
      return;
    case "二枚落ち":
      position.reset(InitialPositionType.HANDICAP_2PIECES);
      return;
    case "四枚落ち":
      position.reset(InitialPositionType.HANDICAP_4PIECES);
      return;
    case "六枚落ち":
      position.reset(InitialPositionType.HANDICAP_6PIECES);
      return;
    case "八枚落ち":
      position.reset(InitialPositionType.HANDICAP_8PIECES);
      return;
    case "その他":
      position.reset(InitialPositionType.EMPTY);
      return;
  }
  return new Error("不正なデータ:" + data);
}

const fileStringToNumber: { [file: string]: number } = {
  "１": 1,
  "２": 2,
  "３": 3,
  "４": 4,
  "５": 5,
  "６": 6,
  "７": 7,
  "８": 8,
  "９": 9,
};

const rankStringToNumber: { [rank: string]: number } = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const kansujiStringToNumber: { [kansuji: string]: number } = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  十三: 13,
  十四: 14,
  十五: 15,
  十六: 16,
  十七: 17,
  十八: 18,
};

const stringToNumber: { [number: string]: number } = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
};

const stringToPieceType: { [kanji: string]: PieceType } = {
  王: PieceType.KING,
  玉: PieceType.KING,
  飛: PieceType.ROOK,
  龍: PieceType.DRAGON,
  竜: PieceType.DRAGON,
  角: PieceType.BISHOP,
  馬: PieceType.HORSE,
  金: PieceType.GOLD,
  銀: PieceType.SILVER,
  成銀: PieceType.PROM_SILVER,
  全: PieceType.PROM_SILVER,
  桂: PieceType.KNIGHT,
  成桂: PieceType.PROM_KNIGHT,
  圭: PieceType.PROM_KNIGHT,
  香: PieceType.LANCE,
  成香: PieceType.PROM_LANCE,
  杏: PieceType.PROM_LANCE,
  歩: PieceType.PAWN,
  と: PieceType.PROM_PAWN,
};

const stringToSpecialMove: { [move: string]: SpecialMove } = {
  中断: SpecialMove.INTERRUPT,
  投了: SpecialMove.RESIGN,
  持将棋: SpecialMove.IMPASS,
  千日手: SpecialMove.REPETITION_DRAW,
  詰み: SpecialMove.MATE,
  切れ負け: SpecialMove.TIMEOUT,
  反則勝ち: SpecialMove.FOUL_WIN,
  反則負け: SpecialMove.FOUL_LOSE,
  入玉勝ち: SpecialMove.ENTERING_OF_KING,
  不戦勝: SpecialMove.WIN_BY_DEFAULT,
  不戦敗: SpecialMove.LOSS_BY_DEFAULT,
};

const moveRegExp =
  /^ *([0-9]+) +[▲△]?([１２３４５６７８９][一二三四五六七八九]|同\u3000*)(王|玉|飛|龍|竜|角|馬|金|銀|成銀|全|桂|成桂|圭|香|成香|杏|歩|と)\u3000*(成?)(打|\([1-9][1-9]\)) *(.*)$/;

const timeRegExp = /\( *([0-9]+):([0-9]+)\/[0-9: ]*\)/;

const specialMoveRegExp =
  /^ *([0-9]+) +(中断|投了|持将棋|千日手|詰み|切れ負け|反則勝ち|反則負け|入玉勝ち|不戦勝|不戦敗) *(.*)$/;

function readBoard(board: Board, data: string): Error | undefined {
  if (data.length < 21) {
    return new Error("不正な盤面:" + data);
  }
  const rankStr = data[20];
  const rank = rankStringToNumber[rankStr];
  if (!rank) {
    return new Error("不正な盤面:" + data);
  }
  for (let x = 0; x < 9; x += 1) {
    const file = 9 - x;
    const square = new Square(file, rank);
    const index = x * 2 + 1;
    const pieceStr = data[index + 1];
    const pieceType = stringToPieceType[pieceStr];
    if (!pieceType) {
      board.remove(square);
      continue;
    }
    const color = data[index] !== "v" ? Color.BLACK : Color.WHITE;
    board.set(square, new Piece(color, pieceType));
  }
}

function readHand(hand: Hand, data: string): Error | undefined {
  const sections = data.split(/[ 　]/);
  for (const section of sections) {
    if (!section || section === "なし") {
      continue;
    }
    const pieceStr = section[0];
    const numberStr = section.substring(1);
    const pieceType = stringToPieceType[pieceStr];
    const n = kansujiStringToNumber[numberStr] || 1;
    if (!pieceType) {
      return new Error("不正な持ち駒: " + section);
    }
    hand.add(pieceType, n);
  }
  return;
}

function readMoveTime(record: Record, data: string): void {
  const timeResult = timeRegExp.exec(data);
  if (timeResult) {
    const minutes = timeResult[1];
    const seconds = timeResult[2];
    const s = Number.parseInt(minutes) * 60 + Number.parseInt(seconds);
    record.current.setElapsedMs(s * 1e3);
  }
}

function readMove(record: Record, data: string): Error | undefined {
  let result = specialMoveRegExp.exec(data);
  if (result) {
    const num = Number(result[1]);
    const move = stringToSpecialMove[result[2]];
    const time = result[3];
    record.goto(num - 1);
    record.append(move, {
      ignoreValidation: true,
    });
    readMoveTime(record, time);
    return;
  }

  result = moveRegExp.exec(data);
  if (!result) {
    return new Error("不正な指し手形式:" + data);
  }
  const num = Number(result[1]);
  const toStr = result[2];
  const pieceTypeStr = result[3];
  const promStr = result[4];
  const fromStr = result[5];
  const time = result[6];

  if (num === 0) {
    return new Error("不正な手数:" + data);
  }
  record.goto(num - 1);
  let to: Square;
  let from: Square | PieceType;
  if (toStr.startsWith("同")) {
    if (!(record.current.move instanceof Move)) {
      return new Error("不明な移動先: " + data);
    }
    to = record.current.move.to;
  } else {
    const file = fileStringToNumber[toStr[0]];
    const rank = rankStringToNumber[toStr[1]];
    to = new Square(file, rank);
  }
  if (fromStr === "打") {
    from = stringToPieceType[pieceTypeStr];
  } else {
    const file = stringToNumber[fromStr[1]];
    const rank = stringToNumber[fromStr[2]];
    from = new Square(file, rank);
  }
  let move = record.position.createMove(from, to);
  if (!move) {
    return new Error("不正な指し手: " + data);
  }
  if (promStr === "成") {
    move = move.withPromote();
  }
  record.append(move, {
    ignoreValidation: true,
  });
  readMoveTime(record, time);
  return;
}

export function importKakinoki(data: string): Record | Error {
  const metadata = new RecordMetadata();
  const record = new Record();
  const lines = data.split(/\r?\n/);
  const position = new Position();
  let preMoveComment = "";
  let inMoveSection = false;
  for (const line of lines) {
    if (line === "") {
      continue;
    }
    const parsed = parseLine(line);
    if (inMoveSection && parsed.isPosition) {
      return new Error("不正なデータ: " + line);
    }
    let e: Error | undefined;
    switch (parsed.type) {
      case LineType.METADATA: {
        const standardKey = metadataKeyMap[parsed.metadataKey];
        if (standardKey) {
          metadata.setStandardMetadata(standardKey, parsed.data);
        } else {
          metadata.setCustomMetadata(parsed.metadataKey, parsed.data);
        }
        break;
      }
      case LineType.HANDICAP:
        e = readHandicap(position, parsed.data);
        break;
      case LineType.BLACK_HAND:
        e = readHand(position.blackHand, parsed.data);
        break;
      case LineType.WHITE_HAND:
        e = readHand(position.whiteHand, parsed.data);
        break;
      case LineType.BOARD:
        e = readBoard(position.board, parsed.data);
        break;
      case LineType.BLACK_TURN:
        position.setColor(Color.BLACK);
        break;
      case LineType.WHITE_TURN:
        position.setColor(Color.WHITE);
        break;
      case LineType.MOVE:
        if (!inMoveSection) {
          record.clear(position);
          record.first.comment = preMoveComment;
          inMoveSection = true;
        }
        e = readMove(record, parsed.data);
        break;
      case LineType.COMMENT:
        if (inMoveSection) {
          record.current.comment = appendLine(
            record.current.comment,
            parsed.data
          );
        } else {
          preMoveComment = appendLine(preMoveComment, parsed.data);
        }
        break;
      case LineType.PROGRAM_COMMENT:
        break;
      case LineType.UNKNOWN:
        break;
    }
    if (e) {
      return e;
    }
  }
  if (!inMoveSection) {
    record.clear(position);
    record.first.comment = preMoveComment;
  }
  record.goto(0);
  record.resetAllBranchSelection();
  record.metadata = metadata;
  return record;
}

const kanjiNumberStrings = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
];
const fileStrings = ["１", "２", "３", "４", "５", "６", "７", "８", "９"];
const rankStrings = kanjiNumberStrings;

const pieceTypeToStringForMove = {
  king: "玉",
  rook: "飛",
  dragon: "龍",
  bishop: "角",
  horse: "馬",
  gold: "金",
  silver: "銀",
  promSilver: "成銀",
  knight: "桂",
  promKnight: "成桂",
  lance: "香",
  promLance: "成香",
  pawn: "歩",
  promPawn: "と",
};

const pieceTypeToStringForBoard = {
  king: "玉",
  rook: "飛",
  dragon: "龍",
  bishop: "角",
  horse: "馬",
  gold: "金",
  silver: "銀",
  promSilver: "全",
  knight: "桂",
  promKnight: "圭",
  lance: "香",
  promLance: "杏",
  pawn: "歩",
  promPawn: "と",
};

const specialMoveToString = {
  start: "",
  resign: "投了",
  interrupt: "中断",
  impass: "持将棋",
  draw: "持将棋",
  repetitionDraw: "千日手",
  mate: "詰み",
  timeout: "切れ負け",
  foulWin: "反則勝ち",
  foulLose: "反則負け",
  enteringOfKing: "入玉勝ち",
  winByDefault: "不戦勝",
  lossByDefault: "不戦敗",
};

type KakinokiExportOptions = {
  returnCode?: string;
};

function formatMetadata(
  metadata: ImmutableRecordMetadata,
  options: KakinokiExportOptions
): string {
  let ret = "";
  const returnCode = options.returnCode ? options.returnCode : "\n";
  for (const key of metadata.standardMetadataKeys) {
    ret +=
      metadataNameMap[key] +
      "：" +
      metadata.getStandardMetadata(key) +
      returnCode;
  }
  for (const key of metadata.customMetadataKeys) {
    ret += key + "：" + metadata.getCustomMetadata(key) + returnCode;
  }
  return ret;
}

function formatPosition(
  position: ImmutablePosition,
  options: KakinokiExportOptions
): string {
  let ret = "";
  const returnCode = options.returnCode ? options.returnCode : "\n";
  ret += "後手の持駒：" + formatHand(position.whiteHand) + returnCode;
  ret += "  ９ ８ ７ ６ ５ ４ ３ ２ １" + returnCode;
  ret += "+---------------------------+" + returnCode;
  for (let y = 0; y < 9; y++) {
    ret += "|";
    for (let x = 0; x < 9; x++) {
      const square = Square.newByXY(x, y);
      const piece = position.board.at(square);
      if (!piece) {
        ret += " ・";
      } else if (piece.color === Color.BLACK) {
        ret += " " + pieceTypeToStringForBoard[piece.type];
      } else {
        ret += "v" + pieceTypeToStringForBoard[piece.type];
      }
    }
    ret += "|" + rankStrings[y] + returnCode;
  }
  ret += "+---------------------------+" + returnCode;
  ret += "先手の持駒：" + formatHand(position.blackHand) + returnCode;
  if (position.color === Color.BLACK) {
    ret += "先手番" + returnCode;
  } else {
    ret += "後手番" + returnCode;
  }
  return ret;
}

function formatMove(move: Move): string {
  let ret = "";
  ret += fileStrings[move.to.file - 1];
  ret += rankStrings[move.to.rank - 1];
  ret += pieceTypeToStringForMove[move.pieceType];
  if (move.promote) {
    ret += "成";
  }
  if (move.from instanceof Square) {
    ret += "(" + move.from.file + move.from.rank + ")";
  } else {
    ret += "打";
  }
  return ret;
}

function formatHand(hand: ImmutableHand): string {
  let ret = "";
  hand.forEach((pieceType, n) => {
    if (n >= 1) {
      ret += pieceTypeToStringForBoard[pieceType];
      if (n >= 2) {
        ret += kanjiNumberStrings[n - 1];
      }
      ret += "　";
    }
  });
  return ret;
}

export function exportKakinoki(
  record: ImmutableRecord,
  options: KakinokiExportOptions
): string {
  let ret = "";
  const returnCode = options.returnCode ? options.returnCode : "\n";
  ret += "# KIF形式棋譜ファイル Generated by Electron Shogi" + returnCode;
  ret += formatMetadata(record.metadata, options);
  ret += formatPosition(record.initialPosition, options);
  ret += "手数----指手---------消費時間--" + returnCode;
  record.forEach((node) => {
    if (node.number !== 0) {
      if (!node.isFirstBranch) {
        ret += returnCode;
        ret += "変化：" + node.number + "手" + returnCode;
      }
      ret += node.number + " ";
      if (node.move instanceof Move) {
        ret += formatMove(node.move);
      } else {
        ret += specialMoveToString[node.move];
      }
      const elapsed = millisecondsToMSS(node.elapsedMs);
      const totalElapsed = millisecondsToHMMSS(node.totalElapsedMs);
      ret += ` (${elapsed}/${totalElapsed})`;
      if (node.isFirstBranch && node.hasBranch) {
        ret += "+";
      }
      ret += returnCode;
    }
    if (node.comment.length !== 0) {
      ret += "*" + node.comment.replaceAll("\n", returnCode + "*") + returnCode;
    }
  });
  return ret;
}
