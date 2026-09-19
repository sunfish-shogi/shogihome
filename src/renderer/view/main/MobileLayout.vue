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
          v-show="bottomUIType === BottomUIType.RECORD || bottomUIType === BottomUIType.BRANCH_TREE"
          :style="{
            width: `${windowSize.width}px`,
            height: `${bottomViewSize.height}px`,
          }"
          :show-top-control="false"
          :show-bottom-control="false"
          :show-elapsed-time="true"
          :show-comment="true"
          :show-branch-tree="bottomUIType === BottomUIType.BRANCH_TREE"
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
        <div
          v-if="showRecordViewOnBottom && showSearchTab"
          v-show="bottomUIType === BottomUIType.SEARCH"
          class="column"
          :style="{
            width: `${windowSize.width}px`,
            height: `${bottomViewSize.height}px`,
          }"
        >
          <EngineAnalytics
            class="search-view"
            :style="{ height: `${bottomSearchView.analytics.height}px` }"
            :size="bottomSearchView.analytics"
            v-bind="searchTabProps"
          />
          <EvaluationChart
            v-if="bottomSearchView.chart && bottomUIType === BottomUIType.SEARCH"
            :size="bottomSearchView.chart"
            v-bind="searchTabChartProps"
          />
        </div>
        <HorizontalSelector
          v-if="showRecordViewOnBottom"
          v-model:value="bottomUIType"
          :items="bottomUIItems"
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
          v-show="sideUIType === SideUIType.RECORD || sideUIType === SideUIType.BRANCH_TREE"
          :style="{
            height: `${
              sideUIType === SideUIType.BRANCH_TREE
                ? sideViewSize.height
                : sideViewSize.height * 0.6
            }px`,
          }"
          :show-top-control="false"
          :show-bottom-control="false"
          :show-elapsed-time="true"
          :show-comment="true"
          :show-branch-tree="sideUIType === SideUIType.BRANCH_TREE"
        />
        <RecordComment
          v-show="sideUIType === SideUIType.RECORD"
          :style="{
            'margin-top': '5px',
            height: `${sideViewSize.height * 0.4 - 5}px`,
          }"
        />
        <RecordInfo v-show="sideUIType === SideUIType.INFO" :size="sideViewSize" />
        <div
          v-if="showSearchTab"
          v-show="sideUIType === SideUIType.SEARCH"
          class="column"
          :style="{ height: `${sideViewSize.height}px` }"
        >
          <EngineAnalytics
            class="search-view"
            :style="{ height: `${sideSearchView.analytics.height}px` }"
            :size="sideSearchView.analytics"
            v-bind="searchTabProps"
          />
          <EvaluationChart
            v-if="sideSearchView.chart && sideUIType === SideUIType.SEARCH"
            :size="sideSearchView.chart"
            v-bind="searchTabChartProps"
          />
        </div>
        <HorizontalSelector
          v-model:value="sideUIType"
          :items="sideUIItems"
          :height="selectorHeight"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
enum BottomUIType {
  RECORD = "record",
  BRANCH_TREE = "branchTree",
  COMMENT = "comment",
  INFO = "info",
  SEARCH = "search",
}
enum SideUIType {
  RECORD = "record",
  BRANCH_TREE = "branchTree",
  INFO = "info",
  SEARCH = "search",
}
</script>

<script setup lang="ts">
import { RectSize } from "@/common/assets/geometry";
import { BoardLayoutType, EvaluationChartType } from "@/common/settings/layout";
import { Lazy } from "@/common/helpers/lazy";
import BoardPane from "@/renderer/view/main/BoardPane.vue";
import RecordPane from "@/renderer/view/main/RecordPane.vue";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import MobileControls from "./MobileControls.vue";
import RecordComment from "@/renderer/view/tab/RecordComment.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { t } from "@/common/i18n";
import RecordInfo from "@/renderer/view/tab/RecordInfo.vue";
import EngineAnalytics from "@/renderer/view/tab/EngineAnalytics.vue";
import EvaluationChart from "@/renderer/view/tab/EvaluationChart.vue";
import { useAppSettings } from "@/renderer/store/settings";
import { isIOS } from "@/renderer/helpers/env";
import { IconType } from "@/renderer/assets/icons";
import { buildProfile } from "virtual:shogihome/build-profile";

const lazyUpdateDelay = 80;
const selectorHeight = 30;
const minRecordViewWidth = 250;
const minRecordViewHeight = 130;
const minChartHeight = 80;

// iOS の多くのバージョンでは safe-area-inset-bottom が 21px になる。
// それ以外の環境もドロップシャドウの高さを考慮してマージンを持たせる。
const safeAreaMarginY = isIOS() ? 21 : 10;

// 「思考」タブ (エンジンの読み筋) を出すかどうか。
//
// モバイルの UI は画面が狭く、既定では出さない。WebAssembly エンジンを足した版を
// 作る場合に、ビルドプロファイルで有効にする (specs/build-profile.md)。
const showSearchTab = buildProfile.features.mobileSearchTab;

// 狭い画面に収めるため、列は読み筋の判断に要るものだけに絞る。
// 検討中に開くものなので、指し手を送るボタンも出さない。
const searchTabProps = {
  historyMode: false,
  showHeader: false,
  showTimeColumn: false,
  showNodesColumn: false,
  showPlayButton: false,
};

const appSettings = useAppSettings();

// 評価値グラフは生の評価値のみを出す。勝率換算は別に場所を要するので置かない。
// 凡例も画面の幅に対して大きいため出さない。
const searchTabChartProps = computed(() => ({
  type: EvaluationChartType.RAW,
  thema: appSettings.thema,
  coefficientInSigmoid: appSettings.coefficientInSigmoid,
  showLegend: false,
}));

const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight - safeAreaMarginY));
const bottomUIType = ref(BottomUIType.RECORD);
const sideUIType = ref(SideUIType.RECORD);

const bottomUIItems = computed(() => [
  { label: t.record, icon: IconType.DESCRIPTION, value: BottomUIType.RECORD },
  { label: t.tree, icon: IconType.TREE, value: BottomUIType.BRANCH_TREE },
  { label: t.comments, icon: IconType.COMMENT, value: BottomUIType.COMMENT },
  { label: t.recordProperties, icon: IconType.INFO, value: BottomUIType.INFO },
  ...(showSearchTab
    ? [{ label: t.searchLog, icon: IconType.BRAIN, value: BottomUIType.SEARCH }]
    : []),
]);
const sideUIItems = computed(() => [
  { label: t.record, icon: IconType.DESCRIPTION, value: SideUIType.RECORD },
  { label: t.tree, icon: IconType.TREE, value: SideUIType.BRANCH_TREE },
  { label: t.recordProperties, icon: IconType.INFO, value: SideUIType.INFO },
  ...(showSearchTab
    ? [{ label: t.searchLog, icon: IconType.BRAIN, value: SideUIType.SEARCH }]
    : []),
]);

const windowLazyUpdate = new Lazy();
const updateSize = () => {
  windowLazyUpdate.after(() => {
    windowSize.width = window.innerWidth;
    windowSize.height = window.innerHeight - safeAreaMarginY;
  }, lazyUpdateDelay);
};

const showRecordViewOnBottom = computed(() => windowSize.height >= windowSize.width);
const controlPaneHeight = computed(() => {
  if (showRecordViewOnBottom.value) {
    return windowSize.height * 0.06;
  } else {
    return windowSize.height * 0.1;
  }
});
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
    return windowSize.width < windowSize.height * 0.59
      ? BoardLayoutType.PORTRAIT_SQUARE
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

// 「思考」タブは上に読み筋、下に評価値グラフを並べる。
// ただしグラフは高さを確保できないと目盛りが潰れて読めないため、
// 足りない画面では出さず、読み筋に全てを充てる。
//
// グラフは選択中だけ描画する (v-show ではなく v-if)。棋譜の更新を購読していて、
// 隠れていても局面が進むたびに描き直してしまうため。
const splitSearchView = (size: RectSize) => {
  const chartHeight = Math.floor(size.height / 2);
  if (chartHeight < minChartHeight) {
    return { analytics: size, chart: undefined };
  }
  return {
    analytics: new RectSize(size.width, size.height - chartHeight),
    chart: new RectSize(size.width, chartHeight),
  };
};
const bottomSearchView = computed(() => splitSearchView(bottomViewSize.value));
const sideSearchView = computed(() => splitSearchView(sideViewSize.value));

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
/* EngineAnalytics は文字色と背景を親からもらう作りになっている
   (TabPane / CustomLayout の .tab-content と同じ)。指定しないと文字が見えない。 */
.search-view {
  color: var(--text-color);
  background-color: var(--tab-content-bg-color);
}
</style>
