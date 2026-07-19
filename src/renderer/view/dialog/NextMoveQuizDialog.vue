<template>
  <DialogFrame ref="dialogFrame" @cancel="onClose">
    <div class="header">
      <span class="header-item">{{ t.problemNofM(quiz.problemNumber, quiz.problemCount) }}</span>
      <HorizontalSelector
        class="header-item"
        :value="quiz.shuffled ? 'shuffle' : 'sequential'"
        :items="[
          { value: 'sequential', label: t.inOrder },
          { value: 'shuffle', label: t.shuffle },
        ]"
        @update:value="(value: string) => quiz.setShuffled(value === 'shuffle')"
      />
      <span class="header-item">
        {{ t.correct }}: {{ quiz.correctCount }} / {{ quiz.answeredCount }}
        <span v-if="quiz.answeredCount">
          ({{ t.correctRate }}: {{ Math.round((quiz.correctCount / quiz.answeredCount) * 100) }}%)
        </span>
      </span>
    </div>
    <div class="board-view">
      <div class="board-frame" @mousedown.stop>
        <BoardView
          :board-image-type="appSettings.boardImage"
          :custom-board-image-url="
            appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
          "
          :board-grid-color="appSettings.boardGridColor || undefined"
          :piece-stand-image-type="appSettings.pieceStandImage"
          :custom-piece-stand-image-url="
            appSettings.pieceStandImageFileURL &&
            fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
          "
          :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
          :king-piece-type="appSettings.kingPieceType"
          :board-label-type="appSettings.boardLabelType"
          :max-size="maxSize"
          :position="boardPosition"
          :last-move="lastMove"
          :flip="flip"
          :allow-move="!quiz.done && !quiz.playedMove"
          :ghost-teleport-target="ghostTeleportTarget"
          :black-player-name="t.sente"
          :white-player-name="t.gote"
          @move="onMove"
        >
          <template #right-control>
            <div class="full column">
              <div class="row control-row">
                <button class="control-item" data-hotkey="Mod+t" @click="doFlip">
                  <Icon :icon="IconType.FLIP" />
                </button>
                <button class="control-item" data-hotkey="Escape" @click="onClose">
                  <Icon :icon="IconType.CLOSE" />
                </button>
              </div>
            </div>
          </template>
          <template #left-control>
            <div class="full column reverse">
              <button class="control-item-wide" :disabled="!quiz.hasNext" @click="quiz.goNext()">
                {{ t.nextProblem }}
              </button>
              <button
                class="control-item-wide"
                :disabled="!quiz.hasPrevious"
                @click="quiz.goPrevious()"
              >
                {{ t.previousProblem }}
              </button>
              <button v-if="!quiz.done" class="control-item-wide" @click="quiz.reveal()">
                {{ t.showAnswer }}
              </button>
            </div>
          </template>
        </BoardView>
      </div>
    </div>
    <div class="informations">
      <div v-if="!quiz.done" class="information">
        <span class="question">{{ t.findTheNextMove }}</span>
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
        <div v-if="sourceText" class="information">
          {{ t.sourceRecord }}: {{ sourceText }}
          <button v-if="canOpenSourceRecord" class="thin" @click="openSourceRecord()">
            {{ t.openRecord }}
          </button>
        </div>
      </template>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry.js";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { fileURLToCustomSchemeURL } from "@/common/url";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import DialogFrame from "./DialogFrame.vue";
import { useNextMoveQuizController } from "./next_move_quiz";

const emit = defineEmits<{
  close: [];
}>();

const appSettings = useAppSettings();
const dialogFrame = ref<InstanceType<typeof DialogFrame>>();
const maxSize = reactive(new RectSize(0, 0));

const {
  quiz,
  boardPosition,
  lastMove,
  flip,
  doFlip,
  onMove,
  candidateRows,
  actualMoveRow,
  sourceText,
  canOpenSourceRecord,
  openSourceRecord,
  showPV,
} = useNextMoveQuizController();

// ドラッグ中の駒ゴーストをダイアログ (トップレイヤー) 内に描画し、
// ダイアログより手前に表示されるようにする。
const ghostTeleportTarget = computed(() => dialogFrame.value?.dialog ?? "body");

const updateSize = () => {
  maxSize.width = window.innerWidth * 0.8;
  maxSize.height = window.innerHeight * 0.8 - 80;
};

onMounted(() => {
  updateSize();
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSize);
});

const onClose = () => {
  emit("close");
};
</script>

<style scoped>
.header {
  margin-bottom: 5px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}
.header-item {
  margin: 0 10px;
}
.board-view {
  display: flex;
  justify-content: center;
}
/* ドラッグ無効化 (mousedown.stop) を盤の領域に限定し、
   盤の左右の余白ではダイアログをドラッグできるようにする。 */
.board-frame {
  width: fit-content;
}
.control-row {
  width: 100%;
  height: 25%;
  margin: 0px;
}
.control-item {
  width: 50%;
  height: 100%;
  margin: 0px;
  font-size: 100%;
  padding: 0 5% 0 5%;
}
.control-item .icon {
  height: 80%;
  width: auto;
}
.control-item-wide {
  width: 100%;
  height: 19%;
  margin: 0px;
  font-size: 90%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  line-height: 200%;
  padding: 0 5% 0 5%;
}
.control-item-wide:not(:last-child) {
  margin-top: 1%;
}
.informations {
  height: 120px;
  width: 80vw;
  overflow-y: scroll;
  margin-left: auto;
  margin-right: auto;
  margin-top: 5px;
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
