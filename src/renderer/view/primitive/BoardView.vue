<template>
  <div>
    <div
      ref="frame"
      class="frame"
      :style="main.frame.style"
      @mousedown.stop.prevent="clickFrame()"
      @touchstart.stop.prevent="clickFrame()"
    >
      <!-- 盤面 -->
      <div class="board" :style="main.boardStyle">
        <div v-if="board.background.textureImagePath" :style="board.background.style">
          <img class="full" :src="board.background.textureImagePath" />
        </div>
        <div :style="board.background.style">
          <img class="full" :src="board.background.gridImagePath" />
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
      <div class="hand" :style="main.blackHandStyle">
        <div :style="blackHand.backgroundStyle">
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

      <!-- 後手の駒台 -->
      <div class="hand" :style="main.whiteHandStyle">
        <div :style="whiteHand.backgroundStyle">
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

      <img
        v-for="arrow in arrows"
        :key="arrow.id"
        src="/arrow/arrow.svg"
        :style="arrow.style"
        style="object-fit: cover; object-position: left top"
      />

      <!-- ドラッグ中の駒 -->
      <div v-if="state.isDragging" class="dragged-piece" :style="dragStyle">
        <img class="piece-image" :src="state.piecePath" />
      </div>

      <!-- 操作用レイヤー -->
      <div class="board" :style="main.boardStyle">
        <div
          v-for="square in board.squares"
          :key="square.id"
          :style="square.style"
          @mousedown.stop.prevent="dragSquare(square.file, square.rank, $event)"
          @touchstart.stop.prevent="dragSquare(square.file, square.rank, $event)"
          @mouseup.stop.prevent="dropSquare(square.file, square.rank, $event)"
          @touchend.stop.prevent="dropSquare(square.file, square.rank, $event)"
          @dblclick.stop.prevent="clickSquareR(square.file, square.rank)"
          @contextmenu.stop.prevent="clickSquareR(square.file, square.rank)"
        ></div>
        <div v-if="board.promotion" class="promotion-selector" :style="board.promotion.style">
          <div class="select-button promote" @click.stop.prevent="clickPromote()">
            <img class="piece-image" :src="board.promotion.promoteImagePath" draggable="false" />
          </div>
          <div class="select-button not-promote" @click.stop.prevent="clickNotPromote()">
            <img class="piece-image" :src="board.promotion.notPromoteImagePath" draggable="false" />
          </div>
        </div>
      </div>
      <div class="hand" :style="main.blackHandStyle">
        <div
          v-for="pointer in blackHand.pointers"
          :key="pointer.id"
          :style="pointer.style"
          @mousedown.stop.prevent="dragHand(Color.BLACK, pointer.type, $event)"
          @touchstart.stop.prevent="dragHand(Color.BLACK, pointer.type, $event)"
          @mouseup.stop.prevent="dropHand(Color.BLACK, pointer.type, $event)"
          @touchend.stop.prevent="dropHand(Color.BLACK, pointer.type, $event)"
        ></div>
      </div>
      <div class="hand" :style="main.whiteHandStyle">
        <div
          v-for="pointer in whiteHand.pointers"
          :key="pointer.id"
          :style="pointer.style"
          @mousedown.stop.prevent="dragHand(Color.WHITE, pointer.type, $event)"
          @touchstart.stop.prevent="dragHand(Color.WHITE, pointer.type, $event)"
          @mouseup.stop.prevent="dropHand(Color.WHITE, pointer.type, $event)"
          @touchend.stop.prevent="dropHand(Color.WHITE, pointer.type, $event)"
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
      <div v-if="main.turn" class="turn" :style="main.turn.style">{{ nextMoveLabel }}</div>

      <!-- コントロールパネル -->
      <div v-if="main.control" :style="main.control.left.style">
        <slot name="left-control"></slot>
      </div>
      <div v-if="main.control" :style="main.control.right.style">
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
import { computed, reactive, ref, watch, PropType } from "vue";
import type { CSSProperties } from "vue";
import {
  BoardImageType,
  BoardLabelType,
  KingPieceType,
  PieceStandImageType,
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
import { commonParams } from "./board/params";

type State = {
  pointer: Square | Piece | null;
  reservedMove: Move | null;
  pieceSelected: boolean;
  isDragging: boolean;
  draggedFrom: Square | null;
  draggedPiece: Piece | null;
  piecePath: string | undefined;
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
  pieceImageUrlTemplate: {
    type: String,
    required: true,
  },
  kingPieceType: {
    type: String as PropType<KingPieceType>,
    required: true,
  },
  customBoardImageUrl: {
    type: String,
    required: false,
    default: undefined,
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
  boardImageOpacity: {
    type: Number,
    required: false,
    default: 1.0,
  },
  pieceStandImageOpacity: {
    type: Number,
    required: false,
    default: 1.0,
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
  nextMoveLabel: {
    type: String,
    required: false,
    default: "手番",
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
  pieceSelected: false,
  isDragging: false,
  piecePath: undefined,
} as State);

const resetState = () => {
  state.pointer = null;
  state.reservedMove = null;
  state.pieceSelected = false;
};

watch(
  [() => props.position, () => props.position.sfen, () => props.allowEdit, () => props.allowMove],
  () => {
    resetState();
  },
);

const frame = ref<HTMLElement | null>(null);

const clickFrame = () => {
  // 駒の成り処理中はクリックフレームを無視する
  if (!state.reservedMove) {
    resetState();
  }
};

const dragStyle = reactive<CSSProperties>({
  position: "absolute",
  top: "0px",
  left: "0px",
  width: "0px",
  height: "0px",
});

const dragSquare = (file: number, rank: number, event: MouseEvent | TouchEvent) => {
  if ((event instanceof MouseEvent && event.button === 0) || event instanceof TouchEvent) {
    const square = new Square(file, rank);
    const piece = props.position.board.at(square);
    const empty = !piece;
    const prevPointer = state.pointer;
    const newPointer = square;
    if ((!props.allowMove && !props.allowEdit) || empty) {
      return;
    }
    if (!props.allowEdit && piece.color !== props.position.color) {
      return;
    }
    if (!prevPointer || (prevPointer instanceof Square && !newPointer.equals(prevPointer))) {
      resetState();
      state.piecePath = config.value.pieceImages[piece.color][piece.type];
    }
    moveDraggedPiece(event);
    startDragging();
    state.pointer = newPointer;
  }
};

const dropSquare = (file: number, rank: number, event: MouseEvent | TouchEvent) => {
  if ((event instanceof MouseEvent && event.button === 0) || event instanceof TouchEvent) {
    const square = new Square(file, rank);
    const piece = props.position.board.at(square);
    const empty = !piece;
    const prevPointer = state.pointer;
    const newPointer = square;
    stopDragging();
    if (!prevPointer) {
      return;
    }
    if (
      prevPointer instanceof Square &&
      newPointer instanceof Square &&
      newPointer.equals(prevPointer)
    ) {
      state.pieceSelected = !state.pieceSelected;
      if (!state.pieceSelected) {
        resetState();
      }
      return;
    }
    const editFrom = prevPointer;
    const editTo = newPointer instanceof Square ? newPointer : (newPointer as Piece).color;
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
      resetState();
    }
    if ((!props.allowMove && !props.allowEdit) || empty) {
      return;
    }
    if (!props.allowEdit && piece.color !== props.position.color) {
      return;
    }
  }
};

const dragHand = (color: Color, type: PieceType, event: MouseEvent | TouchEvent) => {
  if ((event instanceof MouseEvent && event.button === 0) || event instanceof TouchEvent) {
    const piece = new Piece(color, type);
    const empty = props.position.hand(color).count(type) === 0;
    const prevPointer = state.pointer;
    const newPointer = piece;
    if ((!props.allowMove && !props.allowEdit) || empty) {
      return;
    }
    if (!props.allowEdit && color !== props.position.color) {
      return;
    }
    if (!prevPointer || (prevPointer instanceof Piece && !newPointer.equals(prevPointer))) {
      resetState();
      state.piecePath = config.value.pieceImages[piece.color][piece.type];
    }
    moveDraggedPiece(event);
    startDragging();
    state.pointer = newPointer;
  }
};

const dropHand = (color: Color, type: PieceType, event: MouseEvent | TouchEvent) => {
  if ((event instanceof MouseEvent && event.button === 0) || event instanceof TouchEvent) {
    const piece = new Piece(color, type);
    const prevPointer = state.pointer;
    const newPointer = piece;
    stopDragging();
    if (!prevPointer) {
      return;
    }
    if (
      prevPointer instanceof Piece &&
      newPointer instanceof Piece &&
      newPointer.equals(prevPointer)
    ) {
      state.pieceSelected = !state.pieceSelected;
      if (!state.pieceSelected) {
        resetState();
      }
      return;
    }
    const editFrom = prevPointer;
    const editTo = newPointer instanceof Square ? newPointer : (newPointer as Piece).color;
    if (props.allowEdit && props.position.isValidEditing(editFrom, editTo)) {
      emit("edit", {
        move: {
          from: prevPointer,
          to: editTo,
        },
      });
      return;
    }
    resetState();
  }
};

const startDragging = () => {
  // ドラッグ操作を開始する
  state.isDragging = true;
  window.removeEventListener("mousemove", moveDraggedPiece);
  window.removeEventListener("mouseup", stopDragging);
  window.removeEventListener("touchmove", moveDraggedPiece);
  window.removeEventListener("touchend", stopDragging);
};

const moveDraggedPiece = (event: MouseEvent | TouchEvent) => {
  // 駒をドラッグ中に位置を更新する
  const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
  const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
  const frameRect = frame.value?.getBoundingClientRect();
  const width = commonParams.piece.width * main.value.ratio;
  const height = commonParams.piece.height * main.value.ratio;
  if (frameRect) {
    dragStyle.left = clientX - frameRect.left - width / 2 + "px";
    dragStyle.top = clientY - frameRect.top - height / 2 + "px";
  }
  dragStyle.width = width + "px";
  dragStyle.height = height + "px";
};

const stopDragging = () => {
  // ドラッグ操作を終了する
  state.isDragging = false;
  window.removeEventListener("mousemove", moveDraggedPiece);
  window.removeEventListener("mouseup", stopDragging);
  window.removeEventListener("touchmove", moveDraggedPiece);
  window.removeEventListener("touchend", stopDragging);
};

const clickSquareR = (file: number, rank: number) => {
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
.hand > * {
  position: absolute;
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
.promotion-selector {
  overflow: hidden;
}
.select-button {
  float: left;
  width: 50%;
  height: 100%;
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
</style>
