<template>
  <div>
    <div class="frame" :style="main.frame.style" @click="clickFrame()">
      <!-- 後手の駒台 -->
      <div class="hand" :class="flip ? 'front' : 'back'" :style="main.whiteHandStyle">
        <div
          class="hand-background"
          :class="{ 'drop-shadows': dropShadows }"
          :style="whiteHand.backgroundStyle"
        >
          <img v-if="whiteHand.textureImagePath" class="full" :src="whiteHand.textureImagePath" />
        </div>
        <div
          v-for="pointer in whiteHand.pointers"
          :key="pointer.id"
          :style="pointer.backgroundStyle"
        ></div>
        <div v-for="piece in whiteHand.pieces" :key="piece.id" :style="piece.style">
          <img class="piece-image" :src="piece.imagePath" />
        </div>
        <div v-for="number in whiteHand.numbers" :key="number.id" :style="number.style">
          {{ number.character }}
        </div>
      </div>

      <!-- 盤面 -->
      <div class="board" :style="main.boardStyle">
        <div v-if="board.background.textureImagePath" :style="board.background.style">
          <img class="full" :src="board.background.textureImagePath" />
        </div>
        <div
          class="board-background"
          :class="{ 'drop-shadows': dropShadows }"
          :style="board.background.style"
        >
          <BoardGrid class="full" :color="boardGridColor || board.background.gridColor" />
        </div>
        <div v-for="square in board.squares" :key="square.id" :style="square.backgroundStyle"></div>
        <div v-for="piece in board.pieces" :key="piece.id" :style="piece.style">
          <img class="piece-image" :src="piece.imagePath" />
        </div>
        <div v-for="label in board.labels" :key="label.id" :style="label.style">
          {{ label.character }}
        </div>
      </div>

      <!-- 先手の駒台 -->
      <div class="hand" :class="flip ? 'back' : 'front'" :style="main.blackHandStyle">
        <div
          class="hand-background"
          :class="{ 'drop-shadows': dropShadows }"
          :style="blackHand.backgroundStyle"
        >
          <img v-if="blackHand.textureImagePath" class="full" :src="blackHand.textureImagePath" />
        </div>
        <div
          v-for="pointer in blackHand.pointers"
          :key="pointer.id"
          :style="pointer.backgroundStyle"
        ></div>
        <div v-for="piece in blackHand.pieces" :key="piece.id" :style="piece.style">
          <img class="piece-image" :src="piece.imagePath" />
        </div>
        <div v-for="number in blackHand.numbers" :key="number.id" :style="number.style">
          {{ number.character }}
        </div>
      </div>

      <img
        v-for="arrow in arrows"
        :key="arrow.id"
        class="arrows"
        src="/arrow/arrow.svg"
        :style="arrow.style"
        style="object-fit: cover; object-position: left top"
      />

      <!-- 操作用レイヤー -->
      <div class="board operation" :style="main.boardStyle">
        <div
          v-for="square in board.squares"
          :key="square.id"
          :style="square.style"
          @click.stop.prevent="clickSquare(square.file, square.rank)"
          @dblclick.stop.prevent="clickSquareR(square.file, square.rank)"
          @contextmenu.stop.prevent="clickSquareR(square.file, square.rank)"
        ></div>
        <div
          v-if="board.promote"
          class="promote"
          :style="board.promote.style"
          @click.stop.prevent="clickPromote()"
        >
          <img class="piece-image" :src="board.promote.imagePath" draggable="false" />
        </div>
        <div
          v-if="board.doNotPromote"
          class="not-promote"
          :style="board.doNotPromote.style"
          @click.stop.prevent="clickNotPromote()"
        >
          <img class="piece-image" :src="board.doNotPromote.imagePath" draggable="false" />
        </div>
      </div>
      <div class="hand operation" :style="main.blackHandStyle">
        <div
          :style="blackHand.touchAreaStyle"
          @click.stop.prevent="clickHandArea(Color.BLACK)"
        ></div>
        <div
          v-for="pointer in blackHand.pointers"
          :key="pointer.id"
          :style="pointer.style"
          @click.stop.prevent="clickHand(Color.BLACK, pointer.type)"
        ></div>
      </div>
      <div class="hand operation" :style="main.whiteHandStyle">
        <div
          :style="whiteHand.touchAreaStyle"
          @click.stop.prevent="clickHandArea(Color.WHITE)"
        ></div>
        <div
          v-for="pointer in whiteHand.pointers"
          :key="pointer.id"
          :style="pointer.style"
          @click.stop.prevent="clickHand(Color.WHITE, pointer.type)"
        ></div>
      </div>

      <!-- 先手の対局者名 -->
      <div
        class="player-name"
        :class="{ active: position.color == 'black' }"
        :style="main.blackPlayerName.style"
      >
        <span class="player-name-text">☗{{ blackPlayerName }}</span>
      </div>

      <!-- 先手の持ち時間 -->
      <div
        v-if="main.blackClock"
        class="clock"
        :class="blackPlayerTimeSeverity"
        :style="main.blackClock.style"
      >
        <span class="clock-text">{{ blackPlayerTimeText }}</span>
      </div>

      <!-- 後手の対局者名 -->
      <div
        class="player-name"
        :class="{ active: position.color == 'white' }"
        :style="main.whitePlayerName.style"
      >
        <span class="player-name-text">☖{{ whitePlayerName }}</span>
      </div>

      <!-- 後手の持ち時間 -->
      <div
        v-if="main.whiteClock"
        class="clock"
        :class="whitePlayerTimeSeverity"
        :style="main.whiteClock.style"
      >
        <span class="clock-text">{{ whitePlayerTimeText }}</span>
      </div>

      <!-- 手番 -->
      <div v-if="main.turn" class="turn" :style="main.turn.style">{{ t.nextTurn }}</div>

      <!-- コントロールパネル -->
      <div v-if="main.control" class="control" :style="main.control.left.style">
        <slot name="left-control"></slot>
      </div>
      <div v-if="main.control" class="control" :style="main.control.right.style">
        <slot name="right-control"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  PieceType,
  Square,
  Piece,
  Color,
  Move,
  ImmutablePosition,
  PositionChange,
  secondsToHHMMSS,
} from "tsshogi";
import { computed, reactive, watch, PropType } from "vue";
import {
  BoardImageType,
  BoardLabelType,
  KingPieceType,
  PieceStandImageType,
  PromotionSelectorStyle,
} from "@/common/settings/app";
import { RectSize } from "@/common/assets/geometry";
import { newConfig } from "./board/config";
import { StandardLayoutBuilder } from "./board/standard";
import { PortraitLayoutBuilder } from "./board/portrait";
import { BoardLayoutBuilder } from "./board/board";
import {
  CompactHandLayoutBuilder,
  HandLayoutBuilder,
  PortraitHandLayoutBuilder,
} from "./board/hand";
import { BoardLayoutType } from "@/common/settings/layout";
import { CompactLayoutBuilder } from "./board/compact";
import BoardGrid from "./BoardGrid.vue";
import { t } from "@/common/i18n";

type State = {
  pointer: Square | Piece | null;
  reservedMove: Move | null;
};

const props = defineProps({
  layoutType: {
    type: String as PropType<BoardLayoutType>,
    required: false,
    default: BoardLayoutType.STANDARD,
  },
  boardImageType: {
    type: String as PropType<BoardImageType>,
    required: true,
  },
  customBoardImageUrl: {
    type: String,
    required: false,
    default: undefined,
  },
  boardImageOpacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
  boardGridColor: {
    type: String,
    required: false,
    default: undefined,
  },
  pieceImageUrlTemplate: {
    type: String,
    required: true,
  },
  kingPieceType: {
    type: String as PropType<KingPieceType>,
    required: true,
  },
  pieceStandImageType: {
    type: String as PropType<PieceStandImageType>,
    required: true,
  },
  customPieceStandImageUrl: {
    type: String,
    required: false,
    default: undefined,
  },
  pieceStandImageOpacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
  promotionSelectorStyle: {
    type: String as PropType<PromotionSelectorStyle>,
    required: false,
    default: PromotionSelectorStyle.HORIZONTAL,
  },
  boardLabelType: {
    type: String as PropType<BoardLabelType>,
    required: true,
  },
  maxSize: {
    type: RectSize,
    required: true,
  },
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  lastMove: {
    type: Object as PropType<Move | null>,
    required: false,
    default: null,
  },
  candidates: {
    type: Array as PropType<Move[]>,
    required: false,
    default: () => [],
  },
  flip: {
    type: Boolean,
    required: false,
  },
  hideClock: {
    type: Boolean,
    required: false,
    default: false,
  },
  mobile: {
    type: Boolean,
    required: false,
    default: false,
  },
  allowEdit: {
    type: Boolean,
    required: false,
  },
  allowMove: {
    type: Boolean,
    required: false,
  },
  blackPlayerName: {
    type: String,
    required: false,
    default: "先手",
  },
  whitePlayerName: {
    type: String,
    required: false,
    default: "後手",
  },
  blackPlayerTime: {
    type: Number,
    required: false,
    default: undefined,
  },
  blackPlayerByoyomi: {
    type: Number,
    required: false,
    default: undefined,
  },
  whitePlayerTime: {
    type: Number,
    required: false,
    default: undefined,
  },
  whitePlayerByoyomi: {
    type: Number,
    required: false,
    default: undefined,
  },
  dropShadows: {
    type: Boolean,
    required: false,
    default: true,
  },
});

const emit = defineEmits<{
  resize: [size: RectSize];
  move: [move: Move];
  edit: [change: PositionChange];
}>();

const state = reactive({
  pointer: null,
  reservedMove: null,
} as State);

const resetState = () => {
  state.pointer = null;
  state.reservedMove = null;
};

watch(
  [() => props.position, () => props.position.sfen, () => props.allowEdit, () => props.allowMove],
  () => {
    resetState();
  },
);

const clickFrame = () => {
  resetState();
};

const updatePointer = (newPointer: Square | Piece, empty: boolean, color: Color | undefined) => {
  const prevPointer = state.pointer;
  resetState();
  if (
    newPointer instanceof Square &&
    prevPointer instanceof Square &&
    newPointer.equals(prevPointer)
  ) {
    return;
  }
  if (
    newPointer instanceof Piece &&
    prevPointer instanceof Piece &&
    newPointer.equals(prevPointer)
  ) {
    return;
  }
  if (prevPointer) {
    const editFrom = prevPointer;
    const editTo = newPointer instanceof Square ? newPointer : newPointer.color;
    if (props.allowEdit && props.position.isValidEditing(editFrom, editTo)) {
      emit("edit", {
        move: {
          from: prevPointer,
          to: editTo,
        },
      });
      return;
    }
    if (props.allowMove && newPointer instanceof Square) {
      const moveFrom = prevPointer instanceof Square ? prevPointer : prevPointer.type;
      const moveTo = newPointer;
      const move = props.position.createMove(moveFrom, moveTo);
      if (!move) {
        return;
      }
      const noProm = props.position.isValidMove(move);
      const prom = props.position.isValidMove(move.withPromote());
      if (noProm && prom) {
        state.reservedMove = move;
        return;
      }
      if (noProm) {
        emit("move", move);
        return;
      }
      if (prom) {
        emit("move", move.withPromote());
        return;
      }
    }
  }
  if ((!props.allowMove && !props.allowEdit) || empty) {
    return;
  }
  if (!props.allowEdit && color !== props.position.color) {
    return;
  }
  state.pointer = newPointer;
};

const clickSquare = (file: number, rank: number) => {
  const square = new Square(file, rank);
  const piece = props.position.board.at(square);
  const empty = !piece;
  updatePointer(square, empty, piece?.color);
};

const clickHandArea = (color: Color) => {
  // 局面編集の場合はどの持ち駒でもない領域をクリックしても移動先として認識する。
  // empty = true なので移動先としてのみ利用され選択は残らない。
  updatePointer(new Piece(color, PieceType.PAWN), true, color);
};

const clickHand = (color: Color, type: PieceType) => {
  const empty = props.position.hand(color).count(type) === 0;
  updatePointer(new Piece(color, type), empty, color);
};

const clickSquareR = (file: number, rank: number) => {
  // モバイルの端末では異なるマスを素早く連続でタップするとダブルタップ判定されてしまうので、
  // 成・不成選択のUIがキャンセルされないようにイベントを無視する。
  if (props.mobile && !props.allowEdit) {
    return;
  }
  resetState();
  const square = new Square(file, rank);
  if (props.allowEdit && props.position.board.at(square)) {
    emit("edit", { rotate: square });
  }
};

const clickPromote = () => {
  const move = state.reservedMove;
  resetState();
  if (move && props.position.isValidMove(move.withPromote())) {
    emit("move", move.withPromote());
  }
};

const clickNotPromote = () => {
  const move = state.reservedMove;
  resetState();
  if (move && props.position.isValidMove(move)) {
    emit("move", move);
  }
};

const config = computed(() => {
  return newConfig({
    boardImageType: props.boardImageType,
    customBoardImageURL: props.customBoardImageUrl,
    pieceStandImageType: props.pieceStandImageType,
    customPieceStandImageURL: props.customPieceStandImageUrl,
    pieceImageURLTemplate: props.pieceImageUrlTemplate,
    kingPieceType: props.kingPieceType,
    boardImageOpacity: props.boardImageOpacity,
    pieceStandImageOpacity: props.pieceStandImageOpacity,
    promotionSelectorStyle: props.promotionSelectorStyle,
    boardLabelType: props.boardLabelType,
    upperSizeLimit: props.maxSize,
    flip: props.flip,
    hideClock: props.hideClock,
  });
});

const layoutBuilder = computed(() => {
  switch (props.layoutType) {
    default:
      return new StandardLayoutBuilder(config.value);
    case BoardLayoutType.COMPACT:
      return new CompactLayoutBuilder(config.value);
    case BoardLayoutType.PORTRAIT:
      return new PortraitLayoutBuilder(config.value);
  }
});

let lastFrameSize: RectSize | null = null;
const main = computed(() => {
  const main = layoutBuilder.value.build(props.position);
  if (!lastFrameSize || !lastFrameSize.equals(main.frame.size)) {
    emit("resize", main.frame.size);
    lastFrameSize = main.frame.size;
  }
  return main;
});

const boardLayoutBuilder = computed(() => {
  return new BoardLayoutBuilder(config.value, main.value.ratio);
});

const board = computed(() => {
  return boardLayoutBuilder.value.build(
    props.position.board,
    props.lastMove,
    state.pointer,
    state.reservedMove,
  );
});

const handLayoutBuilder = computed(() => {
  switch (props.layoutType) {
    default:
      return new HandLayoutBuilder(config.value, main.value.ratio);
    case BoardLayoutType.COMPACT:
      return new CompactHandLayoutBuilder(config.value, main.value.ratio);
    case BoardLayoutType.PORTRAIT:
      return new PortraitHandLayoutBuilder(config.value, main.value.ratio);
  }
});

const blackHand = computed(() => {
  return handLayoutBuilder.value.build(
    props.position.hand(Color.BLACK),
    Color.BLACK,
    state.pointer,
  );
});

const whiteHand = computed(() => {
  return handLayoutBuilder.value.build(
    props.position.hand(Color.WHITE),
    Color.WHITE,
    state.pointer,
  );
});

const arrows = computed(() => {
  const arrowWidth = 30 * main.value.ratio;
  return props.candidates.map((candidate) => {
    const boardBase = layoutBuilder.value.boardBasePoint;
    const blackHandBase = layoutBuilder.value.blackHandBasePoint;
    const whiteHandBase = layoutBuilder.value.whiteHandBasePoint;
    const start =
      candidate.from instanceof Square
        ? boardBase.add(boardLayoutBuilder.value.centerOfSquare(candidate.from))
        : candidate.color === Color.BLACK
          ? blackHandBase.add(
              handLayoutBuilder.value.centerOfPieceType(
                props.position.hand(Color.BLACK),
                Color.BLACK,
                candidate.from,
              ),
            )
          : whiteHandBase.add(
              handLayoutBuilder.value.centerOfPieceType(
                props.position.hand(Color.WHITE),
                Color.WHITE,
                candidate.from,
              ),
            );
    const end = boardBase.add(boardLayoutBuilder.value.centerOfSquare(candidate.to));
    const middle = start.add(end).multiply(0.5);
    const distance = start.distanceTo(end);
    const angle = start.angleTo(end) - Math.PI;
    const x = middle.x - distance / 2;
    const y = middle.y - arrowWidth / 2;
    return {
      id: candidate.usi,
      style: {
        left: x + "px",
        top: y + "px",
        width: distance + "px",
        height: arrowWidth + "px",
        transform: `rotate(${angle}rad)`,
      },
    };
  });
});

const formatTime = (time?: number, byoyomi?: number): string => {
  if (time) {
    return secondsToHHMMSS(time);
  } else if (byoyomi !== undefined) {
    return "" + byoyomi;
  }
  return "0:00:00";
};

const timeSeverity = (time?: number, byoyomi?: number) => {
  if (!time && !byoyomi) {
    return "normal";
  }
  const rem = (time || 0) + (byoyomi || 0);
  if (rem <= 5) {
    return "danger";
  } else if (rem <= 10) {
    return "warning";
  }
  return "normal";
};

const blackPlayerTimeText = computed(() => {
  return formatTime(props.blackPlayerTime, props.blackPlayerByoyomi);
});

const blackPlayerTimeSeverity = computed(() => {
  return timeSeverity(props.blackPlayerTime, props.blackPlayerByoyomi);
});

const whitePlayerTimeText = computed(() => {
  return formatTime(props.whitePlayerTime, props.whitePlayerByoyomi);
});

const whitePlayerTimeSeverity = computed(() => {
  return timeSeverity(props.whitePlayerTime, props.whitePlayerByoyomi);
});
</script>

<style scoped>
.frame {
  color: var(--text-color);
  user-select: none;
  position: relative;
}
.frame > * {
  position: absolute;
}
.board > * {
  position: absolute;
}
.board-background.drop-shadows {
  box-shadow: 3px 3px 6px var(--shadow-color);
}
.hand > * {
  position: absolute;
}
.hand-background.drop-shadows {
  box-shadow: 3px 3px 6px var(--shadow-color);
}
.player-name {
  background-color: var(--text-bg-color);
  display: flex;
  justify-content: left;
  align-items: center;
  border: 1px solid black;
  box-sizing: border-box;
}
.player-name-text {
  margin-left: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.clock {
  background-color: var(--text-bg-color);
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid black;
  box-sizing: border-box;
}
.clock.warning {
  background-color: var(--text-bg-color-warning);
}
.clock.danger {
  color: var(--text-color-danger);
  background-color: var(--text-bg-color-danger);
}
.clock-text {
  vertical-align: middle;
}
.promote {
  background-color: var(--promote-bg-color);
}
.not-promote {
  background-color: var(--not-promote-bg-color);
}
.turn {
  color: var(--turn-label-color);
  background-color: var(--turn-label-bg-color);
  border-color: var(--turn-label-border-color);
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}
.piece-image {
  max-width: 100%;
  max-height: 100%;
}

.hand.back {
  z-index: 10;
}
.board {
  z-index: 11;
}
.hand.front {
  z-index: 12;
}
.arrows {
  z-index: 20;
}
.board.operation,
.hand.operation,
.player-name,
.clock,
.turn,
.control {
  z-index: 30;
}
</style>
