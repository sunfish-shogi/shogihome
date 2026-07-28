<template>
  <div class="batch-analysis-progress">
    <div class="progress-header">
      <span>{{ t.batchAnalysis }}</span>
      <span>{{ t.files }}: {{ progress?.current || 0 }} / {{ progress?.total || 0 }}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-value" :style="{ width: completedPercentage }"></div>
    </div>
    <div class="current-file" :title="progress?.path">{{ currentFileName }}</div>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed } from "vue";
import { useStore } from "@/renderer/store";
import { basename } from "@/renderer/helpers/path";

const store = useStore();

const progress = computed(() => store.batchAnalysisProgress);

const currentFileName = computed(() => {
  const path = progress.value?.path;
  return path ? basename(path) : "";
});

// 処理中のファイルは未完了として扱う。
const completedPercentage = computed(() => {
  const value = progress.value;
  if (!value || value.total <= 0) {
    return "0%";
  }
  return `${((value.current - 1) / value.total) * 100}%`;
});
</script>

<style scoped>
.batch-analysis-progress {
  padding: 4px;
  margin-top: 4px;
  background-color: var(--text-bg-color);
  color: var(--text-color);
}
.progress-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.85em;
}
.progress-bar {
  width: 100%;
  height: 6px;
  margin: 4px 0;
  background-color: var(--text-bg-color-disabled);
}
.progress-bar-value {
  height: 100%;
  background-color: var(--control-button-bg-color);
}
.current-file {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 0.85em;
}
</style>
