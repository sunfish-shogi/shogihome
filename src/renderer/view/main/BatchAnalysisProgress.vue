<template>
  <div class="batch-analysis-progress">
    <div class="progress-header">
      <span>{{ t.batchAnalysis }}</span>
      <span>{{ t.success }}: {{ progress?.successTotal }}</span>
      <span>{{ t.failed }}: {{ progress?.failedTotal }}</span>
      <span>{{ t.skipped }}: {{ progress?.skippedTotal }}</span>
    </div>
    <PercentageBarChart
      class="progress-bar"
      :value="progress ? progress.current - 1 : 0"
      :max="progress?.total ?? 1"
    />
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed } from "vue";
import { useStore } from "@/renderer/store";
import PercentageBarChart from "@/renderer/view/primitive/PercentageBarChart.vue";

const store = useStore();
const progress = computed(() => store.batchAnalysisProgress);
</script>

<style scoped>
.batch-analysis-progress {
  padding: 4px 8px;
  margin-top: 4px;
  background-color: var(--text-bg-color);
  color: var(--text-color);
}
.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
}
.progress-bar {
  margin: 4px 0;
  width: 100%;
  border: 1px solid var(--dialog-border-color);
}
</style>
