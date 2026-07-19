<template>
  <DialogFrame>
    <div class="root">
      <div class="title">{{ t.createNextMoveProblemCollection }}</div>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.files }}</div>
          <div>{{ progress?.processedFiles || 0 }} / {{ progress?.totalFiles || 0 }}</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.blunderCandidates }}</div>
          <div>{{ progress?.blunderCount || 0 }}</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.researchedPositions }}</div>
          <div>{{ progress?.researchedCount || 0 }}</div>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.adoptedProblems }}</div>
          <div>{{ progress?.adoptedCount || 0 }}</div>
        </div>
        <div class="form-item">
          <div class="current-file">{{ currentFileName }}</div>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Escape" @click="onStop()">
          {{ t.interrupt }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { basename } from "@/renderer/helpers/path";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();

const progress = computed(() => store.nextMoveGenerationProgress);

const currentFileName = computed(() => {
  const file = progress.value?.currentFile;
  return file ? basename(file) : "";
});

const onStop = () => {
  store.stopNextMoveGeneration();
};
</script>

<style scoped>
.root {
  width: 420px;
}
.current-file {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 80%;
}
</style>
