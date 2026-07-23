<template>
  <dialog ref="dialog" class="mobile-quiz">
    <div class="header">
      <span class="header-item">{{ t.problemNofM(quiz.problemNumber, quiz.problemCount) }}</span>
      <span class="header-item">
        {{ t.correct }}: {{ quiz.correctCount }} / {{ quiz.answeredCount }}
        <span v-if="quiz.answeredCount">
          ({{ Math.round((quiz.correctCount / quiz.answeredCount) * 100) }}%)
        </span>
      </span>
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
        :promotion-selector-style="appSettings.promotionSelectorStyle"
        :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
        :king-piece-type="appSettings.kingPieceType"
        :board-label-type="appSettings.boardLabelType"
        :max-size="boardMaxSize"
        :position="boardPosition"
        :last-move="lastMove"
        :flip="flip"
        :mobile="true"
        :hide-clock="true"
        :drop-shadows="false"
        :allow-move="!quiz.done && !quiz.playedMove"
        :ghost-teleport-target="ghostTeleportTarget"
        :black-player-name="t.sente"
        :white-player-name="t.gote"
        @move="onMove"
      />
    </div>
    <div class="controls">
      <button class="control-button" :disabled="!quiz.hasPrevious" @click="quiz.goPrevious()">
        <Icon :icon="IconType.BACK" />
      </button>
      <button class="control-button" :disabled="!quiz.hasNext" @click="quiz.goNext()">
        <Icon :icon="IconType.NEXT" />
      </button>
      <HorizontalSelector
        :value="quiz.shuffled ? 'shuffle' : 'sequential'"
        :items="[
          { value: 'sequential', label: t.inOrder },
          { value: 'shuffle', label: t.shuffle },
        ]"
        :height="26"
        @update:value="(value: string) => quiz.setShuffled(value === 'shuffle')"
      />
    </div>
    <div class="informations">
      <div v-if="!quiz.done" class="information">
        <span class="question">{{ t.findTheNextMove }}</span>
        <button class="thin" @click="quiz.reveal()">{{ t.showAnswer }}</button>
      </div>
      <template v-else>
        <div class="information candidates-list">
          <button
            v-for="(row, index) in candidateRows"
            :key="index"
            class="candidate-button"
            @click="showPV(row)"
          >
            {{ index + 1 }}. {{ row.text }} ({{ row.scoreText }}){{ row.accepted ? " ○" : "" }}
          </button>
        </div>
        <div v-if="actualMoveRow" class="information">
          {{ t.actualGameMove }}: {{ actualMoveRow.text }} ({{ actualMoveRow.scoreText }})
        </div>
        <div v-if="sourceText" class="information">{{ t.sourceRecord }}: {{ sourceText }}</div>
      </template>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry.js";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { BoardLayoutType } from "@/common/settings/layout";
import { fileURLToCustomSchemeURL } from "@/common/url";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { isIOS } from "@/renderer/helpers/env";
import { useNextMoveQuizController } from "./next_move_quiz";

const headerHeight = 32;
const controlsHeight = 40;
const minInformationHeight = 110;

// iOS の多くのバージョンでは safe-area-inset-bottom が 21px になる。
// それ以外の環境もマージンを持たせる。(MobileLayout と同じ値)
const safeAreaMarginY = isIOS() ? 21 : 10;

const emit = defineEmits<{
  close: [];
}>();

const appSettings = useAppSettings();
const dialog = ref<HTMLDialogElement>();
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));

const {
  quiz,
  boardPosition,
  lastMove,
  flip,
  onMove,
  candidateRows,
  actualMoveRow,
  sourceText,
  showPV,
} = useNextMoveQuizController();

// ドラッグ中の駒ゴーストをダイアログ (トップレイヤー) 内に描画し、
// ダイアログより手前に表示されるようにする。
const ghostTeleportTarget = computed(() => dialog.value ?? "body");

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

onMounted(() => {
  showModalDialog(dialog.value!, onClose);
  installHotKeyForDialog(dialog.value!);
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
  window.removeEventListener("resize", updateSize);
});

const onClose = () => {
  emit("close");
};
</script>

<style scoped>
dialog.mobile-quiz {
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
  white-space: nowrap;
}
.control-button .icon {
  height: 100%;
  width: auto;
}
.control-button.wide {
  font-size: 90%;
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
}
.question {
  font-weight: bold;
  margin-right: 10px;
}
.candidates-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.candidate-button {
  white-space: nowrap;
  margin: 0;
  padding: 2px 8px;
}
</style>
