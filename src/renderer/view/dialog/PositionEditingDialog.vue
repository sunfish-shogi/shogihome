<template>
  <DialogFrame ref="dialogFrame" @cancel="onCancel">
    <div class="root row">
      <div class="board-area" @mousedown.stop>
        <BoardView
          :ghost-teleport-target="ghostTeleportTarget"
          :layout-type="BoardLayoutType.PORTRAIT"
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
          :board-label-type="appSettings.boardLabelType"
          :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
          :king-piece-type="appSettings.kingPieceType"
          :max-size="boardMaxSize"
          :position="position"
          :allow-edit="true"
          :allow-move="false"
          :enable-drag-and-drop="appSettings.enableDragAndDrop"
          :hide-clock="true"
          :drop-shadows="false"
          @edit="onEdit"
        />
        <HorizontalSelector
          v-model:value="boardSizeLevel"
          :items="[
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ]"
        />
      </div>
      <div class="controls column">
        <div class="form-group">
          <div class="title">{{ t.changePieceSet }}</div>
          <div class="list row wrap">
            <div v-for="pieceType of pieceTypes" :key="pieceType">
              <span class="piece-name">{{ standardPieceName(pieceType) }}</span>
              <input
                class="number"
                type="number"
                min="0"
                max="18"
                :value="currentCounts[pieceType]"
                @change="onChangeCount(pieceType, $event)"
              />
            </div>
          </div>
          <HorizontalSelector
            v-model:value="destination"
            :items="[
              { label: t.addToBlackHandPieceStand, value: 'blackHand' },
              { label: t.addToWhiteHandPieceStand, value: 'whiteHand' },
              { label: t.addToBoard, value: 'board' },
            ]"
          />
          <button class="bulk thin" @click="setStandardCounts">
            {{ t.setAllPiecesToStandardCounts }}
          </button>
          <button class="bulk thin" @click="setAllZero">{{ t.setAllPiecesToZero }}</button>
        </div>
        <div class="form-group">
          <div class="row">
            <button class="wide" data-hotkey="Mod+z" :disabled="!canUndo" @click="undo">
              <Icon :icon="IconType.UNDO" />
              <span>{{ t.undo }}</span>
            </button>
            <button class="wide" data-hotkey="Mod+Shift+z" :disabled="!canRedo" @click="redo">
              <Icon :icon="IconType.REDO" />
              <span>{{ t.redo }}</span>
            </button>
          </div>
          <button class="wide" @click="isInitialPositionMenuVisible = true">
            <Icon :icon="IconType.REFRESH" />
            <span>{{ t.initializePosition }}</span>
          </button>
          <InitialPositionMenu
            v-if="isInitialPositionMenuVisible"
            @select="onSelectPreset"
            @close="isInitialPositionMenuVisible = false"
          />
          <button class="wide" @click="onChangeTurn">
            <Icon :icon="IconType.SWAP" />
            <span>{{ t.changeTurn }}</span>
          </button>
          <button class="wide" @click="onCopySFEN">
            <Icon :icon="IconType.COPY" />
            <span>{{ t.copy }}(SFEN)</span>
          </button>
          <button class="wide" @click="onCopyBOD">
            <Icon :icon="IconType.COPY" />
            <span>{{ t.copy }}(BOD)</span>
          </button>
          <button class="wide" @click="onPaste">
            <Icon :icon="IconType.PASTE" />
            <span>{{ t.paste }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="onOk">
        {{ t.ok }}
      </button>
      <button data-hotkey="Escape" @click="onCancel">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { useErrorStore } from "@/renderer/store/error";
import { useAppSettings } from "@/renderer/store/settings";
import { RectSize } from "@/common/assets/geometry";
import {
  countExistingPieces,
  exportBOD,
  importKIF,
  isPromotable,
  Position,
  PositionChange,
  PieceType,
  promotedPieceType,
  Record,
  reverseColor,
  standardPieceName,
} from "tsshogi";
import { BoardLayoutType } from "@/common/settings/layout";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { fileURLToCustomSchemeURL } from "@/common/url";
import { inputEventToNumber } from "@/renderer/helpers/form";
import { applyPieceSet, PieceAdditionDestination, PieceSet } from "@/renderer/record/pieceSet";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import DialogFrame from "./DialogFrame.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import InitialPositionMenu from "@/renderer/view/menu/InitialPositionMenu.vue";

const store = useStore();
const appSettings = useAppSettings();

const dialogFrame = ref<InstanceType<typeof DialogFrame>>();
// ネイティブ <dialog> はトップレイヤーに描画されるため、ドラッグ中の駒ゴーストも
// body ではなくこのダイアログの中へテレポートしないとダイアログの背面に隠れてしまう。
const ghostTeleportTarget = computed(() => dialogFrame.value?.dialog ?? "body");

const position = ref(store.record.position.clone());
const history = ref([position.value.sfen]);
const historyIndex = ref(0);
const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value < history.value.length - 1);
const isInitialPositionMenuVisible = ref(false);
const destination = ref<PieceAdditionDestination>(appSettings.pieceAdditionDestination);

const boardSizeLevel = ref<"small" | "medium" | "large">(appSettings.positionEditingBoardSizeLevel);
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));
const updateWindowSize = () => {
  windowSize.width = window.innerWidth;
  windowSize.height = window.innerHeight;
};
onMounted(() => window.addEventListener("resize", updateWindowSize));
onBeforeUnmount(() => window.removeEventListener("resize", updateWindowSize));
const boardMaxSize = computed(() => {
  const ratio = {
    small: 0.6,
    medium: 0.8,
    large: 1,
  }[boardSizeLevel.value];
  return new RectSize(
    Math.min(windowSize.width * 0.5, 500) * ratio,
    Math.max(windowSize.height - 140, 500) * ratio,
  );
});

const pieceTypes = [
  PieceType.KING,
  PieceType.ROOK,
  PieceType.BISHOP,
  PieceType.GOLD,
  PieceType.SILVER,
  PieceType.KNIGHT,
  PieceType.LANCE,
  PieceType.PAWN,
];

// 平手の駒数
const standardCounts = {
  [PieceType.KING]: 2,
  [PieceType.ROOK]: 2,
  [PieceType.BISHOP]: 2,
  [PieceType.GOLD]: 4,
  [PieceType.SILVER]: 4,
  [PieceType.KNIGHT]: 4,
  [PieceType.LANCE]: 4,
  [PieceType.PAWN]: 18,
} as PieceSet;

const currentCounts = computed(() => {
  const raw = countExistingPieces(position.value);
  return Object.fromEntries(
    pieceTypes.map((pieceType) => [
      pieceType,
      raw[pieceType] + (isPromotable(pieceType) ? raw[promotedPieceType(pieceType)] : 0),
    ]),
  );
});

const commitPosition = (newPosition: Position) => {
  history.value = [...history.value.slice(0, historyIndex.value + 1), newPosition.sfen];
  historyIndex.value = history.value.length - 1;
  position.value = newPosition;
};

const undo = () => {
  if (!canUndo.value) {
    return;
  }
  historyIndex.value--;
  position.value = Position.newBySFEN(history.value[historyIndex.value]) as Position;
};

const redo = () => {
  if (!canRedo.value) {
    return;
  }
  historyIndex.value++;
  position.value = Position.newBySFEN(history.value[historyIndex.value]) as Position;
};

const applyCounts = (pieceSet: PieceSet) => {
  const cloned = position.value.clone();
  applyPieceSet(cloned, pieceSet, destination.value);
  commitPosition(cloned);
};

const onChangeCount = (pieceType: PieceType, event: Event) => {
  applyCounts({
    ...currentCounts.value,
    [pieceType]: inputEventToNumber(event),
  } as PieceSet);
};

const setStandardCounts = () => applyCounts(standardCounts);

const setAllZero = () => {
  applyCounts(Object.fromEntries(pieceTypes.map((pieceType) => [pieceType, 0])) as PieceSet);
};

const onEdit = (change: PositionChange) => {
  const cloned = position.value.clone();
  cloned.edit(change);
  commitPosition(cloned);
};

const onChangeTurn = () => {
  const cloned = position.value.clone();
  cloned.setColor(reverseColor(cloned.color));
  commitPosition(cloned);
};

const onSelectPreset = (sfen: string) => {
  const newPosition = Position.newBySFEN(sfen);
  if (newPosition) {
    commitPosition(newPosition);
  }
};

const onCopySFEN = () => {
  navigator.clipboard.writeText(position.value.sfen);
};

const onCopyBOD = () => {
  navigator.clipboard.writeText(exportBOD(new Record(position.value)));
};

const onPaste = async () => {
  const text = (await navigator.clipboard.readText()).trim();
  if (!text) {
    return;
  }
  if (Position.isValidSFEN(text)) {
    commitPosition(Position.newBySFEN(text) as Position);
    return;
  }
  const record = importKIF(text);
  if (!(record instanceof Error)) {
    commitPosition(record.position.clone());
    return;
  }
  useErrorStore().add(new Error(t.failedToDetectRecordFormat));
};

const saveDialogSettings = () => {
  appSettings.updateAppSettings({
    pieceAdditionDestination: destination.value,
    positionEditingBoardSizeLevel: boardSizeLevel.value,
  });
};

const onOk = () => {
  saveDialogSettings();
  store.closePositionEditingDialog(position.value);
};

const onCancel = () => {
  saveDialogSettings();
  store.closePositionEditingDialog();
};
</script>

<style scoped>
.root {
  align-items: flex-start;
  user-select: none;
}
.board-area {
  margin-right: 15px;
}
.controls {
  max-width: 400px;
}
.form-group {
  margin-bottom: 0.8em;
}
.title {
  margin-bottom: 0.3em;
}
.list > * {
  margin-right: 0.5em;
}
.piece-name {
  width: 2em;
  display: inline-block;
  text-align: right;
  margin-right: 0.5em;
}
.number {
  width: 3em;
}
button.wide {
  width: 100%;
}
button.bulk {
  width: 100%;
  margin-top: 0.5em;
}
</style>
