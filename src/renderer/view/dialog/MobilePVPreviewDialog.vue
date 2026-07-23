<template>
  <dialog ref="dialog" class="mobile-pv-preview">
    <div class="header">
      <span class="info">{{ info }}</span>
      <button class="close-button" @click="onClose">
        <Icon :icon="IconType.CLOSE" />
      </button>
    </div>
    <div class="board-view">
      <BoardView
        :layout-type="layoutType"
        :board-image-type="appSettings.boardImage"
        :custom-board-image-url="
          appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
        "
        :board-image-opacity="appSettings.enableTransparent ? appSettings.boardOpacity : 1"
        :board-grid-color="appSettings.boardGridColor || undefined"
        :piece-stand-image-type="appSettings.pieceStandImage"
        :custom-piece-stand-image-url="
          appSettings.pieceStandImageFileURL &&
          fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
        "
        :piece-stand-image-opacity="
          appSettings.enableTransparent ? appSettings.pieceStandOpacity : 1
        "
        :hand-piece-order="appSettings.handPieceOrder"
        :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
        :king-piece-type="appSettings.kingPieceType"
        :board-label-type="appSettings.boardLabelType"
        :max-size="boardMaxSize"
        :position="record.position"
        :last-move="lastMove"
        :flip="flip"
        :mobile="true"
        :hide-clock="true"
        :drop-shadows="false"
        :black-player-name="t.sente"
        :white-player-name="t.gote"
      />
    </div>
    <div class="controls">
      <button class="control-button" @click="goBegin">
        <Icon :icon="IconType.FIRST" />
      </button>
      <button class="control-button" @click="goBack">
        <Icon :icon="IconType.BACK" />
      </button>
      <button class="control-button" @click="goForward">
        <Icon :icon="IconType.NEXT" />
      </button>
      <button class="control-button" @click="goEnd">
        <Icon :icon="IconType.LAST" />
      </button>
    </div>
    <div class="informations">
      <div class="information">
        <span v-for="(move, index) in displayPV" :key="index">
          <span
            class="move-element"
            :class="{ selected: move.selected }"
            @click="record.goto(move.ply)"
            >&nbsp;{{ move.text }}&nbsp;</span
          >
        </span>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { Color, ImmutablePosition, Move, Record } from "tsshogi";
import { onMounted, PropType, ref, reactive, watch, onBeforeUnmount, computed } from "vue";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { RectSize } from "@/common/assets/geometry.js";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { EvaluationViewFrom, getPieceImageURLTemplate } from "@/common/settings/app";
import { BoardLayoutType } from "@/common/settings/layout";
import { t } from "@/common/i18n";
import { fileURLToCustomSchemeURL } from "@/common/url";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { isIOS } from "@/renderer/helpers/env";

const headerHeight = 32;
const controlsHeight = 40;
const minInformationHeight = 60;

// iOS の多くのバージョンでは safe-area-inset-bottom が 21px になる。
// それ以外の環境もマージンを持たせる。(MobileLayout と同じ値)
const safeAreaMarginY = isIOS() ? 21 : 10;

const props = defineProps({
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  name: {
    type: String,
    required: false,
    default: undefined,
  },
  multiPv: {
    type: Number,
    required: false,
    default: undefined,
  },
  depth: {
    type: Number,
    required: false,
    default: undefined,
  },
  selectiveDepth: {
    type: Number,
    required: false,
    default: undefined,
  },
  score: {
    type: Number,
    required: false,
    default: undefined,
  },
  mate: {
    type: Number,
    required: false,
    default: undefined,
  },
  lowerBound: {
    type: Boolean,
    required: false,
    default: false,
  },
  upperBound: {
    type: Boolean,
    required: false,
    default: false,
  },
  pv: {
    type: Array as PropType<Move[]>,
    required: true,
  },
  flip: {
    type: Boolean,
    required: false,
    default: undefined,
  },
});

const emit = defineEmits<{
  close: [];
}>();

const appSettings = useAppSettings();
const dialog = ref<HTMLDialogElement>();
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));
const record = reactive(new Record());
const flip = ref(props.flip !== undefined ? props.flip : appSettings.boardFlipping);

const updateSize = () => {
  windowSize.width = window.innerWidth;
  windowSize.height = window.innerHeight;
};

const boardMaxSize = computed(
  () =>
    new RectSize(
      windowSize.width,
      windowSize.height - safeAreaMarginY - headerHeight - controlsHeight - minInformationHeight,
    ),
);

// 盤面の領域が縦長なら縦型レイアウト、横長ならコンパクトレイアウトを使用する。
const layoutType = computed(() =>
  boardMaxSize.value.height >= boardMaxSize.value.width
    ? BoardLayoutType.PORTRAIT
    : BoardLayoutType.COMPACT,
);

const updateRecord = () => {
  record.clear(props.position);
  for (const move of props.pv) {
    record.append(move, { ignoreValidation: true });
  }
  record.goto(1);
};

onMounted(() => {
  updateRecord();
  showModalDialog(dialog.value!, onClose);
  installHotKeyForDialog(dialog.value!);
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
  window.removeEventListener("resize", updateSize);
});

watch([() => props.position, () => props.pv], () => {
  updateRecord();
});

const onClose = () => {
  emit("close");
};

const goBegin = () => {
  record.goto(0);
};

const goEnd = () => {
  record.goto(Number.MAX_SAFE_INTEGER);
};

const goBack = () => {
  record.goBack();
};

const goForward = () => {
  record.goForward();
};

const getDisplayScore = (score: number, color: Color, evaluationViewFrom: EvaluationViewFrom) => {
  return evaluationViewFrom === EvaluationViewFrom.EACH || color == Color.BLACK ? score : -score;
};

const info = computed(() => {
  const elements = [];
  if (props.name) {
    elements.push(`${props.name}`);
  }
  if (props.depth !== undefined) {
    elements.push(`深さ=${props.depth}`);
  }
  if (props.selectiveDepth !== undefined) {
    elements.push(`選択的深さ=${props.selectiveDepth}`);
  }
  if (props.score !== undefined) {
    elements.push(
      `評価値=${getDisplayScore(props.score, props.position.color, appSettings.evaluationViewFrom)}`,
    );
    if (props.lowerBound) {
      elements.push("（下界値）");
    }
    if (props.upperBound) {
      elements.push("（上界値）");
    }
  }
  if (props.mate !== undefined) {
    elements.push(
      `詰み手数=${getDisplayScore(
        props.mate,
        props.position.color,
        appSettings.evaluationViewFrom,
      )}`,
    );
  }
  if (props.multiPv) {
    elements.push(`順位=${props.multiPv}`);
  }
  return elements.join(" / ");
});

const lastMove = computed(() => (record.current.move instanceof Move ? record.current.move : null));

const displayPV = computed(() => {
  return record.moves.slice(1).map((move) => {
    return {
      ply: move.ply,
      text: move.displayText,
      selected: move.ply === record.current.ply,
    };
  });
});
</script>

<style scoped>
dialog.mobile-pv-preview {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  margin: 0;
  padding: 0;
  border: none;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
.header {
  height: 32px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 5px;
}
.header .info {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.close-button {
  height: 28px;
  margin: 0;
  padding: 0 8px;
}
.close-button .icon {
  height: 100%;
  width: auto;
}
.board-view {
  display: flex;
  justify-content: center;
}
.controls {
  height: 40px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.control-button {
  height: 32px;
  margin: 0;
  padding: 0 10px;
}
.control-button .icon {
  height: 100%;
  width: auto;
}
.informations {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 5px;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.information {
  font-size: 14px;
  margin: 2px;
  text-align: left;
  line-height: 1.8;
}
.move-element.selected {
  background-color: var(--text-bg-color-selected);
}
</style>
