<template>
  <DialogFrame limited @cancel="onClose">
    <div class="title">{{ t.elapsedTimeChart }}</div>
    <div class="content">
      <div class="board-area">
        <SimpleBoardView
          :max-size="boardMaxSize"
          :position="selectedPosition"
          :last-move="selectedLastMove"
        />
        <div class="board-info">
          {{ selectedMoveText }}
        </div>
      </div>
      <div class="chart-area">
        <ElapsedTimeChart
          :thema="appSettings.thema"
          :record="store.record"
          :show-legend="true"
          @click-ply="(ply) => store.changePly(ply)"
        />
      </div>
    </div>
    <div class="main-buttons">
      <button :data-hotkey="shortcutKeys.Begin" @click="store.changePly(0)">
        <Icon :icon="IconType.FIRST" />
      </button>
      <button :data-hotkey="shortcutKeys.Back" @click="store.goBack()">
        <Icon :icon="IconType.BACK" />
      </button>
      <button :data-hotkey="shortcutKeys.Forward" @click="store.goForward()">
        <Icon :icon="IconType.NEXT" />
      </button>
      <button :data-hotkey="shortcutKeys.End" @click="store.changePly(Number.MAX_SAFE_INTEGER)">
        <Icon :icon="IconType.LAST" />
      </button>
      <button autofocus data-hotkey="Escape" @click="onClose">{{ t.close }}</button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Move, ImmutablePosition } from "tsshogi";
import { useStore } from "@/renderer/store";
import { useAppSettings } from "@/renderer/store/settings";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry";
import DialogFrame from "./DialogFrame.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";
import ElapsedTimeChart from "@/renderer/view/primitive/ElapsedTimeChart.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";

const store = useStore();
const appSettings = useAppSettings();
const boardMaxSize = new RectSize(200, 200);

const shortcutKeys = computed(() => getRecordShortcutKeys(appSettings.recordShortcutKeys));

const selectedPosition = computed<ImmutablePosition>(() => store.record.position);

const selectedLastMove = computed(() => {
  const move = store.record.current.move;
  return move instanceof Move ? move : null;
});

const selectedMoveText = computed(() => {
  const node = store.record.current;
  const plyText = `${t.plyPrefix}${node.ply}${t.plySuffix}`;
  const timeText =
    node.elapsedMs > 0 ? `${(node.elapsedMs / 1000).toFixed(1)}${t.secondsSuffix}` : "";
  return `${plyText} ${node.displayText} ${timeText}`;
});

const onClose = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
:deep(.frame) {
  width: 90vw;
  height: 90vh;
}
.title {
  font-size: 1.2em;
  font-weight: bold;
  text-align: center;
  margin-bottom: 10px;
}
.content {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 15px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.chart-area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.board-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.board-info {
  margin-top: 5px;
  font-size: 0.9em;
  text-align: center;
  white-space: nowrap;
}
</style>
