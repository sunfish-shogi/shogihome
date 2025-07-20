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
          v-show="bottomUIType === BottomUIType.RECORD"
          :style="{
            width: `${windowSize.width}px`,
            height: `${bottomViewSize.height}px`,
          }"
          :show-top-control="false"
          :show-bottom-control="false"
          :show-elapsed-time="true"
          :show-comment="true"
        />
        <RecordComment
          v-if="showRecordViewOnBottom"
          v-show="bottomUIType === BottomUIType.COMMENT"
          :style="{
            width: `${windowSize.width}px`,
            height: `${bottomViewSize.height}px`,
          }"
        />
        <RecordInfo
          v-if="showRecordViewOnBottom"
          v-show="bottomUIType === BottomUIType.INFO"
          :size="bottomViewSize"
        />
        <HorizontalSelector
          v-if="showRecordViewOnBottom"
          v-model:value="bottomUIType"
          :items="[
            { label: t.record, value: BottomUIType.RECORD },
            { label: t.comments, value: BottomUIType.COMMENT },
            { label: t.recordProperties, value: BottomUIType.INFO },
          ]"
          :height="selectorHeight"
        />
      </div>
      <div
        v-if="!showRecordViewOnBottom"
        class="column"
        :style="{ width: `${windowSize.width - boardPaneSize.width}px` }"
      >
        <MobileControls :style="{ height: `${controlPaneHeight}px` }" />
        <RecordPane
          v-show="sideUIType === SideUIType.RECORD"
          :style="{ height: `${sideViewSize.height * 0.6}px` }"
          :show-top-control="false"
          :show-bottom-control="false"
          :show-elapsed-time="true"
          :show-comment="true"
        />
        <RecordComment
          v-show="sideUIType === SideUIType.RECORD"
          :style="{
            'margin-top': '5px',
            height: `${sideViewSize.height * 0.4 - 5}px`,
          }"
        />
        <RecordInfo v-show="sideUIType === SideUIType.INFO" :size="sideViewSize" />
        <HorizontalSelector
          v-model:value="sideUIType"
          :items="[
            { label: t.record, value: SideUIType.RECORD },
            { label: t.recordProperties, value: SideUIType.INFO },
          ]"
          :height="selectorHeight"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
enum BottomUIType {
  RECORD = "record",
  COMMENT = "comment",
  INFO = "info",
}
enum SideUIType {
  RECORD = "record",
  INFO = "info",
}
</script>

<script setup lang="ts">
import { RectSize } from "@/common/assets/geometry";
import { BoardLayoutType } from "@/common/settings/layout";
import { Lazy } from "@/renderer/helpers/lazy";
import BoardPane from "@/renderer/view/main/BoardPane.vue";
import RecordPane from "@/renderer/view/main/RecordPane.vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import MobileControls from "./MobileControls.vue";
import RecordComment from "@/renderer/view/tab/RecordComment.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { t } from "@/common/i18n";
import RecordInfo from "@/renderer/view/tab/RecordInfo.vue";
import { isIOS } from "@/renderer/helpers/env";

const lazyUpdateDelay = 80;
const selectorHeight = 30;
const minRecordViewWidth = 250;
const minRecordViewHeight = 130;

// iOS の多くのバージョンでは safe-area-inset-bottom が 21px になる。
// それ以外の環境もドロップシャドウの高さを考慮してマージンを持たせる。
const safeAreaMarginY = isIOS() ? 21 : 10;

const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight - safeAreaMarginY));
const bottomUIType = ref(BottomUIType.RECORD);
const sideUIType = ref(SideUIType.RECORD);

const windowLazyUpdate = new Lazy();
const updateSize = () => {
  windowLazyUpdate.after(() => {
    windowSize.width = window.innerWidth;
    windowSize.height = window.innerHeight - safeAreaMarginY;
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

const bottomViewSize = computed(() => {
  return new RectSize(
    windowSize.width,
    windowSize.height - boardPaneSize.value.height - controlPaneHeight.value - selectorHeight,
  );
});
const sideViewSize = computed(() => {
  return new RectSize(
    windowSize.width - boardPaneSize.value.width,
    windowSize.height - controlPaneHeight.value - selectorHeight,
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
