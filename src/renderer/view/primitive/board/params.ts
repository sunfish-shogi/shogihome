export const commonParams = {
  piece: {
    width: 88,
    height: 93,
  },
};

export const boardParams = {
  width: 878,
  height: 960,
  squareWidth: 94.85,
  squareHeight: 104,
  leftSquarePadding: 12.6,
  topSquarePadding: 12.8,
  leftPiecePadding: 16.0,
  topPiecePadding: 18.5,
  highlight: {
    selected: { "background-color": "#0088ff", opacity: "0.8" },
    lastMoveTo: { "background-color": "#44cc44", opacity: "0.8" },
    lastMoveFrom: { "background-color": "#44cc44", opacity: "0.4" },
  },
  label: {
    fontSize: 24,
  },
};

export const handParams = {
  width: 288,
  height: 360,
  highlight: {
    selected: { "background-color": "#ff4800", opacity: "0.7" },
  },
  // 飛角・金銀・桂香のペアは HandPieceOrder.STRONGER_TO_LEFT の配置で定義し、
  // STRONGER_TO_RIGHT の場合は HandLayoutBuilder 側で列を反転する。
  black: {
    pawn: { row: 3, column: 0, width: 2 },
    lance: { row: 2, column: 1, width: 1 },
    knight: { row: 2, column: 0, width: 1 },
    silver: { row: 1, column: 1, width: 1 },
    gold: { row: 1, column: 0, width: 1 },
    bishop: { row: 0, column: 1, width: 1 },
    rook: { row: 0, column: 0, width: 1 },
    king: { row: 0, column: 0, width: 0 },
    promPawn: { row: 0, column: 0, width: 0 },
    promLance: { row: 0, column: 0, width: 0 },
    promKnight: { row: 0, column: 0, width: 0 },
    promSilver: { row: 0, column: 0, width: 0 },
    horse: { row: 0, column: 0, width: 0 },
    dragon: { row: 0, column: 0, width: 0 },
  },
  white: {
    pawn: { row: 0, column: 0, width: 2 },
    lance: { row: 1, column: 0, width: 1 },
    knight: { row: 1, column: 1, width: 1 },
    silver: { row: 2, column: 0, width: 1 },
    gold: { row: 2, column: 1, width: 1 },
    bishop: { row: 3, column: 0, width: 1 },
    rook: { row: 3, column: 1, width: 1 },
    king: { row: 0, column: 0, width: 0 },
    promPawn: { row: 0, column: 0, width: 0 },
    promLance: { row: 0, column: 0, width: 0 },
    promKnight: { row: 0, column: 0, width: 0 },
    promSilver: { row: 0, column: 0, width: 0 },
    horse: { row: 0, column: 0, width: 0 },
    dragon: { row: 0, column: 0, width: 0 },
  },
};

export const standardViewParams = {
  frame: {
    width: 1471,
    height: 959,
  },
  board: {
    x: 296.5,
    y: 0,
  },
  hand: {
    black: {
      x: 1184,
      y: 600,
    },
    white: {
      x: 0,
      y: 0,
    },
  },
  turn: {
    black: {
      x: 1184,
      y: 425,
      y2: 490,
    },
    white: {
      x: 0,
      y: 495,
      y2: 430,
    },
    width: 288,
    height: 45,
    fontSize: 32,
  },
  playerName: {
    black: {
      x: 1184,
      y: 480,
      y2: 545,
    },
    white: {
      x: 0,
      y: 370,
      y2: 370,
    },
    width: 288,
    height: 45,
    fontSize: 25,
  },
  clock: {
    black: {
      x: 1184,
      y: 535,
    },
    white: {
      x: 0,
      y: 425,
    },
    width: 288,
    height: 55,
    fontSize: 40,
  },
  control: {
    left: {
      x: 0,
      y: 547,
      width: 288,
      height: 412,
      fontSize: 32,
    },
    right: {
      x: 1184,
      y: 0,
      width: 288,
      height: 412,
      fontSize: 32,
    },
  },
};

export const compactHandParams = {
  width: 95,
  height: 728,
  highlight: {
    selected: { "background-color": "#ff4800", opacity: "0.7" },
  },
  squareWidth: 95,
  squareHeight: 104,
  leftPiecePadding: 3.4,
  topPiecePadding: 5.7,
};

export const compactViewParams = {
  frame: {
    width: 1088,
    height: 1015,
  },
  board: {
    x: 105,
    y: 56,
  },
  hand: {
    black: {
      x: 993,
      y: 287,
    },
    white: {
      x: 0,
      y: 56,
    },
  },
  turn: {
    black: {
      x: 575,
      y: 3,
    },
    white: {
      x: 304,
      y: 3,
    },
    width: 214,
    height: 50,
    fontSize: 30,
  },
  playerName: {
    black: {
      x: 788,
      y: 0,
    },
    white: {
      x: 0,
      y: 0,
    },
    width: 300,
    height: 52,
    fontSize: 25,
  },
  clock: {
    black: {
      x: 575,
      y: 0,
    },
    white: {
      x: 300,
      y: 0,
    },
    width: 214,
    height: 52,
    fontSize: 30,
  },
};

export const portraitHandParams = {
  width: 664,
  height: 104,
  highlight: {
    selected: { "background-color": "#ff4800", opacity: "0.7" },
  },
  squareWidth: 94.85,
  squareHeight: 104,
  leftPiecePadding: 3.4,
  topPiecePadding: 5.7,
};

export const portraitViewParams = {
  frame: {
    width: 878,
    height: 1168,
  },
  board: {
    x: 0,
    y: 104,
  },
  hand: {
    black: {
      x: 0,
      y: 1064,
    },
    white: {
      x: 214,
      y: 0,
    },
  },
  turn: {
    black: {
      x: 664,
      y: 1068,
    },
    white: {
      x: 0,
      y: 54,
    },
    width: 214,
    height: 50,
    fontSize: 30,
  },
  playerName: {
    black: {
      x: 664,
      y: 1116,
    },
    white: {
      x: 0,
      y: 0,
    },
    width: 214,
    height: 52,
    fontSize: 25,
  },
  clock: {
    black: {
      x: 664,
      y: 1064,
    },
    white: {
      x: 0,
      y: 50,
    },
    width: 214,
    height: 52,
    fontSize: 30,
  },
};
