<template>
  <div class="root full" :class="appSettings.thema">
    <MonitorView :size="windowSize" />
    <ErrorMessage v-if="errorStore.hasError" />
    <ConfirmDialog v-if="confirmation.message" />
  </div>
</template>

<script setup lang="ts">
import { RectSize } from "@/common/assets/geometry";
import { Lazy } from "@/common/helpers/lazy";
import { useAppSettings } from "@/renderer/store/settings";
import MonitorView from "@/renderer/view/monitor/MonitorView.vue";
import { onMounted, onUnmounted, reactive } from "vue";
import ErrorMessage from "@/renderer/view/dialog/ErrorMessage.vue";
import ConfirmDialog from "@/renderer/view/dialog/ConfirmDialog.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useConfirmationStore } from "@/renderer/store/confirm";

const lazyUpdateDelay = 100;

const appSettings = useAppSettings();
const errorStore = useErrorStore();
const confirmation = useConfirmationStore();
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));

const windowLazyUpdate = new Lazy();
const updateSize = () => {
  windowLazyUpdate.after(() => {
    windowSize.width = window.innerWidth;
    windowSize.height = window.innerHeight;
  }, lazyUpdateDelay);
};

onMounted(() => {
  window.addEventListener("resize", updateSize);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateSize);
});
</script>

<style scoped>
.root {
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
</style>
