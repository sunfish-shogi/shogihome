<template>
  <DialogFrame @cancel="onCancel">
    <div class="form-group column">
      <div class="message">{{ t.importingFollowingRecordOrPosition }}</div>
      <div class="message">{{ t.supportsKIF_KI2_CSA_USI_SFEN_JKF_USEN }}</div>
      <div v-if="!isNative()" class="message">
        {{ t.pleasePasteRecordIntoTextArea }}
      </div>
      <div v-if="!isNative()" class="message">
        {{ t.desktopVersionPastesAutomatically }}
      </div>
      <textarea ref="textarea"></textarea>
      <HorizontalSelector
        v-model:value="mode"
        :items="[
          { label: t.asNewFile, value: 'standard' },
          { label: t.mergeToRootPosition, value: 'mergeIntoRoot' },
          { label: t.mergeToCurrentPosition, value: 'mergeIntoCurrent' },
        ]"
      />
      <ToggleButton
        v-if="isNative() && mode === 'standard'"
        v-model:value="doNotShowAgain"
        :label="t.doNotShowAgain"
      />
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="onOk">
        {{ t.import }}
      </button>
      <button data-hotkey="Escape" @click="onCancel">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { isNative } from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import { onMounted, ref } from "vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import { useAppSettings } from "@/renderer/store/settings";
import DialogFrame from "./DialogFrame.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";

const store = useStore();
const appSettings = useAppSettings();
const busyState = useBusyState();
const textarea = ref();
const doNotShowAgain = ref(false);
const mode = ref<"standard" | "mergeIntoRoot" | "mergeIntoCurrent">("standard");

busyState.retain();
onMounted(async () => {
  try {
    if (isNative()) {
      textarea.value.value = await navigator.clipboard.readText();
    }
  } finally {
    busyState.release();
  }
});

const onOk = () => {
  const data = textarea.value.value;
  if (!data) {
    useErrorStore().add(new Error(t.emptyRecordInput));
    return;
  }
  store.closeModalDialog();
  store.pasteRecord(data, mode.value);
  if (doNotShowAgain.value && mode.value === "standard") {
    appSettings.updateAppSettings({ showPasteDialog: false });
  }
};

const onCancel = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.form-group > * {
  width: 80vw;
  max-width: 460px;
}
.message {
  text-align: left;
  font-size: 0.8em;
}
textarea {
  height: 60vh;
  min-height: 100px;
  resize: none;
}
</style>
