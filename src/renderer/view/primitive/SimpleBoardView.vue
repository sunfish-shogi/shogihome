<template>
  <div>
    <div class="frame" :style="layout.frameStyle">
      <div v-if="header" class="header" :class="layout.typefaceClass" :style="layout.headerStyle">
        {{ header }}
      </div>
      <div v-if="footer" class="footer" :class="layout.typefaceClass" :style="layout.footerStyle">
        {{ footer }}
      </div>
      <div v-if="layout.lastMoveStyle" :style="layout.lastMoveStyle"></div>
      <div class="board-grid" :style="layout.boardStyle">
        <img src="/board/grid_square.svg" :style="layout.boardImageStyle" />
      </div>
      <div v-for="(file, index) of layout.files" :key="index" :style="file.style">
        <span class="file-label" :class="layout.typefaceClass" :style="layout.fileCharacterStyle">{{
          file.character
        }}</span>
      </div>
      <div v-for="(rank, index) of layout.ranks" :key="index" :style="rank.style">
        <span class="rank-label" :class="layout.typefaceClass" :style="layout.rankCharacterStyle">{{
          rank.character
        }}</span>
      </div>
      <div v-for="piece of layout.boardPieces" :key="piece.id" :style="piece.style">
        <span class="cell" :class="layout.typefaceClass" :style="piece.characterStyle">{{
          piece.character
        }}</span>
      </div>
      <div class="column reverse" :style="layout.blackHand.style">
        <span class="hand black" :class="layout.typefaceClass">☗{{ layout.blackHand.text }}</span>
      </div>
      <div v-if="!hideWhiteHand" class="column reverse" :style="layout.whiteHand.style">
        <span class="hand white" :class="layout.typefaceClass">☖{{ layout.whiteHand.text }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  Move,
  ImmutablePosition,
  Piece,
  pieceTypeToStringForBoard,
  numberToKanji,
  ImmutableHand,
  Color,
} from "tsshogi";
import { computed, PropType } from "vue";
import { RectSize } from "@/common/assets/geometry";

const fileNumbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const rankNumbers = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

function buildHandText(name: string, hand: ImmutableHand) {
  const pieces =
    hand.counts
      .map((entry) => {
        if (entry.count === 0) {
          return "";
        } else if (entry.count === 1) {
          return pieceTypeToStringForBoard(entry.type);
        }
        return pieceTypeToStringForBoard(entry.type) + numberToKanji(entry.count);
      })
      .join("") || "なし";
  return (name ? name + " " : "") + pieces;
}
</script>

<script setup lang="ts">
function buildParams(size: number) {
  return {
    size: size,
    headerX: size * 0.5,
    headerY: size * 0.01,
    footerX: size * 0.01,
    footerY: size * 0.83,
    boardLeft: size * 0.15,
    boardTop: size * 0.12,
    boardSize: size * 0.7,
    boardLineHeight: size * 0.088,
    boardBorderSize: size * 0.004,
    labelSize: size * 0.05,
    labelFontSize: size * 0.03,
    pieceSize: (size * 0.7) / 9,
    fontSize: size * 0.038,
    maxHandFontSize: size * 0.048,
    blackHandLeft: size * 0.9,
    blackHandTop: size * 0.12,
    whiteHandLeft: size * (0.1 - 0.042),
    whiteHandTop: size * 0.12,
  };
}

const props = defineProps({
  maxSize: {
    type: RectSize,
    required: true,
  },
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  blackName: {
    type: String,
    required: false,
    default: null,
  },
  whiteName: {
    type: String,
    required: false,
    default: null,
  },
  hideWhiteHand: {
    type: Boolean,
    required: false,
    default: false,
  },
  header: {
    type: String,
    required: false,
    default: null,
  },
  footer: {
    type: String,
    required: false,
    default: null,
  },
  lastMove: {
    type: Object as PropType<Move | null>,
    required: false,
    default: null,
  },
  typeface: {
    type: String as PropType<"gothic" | "mincho">,
    required: false,
    default: "mincho",
  },
  fontWeight: {
    type: Number as PropType<number>,
    required: false,
    default: 1,
  },
  textShadow: {
    type: Boolean,
    required: false,
    default: false,
  },
  characterY: {
    type: Number,
    required: false,
    default: 0,
  },
  fontScale: {
    type: Number,
    required: false,
    default: 1.0,
  },
});

const layout = computed(() => {
  const size = Math.min(props.maxSize.width, props.maxSize.height);
  const param = buildParams(size);
  const charY = size * 0.002 * props.characterY;
  return {
    typefaceClass: [
      props.typeface,
      `weight-${props.fontWeight}`,
      props.textShadow ? "shadow" : "no-shadow",
    ],
    frameStyle: {
      width: `${param.size}px`,
      height: `${param.size}px`,
    },
    headerStyle: {
      transform: "translate(-50%, 0%)",
      left: `${param.headerX}px`,
      top: `${param.headerY}px`,
      fontSize: `${param.fontSize * props.fontScale}px`,
    },
    footerStyle: {
      left: `${param.footerX}px`,
      top: `${param.footerY}px`,
      fontSize: `${param.fontSize * props.fontScale}px`,
    },
    boardStyle: {
      left: `${param.boardLeft - param.boardBorderSize}px`,
      top: `${param.boardTop - param.boardBorderSize}px`,
    },
    boardImageStyle: {
      width: `${param.boardSize + param.boardBorderSize * 2}px`,
      height: `${param.boardSize + param.boardBorderSize * 2}px`,
    },
    files: fileNumbers.map((character, index) => {
      return {
        style: {
          left: `${param.boardLeft + param.pieceSize * (8 - index)}px`,
          top: `${param.boardTop - param.labelSize - charY}px`,
          width: `${param.pieceSize}px`,
          height: `${param.labelSize}px`,
          fontSize: `${param.labelFontSize * props.fontScale}px`,
        },
        character,
      };
    }),
    fileCharacterStyle: {
      lineHeight: `${param.labelSize}px`,
    },
    ranks: rankNumbers.map((character, index) => {
      return {
        style: {
          left: `${param.boardLeft + param.boardSize}px`,
          top: `${param.boardTop + param.pieceSize * index - charY}px`,
          width: `${param.labelSize}px`,
          height: `${param.pieceSize}px`,
          fontSize: `${param.labelFontSize * props.fontScale}px`,
        },
        character,
      };
    }),
    rankCharacterStyle: {
      lineHeight: `${param.pieceSize}px`,
    },
    lastMoveStyle: (function () {
      if (!props.lastMove) {
        return null;
      }
      const square = props.lastMove.to;
      return {
        backgroundColor: "gold",
        left: `${param.boardLeft + (param.boardSize * square.x) / 9}px`,
        top: `${param.boardTop + (param.boardSize * square.y) / 9}px`,
        width: `${param.pieceSize}px`,
        height: `${param.pieceSize}px`,
      };
    })(),
    boardPieces: props.position.board.listNonEmptySquares().map((square) => {
      const piece = props.position.board.at(square) as Piece;
      return {
        id: `${square.x},${square.y}`,
        style: {
          left: `${param.boardLeft + (param.boardSize * square.x) / 9}px`,
          top: `${
            param.boardTop +
            (param.boardSize * square.y) / 9 -
            (piece.color === Color.BLACK ? charY : -charY)
          }px`,
          width: `${param.boardSize / 9}px`,
          height: `${param.boardSize / 9}px`,
          transform: piece.color === Color.WHITE ? "rotate(180deg)" : undefined,
          fontSize: `${(param.boardSize * props.fontScale) / 11}px`,
        },
        character: pieceTypeToStringForBoard(piece.type),
        characterStyle: {
          lineHeight: `${param.boardLineHeight}px`,
        },
      };
    }),
    blackHand: (function () {
      const text = buildHandText(props.blackName, props.position.blackHand);
      const fontSize = Math.min((param.boardSize / text.length) * 0.9, param.maxHandFontSize);
      return {
        text,
        style: {
          left: `${param.blackHandLeft}px`,
          top: `${param.blackHandTop - charY}px`,
          height: `${param.boardSize}px`,
          fontSize: `${fontSize * props.fontScale}px`,
        },
      };
    })(),
    whiteHand: (function () {
      const text = buildHandText(props.whiteName, props.position.whiteHand);
      const fontSize = Math.min((param.boardSize / text.length) * 0.9, param.maxHandFontSize);
      return {
        text,
        style: {
          left: `${param.whiteHandLeft}px`,
          top: `${param.whiteHandTop + charY}px`,
          height: `${param.boardSize}px`,
          fontSize: `${fontSize * props.fontScale}px`,
          transform: "rotate(180deg)",
        },
      };
    })(),
  };
});
</script>

<style scoped>
.weight-400 {
  font-weight: 400;
}
.weight-700 {
  font-weight: 700;
}
.shadow {
  text-shadow: 0px 0px 0.5px black;
}
.frame {
  color: black;
  background-color: white;
  user-select: none;
  position: relative;
  overflow: hidden;
}
.frame > * {
  position: absolute;
}
.header {
  white-space: nowrap;
}
.footer {
  white-space: pre-wrap;
  text-align: left;
}
.file-label {
  display: inline-block;
  width: 100%;
  height: 100%;
  text-align: center;
  vertical-align: middle;
}
.rank-label {
  display: inline-block;
  width: 100%;
  height: 100%;
  text-align: center;
  vertical-align: baseline;
}
.cell {
  display: inline-block;
  width: 100%;
  height: 100%;
  text-align: center;
  vertical-align: text-bottom;
}
.hand {
  display: inline-block;
  text-orientation: upright;
  letter-spacing: 0px;
}
.hand.black {
  writing-mode: vertical-lr;
}
.hand.white {
  writing-mode: vertical-rl;
}
</style>
