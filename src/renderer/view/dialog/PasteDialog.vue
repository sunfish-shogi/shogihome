<template>
  <div>
    <dialog ref="dialog">
      <div ref="content">
        <div class="form-group">
          <div class="message">{{ t.importingFollowingRecordOrPosition }}</div>
          <div class="message">{{ t.supportsKIF_KI2_CSA_USI_JKF }}</div>
          <div v-if="!isNative()" class="message">
            {{ t.plesePasteRecordIntoTextArea }}
          </div>
          <div v-if="!isNative()" class="message">
            {{ t.desktopVersionPastesAutomatically }}
          </div>
          <textarea ref="textarea"></textarea>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onOk">
          {{ t.import }}
        </button>
        <button data-hotkey="Escape" @click="onCancel">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { isNative } from "@/renderer/ipc/api";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";

const store = useStore();
const dialog = ref();
const textarea = ref();

store.retainBussyState();
onMounted(async () => {
  try {
    showModalDialog(dialog.value, onCancel);
    installHotKeyForDialog(dialog.value);
    if (isNative()) {
      textarea.value.value = await navigator.clipboard.readText();
    }
  } finally {
    store.releaseBussyState();
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onOk = () => {
  const data = textarea.value.value;
  if (!data) {
    store.pushError(new Error(t.emptyRecordInput));
    return;
  }
  store.closeModalDialog();
  store.pasteRecord(data);
};

const onCancel = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.message {
  width: 460px;
  text-align: left;
  font-size: 0.8em;
}
textarea {
  width: 460px;
  height: 60vh;
  min-height: 100px;
  resize: none;
}
</style>
