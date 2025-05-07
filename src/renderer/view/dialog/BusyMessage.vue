<template>
  <dialog ref="dialog" class="message-box">
    <div class="message-area">
      <Icon :icon="IconType.BUSY" />
      <div class="message">{{ t.processingPleaseWait }}</div>
    </div>
    <div v-if="progressPercent">{{ progressPercent }}%</div>
  </dialog>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { computed, onMounted, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useBusyState } from "@/renderer/store/busy";

const busyState = useBusyState();
const dialog = ref();

onMounted(() => {
  showModalDialog(dialog.value);
});

const progressPercent = computed(() => {
  return busyState.progress != undefined ? (busyState.progress * 100).toFixed(1) : null;
});
</script>

<style scoped>
dialog {
  color: var(--busy-dialog-color);
  background-color: var(--busy-dialog-bg-color);
  border-color: var(--busy-dialog-border-color);
}
</style>
