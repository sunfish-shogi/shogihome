<template>
  <div>
    <BoardView
      :layout-type="layoutType || appSettings.boardLayoutType"
      :board-image-type="appSettings.boardImage"
      :piece-stand-image-type="appSettings.pieceStandImage"
      :board-label-type="appSettings.boardLabelType"
      :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
      :king-piece-type="appSettings.kingPieceType"
      :custom-board-image-url="appSettings.boardImageFileURL"
      :custom-piece-stand-image-url="appSettings.pieceStandImageFileURL"
      :board-image-opacity="appSettings.enableTransparent ? appSettings.boardOpacity : 1"
      :piece-stand-image-opacity="appSettings.enableTransparent ? appSettings.pieceStandOpacity : 1"
      :max-size="maxSize"
      :position="store.record.position"
      :last-move="lastMove"
      :candidates="store.candidates"
      :flip="appSettings.boardFlipping"
      :hide-clock="store.appState !== AppState.GAME && store.appState !== AppState.CSA_GAME"
      :allow-move="store.isMovableByUser"
      :allow-edit="store.appState === AppState.POSITION_EDITING"
      :black-player-name="blackPlayerName"
      :white-player-name="whitePlayerName"
      :black-player-time="clock?.black.time"
      :black-player-byoyomi="clock?.black.byoyomi"
      :white-player-time="clock?.white.time"
      :white-player-byoyomi="clock?.white.byoyomi"
      :next-move-label="t.nextTurn"
      @resize="onResize"
      @move="onMove"
      @edit="onEdit"
    >
      <template #right-control>
        <ControlPane
          v-show="rightControlType !== RightSideControlType.NONE"
          class="full"
          :group="ControlGroup.Group1"
        />
      </template>
      <template #left-control>
        <ControlPane
          v-show="leftControlType !== LeftSideControlType.NONE"
          class="full"
          :group="ControlGroup.Group2"
        />
      </template>
    </BoardView>
    <img v-if="activeCastle" class="overlay" :src="`/castle/${activeCastle}.png`" />
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, onMounted, PropType, ref, watch } from "vue";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import {
  Color,
  ImmutableBoard,
  Move,
  PieceType,
  PositionChange,
  Square,
  getBlackPlayerName,
  getWhitePlayerName,
} from "tsshogi";
import { RectSize } from "@/common/assets/geometry.js";
import { useStore } from "@/renderer/store";
import ControlPane, { ControlGroup } from "@/renderer/view/main/ControlPane.vue";
import { AppState } from "@/common/control/state.js";
import { humanPlayer } from "@/renderer/players/human";
import { CSAGameState } from "@/renderer/store/csa";
import { useAppSettings } from "@/renderer/store/settings";
import {
  RightSideControlType,
  LeftSideControlType,
  getPieceImageURLTemplate,
} from "@/common/settings/app";
import { BoardLayoutType } from "@/common/settings/layout";

defineProps({
  maxSize: {
    type: RectSize,
    required: true,
  },
  layoutType: {
    type: String as PropType<BoardLayoutType>,
    required: false,
    default: undefined,
  },
  leftControlType: {
    type: String as PropType<LeftSideControlType>,
    required: false,
    default: LeftSideControlType.STANDARD,
  },
  rightControlType: {
    type: String as PropType<RightSideControlType>,
    required: false,
    default: RightSideControlType.STANDARD,
  },
});

const emit = defineEmits<{
  resize: [RectSize];
}>();

const store = useStore();
const appSettings = useAppSettings();

const onResize = (size: RectSize) => {
  emit("resize", size);
};

const onMove = (move: Move) => {
  if (store.appState === AppState.GAME || store.appState === AppState.CSA_GAME) {
    humanPlayer.doMove(move);
  } else {
    store.doMove(move);
  }
};

const onEdit = (change: PositionChange) => {
  store.editPosition(change);
};

const lastMove = computed(() => {
  const move = store.record.current.move;
  return move instanceof Move ? move : undefined;
});

const blackPlayerName = computed(() => getBlackPlayerName(store.record.metadata) || t.sente);
const whitePlayerName = computed(() => getWhitePlayerName(store.record.metadata) || t.gote);

const clock = computed(() => {
  if (store.appState === AppState.GAME || store.csaGameState === CSAGameState.GAME) {
    return {
      black: {
        time: store.blackTime,
        byoyomi: store.blackByoyomi,
      },
      white: {
        time: store.whiteTime,
        byoyomi: store.whiteByoyomi,
      },
    };
  }
  return undefined;
});

// 囲いの定義
type Castle = "anaguma" | "yagura";
type CastlePattern = {
  name: Castle;
  pieces: { file: number; rank: number; piece: PieceType }[];
};
let castlePatterns: CastlePattern[] = [];
onMounted(async () => {
  const data = await window.fetch("/castle/pattern.json");
  castlePatterns = (await data.json()) as CastlePattern[];
});

// 表示中のエフェクト
const activeCastle = ref<Castle | undefined>(undefined);
let castleTimeout: number = -1;

// 判定した囲いを記録する
const castleSet = new Set<Castle>();
watch(
  () => store.appState,
  () => castleSet.clear(),
);

function detectCastles(board: ImmutableBoard): Castle[] {
  const cassles = [] as Castle[];
  for (const pattern of castlePatterns) {
    const isMatch =
      pattern.pieces.every(({ file, rank, piece }) => {
        const p = board.at(new Square(file, rank));
        return p?.type === piece && p?.color === Color.BLACK;
      }) ||
      pattern.pieces.every(({ file, rank, piece }) => {
        const p = board.at(new Square(file, rank).opposite);
        return p?.type === piece && p?.color === Color.WHITE;
      });
    if (isMatch) {
      cassles.push(pattern.name);
    }
  }
  return cassles;
}

// 局面が変更されたタイミングを検知する
store.addEventListener("changePosition", async () => {
  // 対局モードの場合だけ囲いを判定する
  if (store.appState === AppState.GAME || store.appState === AppState.CSA_GAME) {
    const castles = detectCastles(store.record.position.board);
    for (const castle of castles) {
      if (castle && !castleSet.has(castle)) {
        // 2回目以降は表示しないように覚えておく
        castleSet.add(castle);
        // エフェクトを表示する
        activeCastle.value = castle;
        if (castleTimeout) {
          clearTimeout(castleTimeout);
        }
        // 1.5秒後に消す
        castleTimeout = window.setTimeout(() => {
          activeCastle.value = undefined;
        }, 1500);
        break;
      }
    }
  }
});
</script>

<style scoped>
.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 80%;
  max-height: 80%;
  z-index: 1000;
}
</style>
