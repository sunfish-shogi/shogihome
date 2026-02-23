<template>
  <div>
    <div class="frame" :style="layout.frameStyle">
      <div v-if="header" class="header" :class="layout.typefaceClass" :style="layout.headerStyle">
        {{ header }}
      </div>
      <div v-if="footer" class="footer" :class="layout.typefaceClass" :style="layout.footerStyle">
        {{ footer }}
      </div>
      <svg style="top: 0; left: 0" :width="layout.svgSize" :height="layout.svgSize">
        <image
          href="/board/grid_square.svg"
          :x="layout.boardImage.x"
          :y="layout.boardImage.y"
          :width="layout.boardImage.width"
          :height="layout.boardImage.height"
        />
        <rect
          v-if="layout.lastMoveRect"
          :x="layout.lastMoveRect.x"
          :y="layout.lastMoveRect.y"
          :width="layout.lastMoveRect.width"
          :height="layout.lastMoveRect.height"
          fill="gold"
        />
        <text
          v-for="(file, index) of layout.files"
          :key="index"
          :x="file.x"
          :y="file.y"
          :font-size="file.fontSize"
          :class="layout.typefaceClass"
          dominant-baseline="central"
          text-anchor="middle"
        >
          {{ file.character }}
        </text>
        <text
          v-for="(rank, index) of layout.ranks"
          :key="index"
          :x="rank.x"
          :y="rank.y"
          :font-size="rank.fontSize"
          :class="layout.typefaceClass"
          dominant-baseline="central"
          text-anchor="middle"
        >
          {{ rank.character }}
        </text>
        <text
          v-for="piece of layout.boardPieces"
          :key="piece.id"
          :x="piece.x"
          :y="piece.y"
          :font-size="piece.fontSize"
          :transform="piece.transform"
          :class="layout.typefaceClass"
          dominant-baseline="central"
          text-anchor="middle"
        >
          {{ piece.character }}
        </text>
      </svg>
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
  fontScale: {
    type: Number,
    required: false,
    default: 1.0,
  },
});

const layout = computed(() => {
  const size = Math.min(props.maxSize.width, props.maxSize.height);
  const param = buildParams(size);
  return {
    svgSize: size,
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
    boardImage: {
      x: param.boardLeft - param.boardBorderSize,
      y: param.boardTop - param.boardBorderSize,
      width: param.boardSize + param.boardBorderSize * 2,
      height: param.boardSize + param.boardBorderSize * 2,
    },
    files: fileNumbers.map((character, index) => {
      return {
        x: param.boardLeft + param.pieceSize * (8 - index) + param.pieceSize / 2,
        y: param.boardTop - param.labelSize / 2,
        fontSize: param.labelFontSize * props.fontScale,
        character,
      };
    }),
    ranks: rankNumbers.map((character, index) => {
      return {
        x: param.boardLeft + param.boardSize + param.labelSize / 2,
        y: param.boardTop + param.pieceSize * index + param.pieceSize / 2,
        fontSize: param.labelFontSize * props.fontScale,
        character,
      };
    }),
    lastMoveRect: (function () {
      if (!props.lastMove) {
        return null;
      }
      const square = props.lastMove.to;
      return {
        x: param.boardLeft + (param.boardSize * square.x) / 9,
        y: param.boardTop + (param.boardSize * square.y) / 9,
        width: param.pieceSize,
        height: param.pieceSize,
      };
    })(),
    boardPieces: props.position.board.listNonEmptySquares().map((square) => {
      const piece = props.position.board.at(square) as Piece;
      const cx = param.boardLeft + (param.boardSize * square.x) / 9 + param.pieceSize / 2;
      const cy = param.boardTop + (param.boardSize * square.y) / 9 + param.pieceSize / 2;
      return {
        id: `${square.x},${square.y}`,
        x: cx,
        y: cy,
        fontSize: (param.boardSize * props.fontScale) / 11,
        transform: piece.color === Color.WHITE ? `rotate(180, ${cx}, ${cy})` : undefined,
        character: pieceTypeToStringForBoard(piece.type),
      };
    }),
    blackHand: (function () {
      const text = buildHandText(props.blackName, props.position.blackHand);
      const fontSize = Math.min((param.boardSize / text.length) * 0.9, param.maxHandFontSize);
      return {
        text,
        style: {
          left: `${param.blackHandLeft}px`,
          top: `${param.blackHandTop}px`,
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
          top: `${param.whiteHandTop}px`,
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
