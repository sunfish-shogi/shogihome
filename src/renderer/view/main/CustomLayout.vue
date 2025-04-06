<template>
  <div>
    <div
      v-for="c in components"
      :key="`${c.type}.${c.index}`"
      class="component"
      :style="{ ...c.rect.style, ...c.style, zIndex: 1e5 - c.index }"
    >
      <BoardPane
        v-if="c.type === 'Board'"
        :max-size="c.rect.size"
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
          :size="c.rect.size"
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
        :size="c.rect.size"
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
      <RecordInfo v-else-if="c.type === 'RecordInfo'" class="full" :size="c.rect.size" />
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { LayoutProfile, BoardLayoutType, UIComponent } from "@/common/settings/layout";
import { computed } from "vue";
import { Rect } from "@/common/assets/geometry";
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

const props = defineProps<{ profile: LayoutProfile }>();

const appSettings = useAppSettings();

function componentStyle(c: UIComponent) {
  switch (c.type) {
    case "ControlGroup1":
    case "ControlGroup2":
      return {
        fontSize: `${Math.min((c.width - c.height * 0.2) * 0.2, c.height * 0.08)}px`,
      };
    default:
      return {};
  }
}

const components = computed(() => {
  return props.profile.components.map((c, i) => {
    return {
      ...c,
      index: i,
      rect: new Rect(c.left, c.top, c.width, c.height),
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
