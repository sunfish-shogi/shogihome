import { Config } from "./config.js";
import { Color, ImmutablePosition, reverseColor } from "tsshogi";
import { Frame, Layout, PlayerName, Turn } from "./layout.js";
import { compactViewParams } from "./params.js";
import { Point, RectSize } from "@/common/assets/geometry.js";

export class CompactLayoutBuilder {
  constructor(private config: Config) {}

  get ratio(): number {
    let ratio = this.config.upperSizeLimit.width / compactViewParams.frame.width;
    if (compactViewParams.frame.height * ratio > this.config.upperSizeLimit.height) {
      ratio = this.config.upperSizeLimit.height / compactViewParams.frame.height;
    }
    return ratio;
  }

  get boardBasePoint(): Point {
    return new Point(compactViewParams.board.x, compactViewParams.board.y).multiply(this.ratio);
  }

  get blackHandBasePoint(): Point {
    const params = this.config.flip ? compactViewParams.hand.white : compactViewParams.hand.black;
    return new Point(params.x, params.y).multiply(this.ratio);
  }

  get whiteHandBasePoint(): Point {
    const params = this.config.flip ? compactViewParams.hand.black : compactViewParams.hand.white;
    return new Point(params.x, params.y).multiply(this.ratio);
  }

  build(position: ImmutablePosition): Layout {
    const ratio = this.ratio;

    const buildFrameLayout = (): Frame => {
      const height = compactViewParams.frame.height * ratio;
      const width = compactViewParams.frame.width * ratio;
      return {
        style: {
          height: height + "px",
          width: width + "px",
        },
        size: new RectSize(width, height),
      };
    };

    const buildTurnLayout = (): Turn => {
      const color = position.color;
      const displayColor = this.config.flip ? reverseColor(color) : color;
      const borderWidth = 2;
      const params = compactViewParams.turn[displayColor];
      return {
        style: {
          left: params.x * ratio - borderWidth + "px",
          top: params.y * ratio - borderWidth + "px",
          width: compactViewParams.turn.width * ratio - borderWidth + "px",
          height: compactViewParams.turn.height * ratio - borderWidth + "px",
          "font-size": compactViewParams.turn.fontSize * ratio + "px",
          "border-radius": compactViewParams.turn.height * ratio * 0.4 + "px",
          "border-width": borderWidth + "px",
          "border-style": "solid",
        },
      };
    };

    const buildPlayerNameLayout = (color: Color): PlayerName => {
      const displayColor = this.config.flip ? reverseColor(color) : color;
      const params = compactViewParams.playerName[displayColor];
      return {
        style: {
          left: params.x * ratio + "px",
          top: params.y * ratio + "px",
          width: compactViewParams.playerName.width * ratio + "px",
          height: compactViewParams.playerName.height * ratio + "px",
          "font-size": compactViewParams.playerName.fontSize * ratio + "px",
        },
      };
    };

    const buildClockLayout = (color: Color): PlayerName => {
      const displayColor = this.config.flip ? reverseColor(color) : color;
      const params = compactViewParams.clock[displayColor];
      return {
        style: {
          left: params.x * ratio + "px",
          top: params.y * ratio + "px",
          width: compactViewParams.clock.width * ratio + "px",
          height: compactViewParams.clock.height * ratio + "px",
          "font-size": compactViewParams.clock.fontSize * ratio + "px",
        },
      };
    };

    const boardBasePoint = this.boardBasePoint;
    const blackHandBasePoint = this.blackHandBasePoint;
    const whiteHandBasePoint = this.whiteHandBasePoint;

    return {
      ratio,
      frame: buildFrameLayout(),
      boardStyle: {
        left: boardBasePoint.x + "px",
        top: boardBasePoint.y + "px",
      },
      blackHandStyle: {
        left: blackHandBasePoint.x + "px",
        top: blackHandBasePoint.y + "px",
      },
      whiteHandStyle: {
        left: whiteHandBasePoint.x + "px",
        top: whiteHandBasePoint.y + "px",
      },
      turn: this.config.hideClock ? buildTurnLayout() : undefined,
      blackPlayerName: buildPlayerNameLayout(Color.BLACK),
      whitePlayerName: buildPlayerNameLayout(Color.WHITE),
      blackClock: this.config.hideClock ? undefined : buildClockLayout(Color.BLACK),
      whiteClock: this.config.hideClock ? undefined : buildClockLayout(Color.WHITE),
    };
  }
}
