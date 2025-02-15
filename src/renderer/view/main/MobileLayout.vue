<template>
  <div class="full">
    <div class="full row">
      <div class="column">
        <BoardPane
          :max-size="boardPaneMaxSize"
          :layout-type="boardLayoutType"
          @resize="onBoardPaneResize"
        />
        <MobileControls
          v-if="showRecordViewOnBottom"
          :style="{ height: `${controlPaneHeight}px` }"
        />
        <RecordPane
          v-if="showRecordViewOnBottom"
          v-show="!commentEditorMode"
          :style="{
            width: `${windowSize.width}px`,
            height: `${bottomRecordViewSize.height - toggleHeight}px`,
          }"
          :show-top-control="false"
          :show-bottom-control="false"
          :show-elapsed-time="true"
          :show-comment="true"
        />
        <RecordComment
          v-if="showRecordViewOnBottom"
          v-show="commentEditorMode"
          :style="{
            width: `${windowSize.width}px`,
            height: `${bottomRecordViewSize.height - toggleHeight}px`,
          }"
        />
        <ToggleButton
          v-if="showRecordViewOnBottom"
          v-model:value="commentEditorMode"
          label="コメント編集モード"
          :height="toggleHeight"
        />
      </div>
      <div
        v-if="!showRecordViewOnBottom"
        class="column"
        :style="{ width: `${windowSize.width - boardPaneSize.width}px` }"
      >
        <MobileControls :style="{ height: `${controlPaneHeight}px` }" />
        <RecordPane
          :style="{ height: `${(windowSize.height - controlPaneHeight) * 0.6}px` }"
          :show-top-control="false"
          :show-bottom-control="false"
          :show-elapsed-time="true"
          :show-comment="true"
        />
        <RecordComment
          :style="{
            'margin-top': '5px',
            height: `${(windowSize.height - controlPaneHeight) * 0.4 - 5}px`,
          }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RectSize } from "@/common/assets/geometry";
import { BoardLayoutType } from "@/common/settings/layout";
import { Lazy } from "@/renderer/helpers/lazy";
import BoardPane from "@/renderer/view/main/BoardPane.vue";
import RecordPane from "@/renderer/view/main/RecordPane.vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import MobileControls from "./MobileControls.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import RecordComment from "@/renderer/view/tab/RecordComment.vue";

const lazyUpdateDelay = 80;
const toggleHeight = 24;
const minRecordViewWidth = 250;
const minRecordViewHeight = 130;

const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));
const commentEditorMode = ref(false);

const windowLazyUpdate = new Lazy();
const updateSize = () => {
  windowLazyUpdate.after(() => {
    windowSize.width = window.innerWidth;
    windowSize.height = window.innerHeight;
  }, lazyUpdateDelay);
};

const showRecordViewOnBottom = computed(() => windowSize.height >= windowSize.width);
const controlPaneHeight = computed(() =>
  Math.min(windowSize.height * 0.08, windowSize.width * 0.12),
);
const boardPaneMaxSize = computed(() => {
  const maxSize = new RectSize(windowSize.width, windowSize.height);
  if (showRecordViewOnBottom.value) {
    maxSize.height -= controlPaneHeight.value + minRecordViewHeight;
  } else {
    maxSize.width -= minRecordViewWidth;
  }
  return maxSize;
});
const boardLayoutType = computed(() => {
  if (showRecordViewOnBottom.value) {
    return windowSize.width < windowSize.height * 0.57
      ? BoardLayoutType.PORTRAIT
      : BoardLayoutType.COMPACT;
  } else {
    return windowSize.width < windowSize.height * 1.77
      ? BoardLayoutType.PORTRAIT
      : BoardLayoutType.COMPACT;
  }
});

const boardPaneSize = ref(windowSize);
const onBoardPaneResize = (size: RectSize) => {
  boardPaneSize.value = size;
};

const bottomRecordViewSize = computed(() => {
  return new RectSize(
    windowSize.width,
    windowSize.height - boardPaneSize.value.height - controlPaneHeight.value,
  );
});

onMounted(() => {
  window.addEventListener("resize", updateSize);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateSize);
});
</script>

<style scoped>
.controls button {
  font-size: 100%;
  width: 100%;
  height: 100%;
}
.controls button .icon {
  height: 68%;
}
</style>
