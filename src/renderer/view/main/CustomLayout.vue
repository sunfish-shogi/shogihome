<template>
  <div>
    <div
      v-for="c in components"
      :key="`${c.type}.${c.index}`"
      class="component"
      :style="{ ...c.style, zIndex: 1e5 - c.index }"
    >
      <BoardPane
        v-if="c.type === 'Board'"
        :max-size="c.size"
        :left-control-type="
          c.leftControlBox ? LeftSideControlType.STANDARD : LeftSideControlType.NONE
        "
        :right-control-type="
          c.rightControlBox ? RightSideControlType.STANDARD : RightSideControlType.NONE
        "
        :layout-type="c.layoutType || BoardLayoutType.STANDARD"
      />
      <RecordPane
        v-else-if="c.type === 'Record'"
        class="full"
        :show-comment="!!c.showCommentColumn"
        :show-elapsed-time="!!c.showElapsedTimeColumn"
        :show-top-control="!!c.topControlBox"
        :show-bottom-control="false"
        :show-branches="!!c.branches"
      />
      <BookPanel v-else-if="c.type === 'Book'" class="full" />
      <div v-else-if="c.type === 'Analytics'" class="full tab-content">
        <EngineAnalytics
          :size="c.size"
          :history-mode="!!c.historyMode"
          :show-header="!!c.showHeader"
          :show-time-column="!!c.showTimeColumn"
          :show-multi-pv-column="!!c.showMultiPvColumn"
          :show-depth-column="!!c.showDepthColumn"
          :show-nodes-column="!!c.showNodesColumn"
          :show-score-column="!!c.showScoreColumn"
          :show-play-button="!!c.showPlayButton"
          :show-suggestions-count="!!c.showSuggestionsCount"
        />
      </div>
      <EvaluationChart
        v-else-if="c.type === 'Chart'"
        :size="c.size"
        :type="c.chartType"
        :thema="appSettings.thema"
        :coefficient-in-sigmoid="appSettings.coefficientInSigmoid"
        :show-legend="!!c.showLegend"
      />
      <RecordComment
        v-else-if="c.type === 'Comment'"
        class="full"
        :show-bookmark="!!c.showBookmark"
      />
      <RecordInfo v-else-if="c.type === 'RecordInfo'" class="full" :size="c.size" />
      <ControlPane
        v-else-if="c.type === 'ControlGroup1'"
        class="full"
        :group="ControlGroup.Group1"
      />
      <ControlPane
        v-else-if="c.type === 'ControlGroup2'"
        class="full"
        :group="ControlGroup.Group2"
      />
      <SimpleBoardView
        v-else-if="c.type === 'SimpleBoard'"
        :max-size="c.size"
        :position="store.record.position"
        :black-name="getBlackPlayerNamePreferShort(store.record.metadata)"
        :white-name="getWhitePlayerNamePreferShort(store.record.metadata)"
        :header="c.bookmark ? store.record.current.bookmark : ''"
        :footer="store.record.current.comment"
        :last-move="
          store.record.current.move instanceof Move ? store.record.current.move : undefined
        "
        typeface="mincho"
        :font-weight="c.fontWeight === PositionImageFontWeight.W700X ? 700 : 400"
        :text-shadow="c.fontWeight !== PositionImageFontWeight.W400"
        :character-y="c.characterY || 0"
        :font-scale="(c.fontScale || 100) / 100"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  LayoutProfile,
  BoardLayoutType,
  UIComponent,
  PositionImageFontWeight,
} from "@/common/settings/layout";
import { computed } from "vue";
import { Rect, RectSize } from "@/common/assets/geometry";
import { LeftSideControlType, RightSideControlType } from "@/common/settings/app";
import BoardPane from "./BoardPane.vue";
import RecordPane from "./RecordPane.vue";
import EngineAnalytics from "@/renderer/view/tab/EngineAnalytics.vue";
import EvaluationChart from "@/renderer/view/tab/EvaluationChart.vue";
import ControlPane, { ControlGroup } from "./ControlPane.vue";
import { useAppSettings } from "@/renderer/store/settings";
import RecordComment from "@/renderer/view/tab/RecordComment.vue";
import RecordInfo from "@/renderer/view/tab/RecordInfo.vue";
import BookPanel from "./BookPanel.vue";
import SimpleBoardView from "@/renderer/view/primitive/SimpleBoardView.vue";
import { useStore } from "@/renderer/store";
import { getBlackPlayerNamePreferShort, getWhitePlayerNamePreferShort, Move } from "tsshogi";

const props = defineProps<{ profile: LayoutProfile }>();

const appSettings = useAppSettings();
const store = useStore();

function componentStyle(c: UIComponent) {
  const rect = new Rect(c.left, c.top, c.width, c.height);
  switch (c.type) {
    case "Board":
    case "SimpleBoard":
      // アスペクト比が決まっているものは左上座標のみを指定
      return {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
      };
    case "ControlGroup1":
    case "ControlGroup2":
      return {
        ...rect.style,
        fontSize: `${Math.min((c.width - c.height * 0.2) * 0.2, c.height * 0.08)}px`,
      };
    default:
      return {
        ...rect.style,
      };
  }
}

const components = computed(() => {
  return props.profile.components.map((c, i) => {
    return {
      ...c,
      index: i,
      size: new RectSize(c.width, c.height),
      style: componentStyle(c),
    };
  });
});
</script>

<style scoped>
.component {
  position: absolute;
}
.tab-content {
  color: var(--text-color);
  background-color: var(--tab-content-bg-color);
}
</style>
