<template>
  <dialog ref="dialog" class="message-box">
    <div class="message-area">
      <Icon :icon="IconType.ERROR" />
      <div class="column">
        <div class="notice">
          {{ t.errorsOccurred(store.errors.length) }}
        </div>
        <div v-for="(error, index) in store.errors" :key="index" class="item">
          <p class="index">
            {{ index + 1 }}
            <span v-if="error.count >= 2">({{ error.count }} 回)</span>
          </p>
          <p class="message">{{ error.message }}</p>
        </div>
      </div>
    </div>
    <div>
      <button @click="copyMessage"><Icon :icon="IconType.COPY" />{{ t.copy }}</button>
    </div>
    <div class="main-buttons">
      <button autofocus data-hotkey="Escape" @click="onClose()">
        {{ t.close }}
      </button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useErrorStore } from "@/renderer/store/error";
const store = useErrorStore();
const dialog = ref();

onMounted(() => {
  showModalDialog(dialog.value, onClose);
  installHotKeyForDialog(dialog.value);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const copyMessage = () => {
  navigator.clipboard.writeText(
    store.errors.map((e) => (e.count === 1 ? e.message : `${e.message} (${e.count})`)).join("\n"),
  );
};

const onClose = () => {
  store.clear();
};
</script>

<style scoped>
.item {
  margin: 10px 0px 10px 0px;
}
.index {
  font-weight: bold;
  font-size: 0.8em;
  margin: 0px;
}
.message {
  font-size: 0.8em;
  margin: 0px;
}
</style>

<style scoped>
dialog {
  color: var(--error-dialog-color);
  background-color: var(--error-dialog-bg-color);
  border-color: var(--error-dialog-border-color);
}

dialog button {
  color: var(--error-dialog-button-color);
  background: linear-gradient(to top, var(--error-dialog-button-bg-color) 80%, white 140%);
}
dialog button:hover {
  background: linear-gradient(to top, var(--hovered-error-dialog-button-bg-color) 80%, white 140%);
}
dialog button .icon {
  margin-right: 0.5em;
}
</style>
