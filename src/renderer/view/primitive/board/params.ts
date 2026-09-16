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
  // 段・筋の番号の配置に使用する余白。(マス目と駒の縦横比が異なるレイアウトでは駒の余白と一致しない。)
  leftLabelPadding: 16.0,
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

// ポートレイト(正方形マス)レイアウト用のパラメーター。
// マス目の縦幅を基準に X 方向のみを引き伸ばすことで、Y 座標の計算を変えずにマス目を正方形にする。
// (駒台の縦幅と盤の縦幅の対応関係を維持したまま、同じ横幅に対する表示倍率を下げて縦幅の消費を減らす。)
export const portraitSquareScaleX = boardParams.squareHeight / boardParams.squareWidth;

const stretchX = (value: number) => value * portraitSquareScaleX;

// 駒画像は縦横比を維持するため引き伸ばさず、広がったマス目の中央に配置する。
const centeredPiecePadding = (squareWidth: number) => (squareWidth - commonParams.piece.width) / 2;

export const portraitSquareBoardParams = {
  ...boardParams,
  width: stretchX(boardParams.width),
  squareWidth: stretchX(boardParams.squareWidth), // === boardParams.squareHeight
  leftSquarePadding: stretchX(boardParams.leftSquarePadding),
  leftPiecePadding:
    stretchX(boardParams.leftSquarePadding) +
    centeredPiecePadding(stretchX(boardParams.squareWidth)),
  leftLabelPadding: stretchX(boardParams.leftLabelPadding),
};

export const portraitSquareHandParams = {
  ...portraitHandParams,
  width: stretchX(portraitHandParams.width),
  squareWidth: stretchX(portraitHandParams.squareWidth),
  leftPiecePadding: centeredPiecePadding(stretchX(portraitHandParams.squareWidth)),
};

export const portraitSquareViewParams = {
  frame: {
    width: stretchX(portraitViewParams.frame.width),
    height: portraitViewParams.frame.height,
  },
  board: {
    x: stretchX(portraitViewParams.board.x),
    y: portraitViewParams.board.y,
  },
  hand: {
    black: {
      x: stretchX(portraitViewParams.hand.black.x),
      y: portraitViewParams.hand.black.y,
    },
    white: {
      x: stretchX(portraitViewParams.hand.white.x),
      y: portraitViewParams.hand.white.y,
    },
  },
  turn: {
    black: {
      x: stretchX(portraitViewParams.turn.black.x),
      y: portraitViewParams.turn.black.y,
    },
    white: {
      x: stretchX(portraitViewParams.turn.white.x),
      y: portraitViewParams.turn.white.y,
    },
    width: stretchX(portraitViewParams.turn.width),
    height: portraitViewParams.turn.height,
    fontSize: portraitViewParams.turn.fontSize,
  },
  playerName: {
    black: {
      x: stretchX(portraitViewParams.playerName.black.x),
      y: portraitViewParams.playerName.black.y,
    },
    white: {
      x: stretchX(portraitViewParams.playerName.white.x),
      y: portraitViewParams.playerName.white.y,
    },
    width: stretchX(portraitViewParams.playerName.width),
    height: portraitViewParams.playerName.height,
    fontSize: portraitViewParams.playerName.fontSize,
  },
  clock: {
    black: {
      x: stretchX(portraitViewParams.clock.black.x),
      y: portraitViewParams.clock.black.y,
    },
    white: {
      x: stretchX(portraitViewParams.clock.white.x),
      y: portraitViewParams.clock.white.y,
    },
    width: stretchX(portraitViewParams.clock.width),
    height: portraitViewParams.clock.height,
    fontSize: portraitViewParams.clock.fontSize,
  },
};

export type BoardParams = typeof boardParams;
export type PortraitHandParams = typeof portraitHandParams;
export type PortraitViewParams = typeof portraitViewParams;
