<template>
  <div>
    <dialog ref="dialog" class="menu">
      <div class="groups">
        <div class="group">
          <button data-hotkey="Escape" class="close" @click="onClose">
            <Icon :icon="IconType.CLOSE" />
            <div class="label">{{ t.back }}</div>
          </button>
        </div>
        <div class="group">
          <button @click="onLocalGame">
            <Icon :icon="IconType.GAME" />
            <div class="label">{{ t.offlineGame }}</div>
          </button>
          <button @click="onCSAGame">
            <Icon :icon="IconType.INTERNET" />
            <div class="label">{{ t.csaOnlineGame }}</div>
          </button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";

const emit = defineEmits<{
  close: [];
}>();

const store = useStore();
const dialog = ref();
const onClose = () => {
  emit("close");
};
onMounted(() => {
  showModalDialog(dialog.value, onClose);
  installHotKeyForDialog(dialog.value);
});
onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});
const onLocalGame = () => {
  store.showGameDialog();
  emit("close");
};
const onCSAGame = () => {
  store.showCSAGameDialog();
  emit("close");
};
</script>
