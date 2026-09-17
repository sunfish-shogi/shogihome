import { Config } from "./config.js";
import { Color, ImmutablePosition, reverseColor } from "tsshogi";
import { Frame, Layout, PlayerName, Turn } from "./layout.js";
import { PortraitViewParams, portraitViewParams } from "./params.js";
import { Point, RectSize } from "@/common/assets/geometry.js";

export class PortraitLayoutBuilder {
  constructor(
    private config: Config,
    private params: PortraitViewParams = portraitViewParams,
  ) {}

  get ratio(): number {
    let ratio = this.config.upperSizeLimit.width / this.params.frame.width;
    if (this.params.frame.height * ratio > this.config.upperSizeLimit.height) {
      ratio = this.config.upperSizeLimit.height / this.params.frame.height;
    }
    return ratio;
  }

  get boardBasePoint(): Point {
    return new Point(this.params.board.x, this.params.board.y).multiply(this.ratio);
  }

  get blackHandBasePoint(): Point {
    const params = this.config.flip ? this.params.hand.white : this.params.hand.black;
    return new Point(params.x, params.y).multiply(this.ratio);
  }

  get whiteHandBasePoint(): Point {
    const params = this.config.flip ? this.params.hand.black : this.params.hand.white;
    return new Point(params.x, params.y).multiply(this.ratio);
  }

  build(position: ImmutablePosition): Layout {
    const ratio = this.ratio;

    const buildFrameLayout = (): Frame => {
      const height = this.params.frame.height * ratio;
      const width = this.params.frame.width * ratio;
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
      const params = this.params.turn[displayColor];
      return {
        style: {
          left: params.x * ratio - borderWidth + "px",
          top: params.y * ratio - borderWidth + "px",
          width: this.params.turn.width * ratio - borderWidth + "px",
          height: this.params.turn.height * ratio - borderWidth + "px",
          "font-size": this.params.turn.fontSize * ratio + "px",
          "border-radius": this.params.turn.height * ratio * 0.4 + "px",
          "border-width": borderWidth + "px",
          "border-style": "solid",
        },
      };
    };

    const buildPlayerNameLayout = (color: Color): PlayerName => {
      const displayColor = this.config.flip ? reverseColor(color) : color;
      const params = this.params.playerName[displayColor];
      return {
        style: {
          left: params.x * ratio + "px",
          top: params.y * ratio + "px",
          width: this.params.playerName.width * ratio + "px",
          height: this.params.playerName.height * ratio + "px",
          "font-size": this.params.playerName.fontSize * ratio + "px",
        },
      };
    };

    const buildClockLayout = (color: Color): PlayerName => {
      const displayColor = this.config.flip ? reverseColor(color) : color;
      const params = this.params.clock[displayColor];
      return {
        style: {
          left: params.x * ratio + "px",
          top: params.y * ratio + "px",
          width: this.params.clock.width * ratio + "px",
          height: this.params.clock.height * ratio + "px",
          "font-size": this.params.clock.fontSize * ratio + "px",
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
