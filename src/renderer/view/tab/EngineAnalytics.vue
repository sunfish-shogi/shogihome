<template>
  <div>
    <div class="full column">
      <EngineAnalyticsElement
        v-for="monitor in monitors"
        :key="monitor.sessionID"
        :history-mode="historyMode"
        :monitor="monitor"
        :height="elementHeight"
        :show-header="showHeader"
        :show-time-column="showTimeColumn"
        :show-multi-pv-column="showMultiPvColumn"
        :show-depth-column="showDepthColumn"
        :show-nodes-column="showNodesColumn"
        :show-score-column="showScoreColumn"
        :show-play-button="showPlayButton"
        :show-play-button-label="showPlayButtonLabel"
        :show-suggestions-count="showSuggestionsCount"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { USIPlayerMonitor } from "@/renderer/store/usi";

const emptyMonitor = new USIPlayerMonitor(0, "");
</script>

<script setup lang="ts">
import { useStore } from "@/renderer/store";
import { computed } from "vue";
import EngineAnalyticsElement from "@/renderer/view/tab/EngineAnalyticsElement.vue";
import { RectSize } from "@/common/assets/geometry.js";

const props = defineProps({
  size: { type: RectSize, required: true },
  historyMode: { type: Boolean, required: true },
  showHeader: { type: Boolean, default: true },
  showTimeColumn: { type: Boolean, default: true },
  showMultiPvColumn: { type: Boolean, default: true },
  showDepthColumn: { type: Boolean, default: true },
  showNodesColumn: { type: Boolean, default: true },
  showScoreColumn: { type: Boolean, default: true },
  showPlayButton: { type: Boolean, default: true },
  showPlayButtonLabel: { type: Boolean, default: true },
  showSuggestionsCount: { type: Boolean, default: true },
});

const store = useStore();

const elementHeight = computed(() => {
  const rows = store.usiMonitors.length;
  return props.size.height / (rows || 1);
});

const monitors = computed(() => {
  if (store.usiMonitors.length === 0) {
    return [emptyMonitor];
  }
  return store.usiMonitors;
});
</script>
