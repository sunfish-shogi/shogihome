<template>
  <dialog ref="dialog" class="message-box" :style="dragStyle" @mousedown="onDragMouseDown">
    <div class="message-area">
      <Icon :icon="IconType.QUESTION" />
      <div class="message">{{ store.message }}</div>
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="onOk()">OK</button>
      <button data-hotkey="Escape" @click="onClose()">
        {{ t.cancel }}
      </button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { useDraggableDialog } from "@/renderer/helpers/draggable";
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useConfirmationStore } from "@/renderer/store/confirm";

const store = useConfirmationStore();
const dialog = ref<HTMLDialogElement>();

const { dragStyle, onDragMouseDown } = useDraggableDialog(dialog);

const onOk = () => {
  store.ok();
};

const onClose = () => {
  store.cancel();
};

onMounted(() => {
  showModalDialog(dialog.value!, onClose);
  installHotKeyForDialog(dialog.value!);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
});
</script>
