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
      <ToggleButton v-if="isNative()" v-model:value="doNotShowAgain" :label="t.doNotShowAgain" />
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

const store = useStore();
const appSettings = useAppSettings();
const busyState = useBusyState();
const textarea = ref();
const doNotShowAgain = ref(false);

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
  store.pasteRecord(data);
  if (doNotShowAgain.value) {
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
