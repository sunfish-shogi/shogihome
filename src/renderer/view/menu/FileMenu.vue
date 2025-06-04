<template>
  <div>
    <dialog v-if="!isInitialPositionMenuVisible && !isGameMenuVisible" ref="dialog" class="menu">
      <div class="group">
        <button data-hotkey="Escape" class="close" @click="onClose">
          <Icon :icon="IconType.CLOSE" />
          <div class="label">{{ t.back }}</div>
        </button>
      </div>
      <div v-if="isMobileWebApp()" class="group">
        <button @click="onFlip">
          <Icon :icon="IconType.FLIP" />
          <div class="label">{{ t.flipBoard }}</div>
        </button>
      </div>
      <div v-if="isMobileWebApp()" class="group">
        <button v-if="states.game" @click="onGame">
          <Icon :icon="IconType.GAME" />
          <div class="label">{{ t.game }}</div>
        </button>
        <button v-if="states.stopGame" @click="onStopGame">
          <Icon :icon="IconType.STOP" />
          <div class="label">{{ t.stopGame }}</div>
        </button>
      </div>
      <div class="group">
        <button :disabled="!states.newFile" @click="onNewFile">
          <Icon :icon="IconType.FILE" />
          <div class="label">{{ t.clear }}</div>
        </button>
        <button :disabled="!states.open" @click="onOpen">
          <Icon :icon="IconType.OPEN" />
          <div class="label">{{ t.open }}</div>
        </button>
        <button v-if="isNative()" :disabled="!states.save" @click="onSave">
          <Icon :icon="IconType.SAVE" />
          <div class="label">{{ t.saveOverwrite }}</div>
        </button>
        <button v-if="isNative()" :disabled="!states.saveAs" @click="onSaveAs">
          <Icon :icon="IconType.SAVE_AS" />
          <div class="label">{{ t.saveAs }}</div>
        </button>
        <div
          v-for="format of [
            RecordFileFormat.KIF,
            RecordFileFormat.KIFU,
            RecordFileFormat.KI2,
            RecordFileFormat.KI2U,
            RecordFileFormat.CSA,
            RecordFileFormat.JKF,
          ]"
          :key="format"
        >
          <button v-if="!isNative()" :disabled="!states.saveAs" @click="onSaveForWeb(format)">
            <Icon :icon="IconType.SAVE" />
            <div class="label">{{ format }}</div>
          </button>
        </div>
        <button v-if="isNative()" :disabled="!states.history" @click="onHistory">
          <Icon :icon="IconType.HISTORY" />
          <div class="label">{{ t.history }}</div>
        </button>
        <button v-if="isNative()" :disabled="!states.loadRemoteFile" @click="onLoadRemoteFile">
          <Icon :icon="IconType.INTERNET" />
          <div class="label">{{ t.loadRecordFromWeb }}</div>
        </button>
        <button :disabled="!states.share" @click="onShare">
          <Icon :icon="IconType.SHARE" />
          <div class="label">{{ t.share }}</div>
        </button>
        <button v-if="!isMobileWebApp()" :disabled="!states.exportImage" @click="onExportImage">
          <Icon :icon="IconType.GRID" />
          <div class="label">{{ t.positionImage }}</div>
        </button>
        <button v-if="isNative()" :disabled="!states.batchConversion" @click="onBatchConversion">
          <Icon :icon="IconType.BATCH" />
          <div class="label">{{ t.batchConversion }}</div>
        </button>
        <button v-if="isNative()" @click="onOpenAutoSaveDirectory">
          <Icon :icon="IconType.OPEN_FOLDER" />
          <div class="label">{{ t.openAutoSaveDirectory }}</div>
        </button>
      </div>
      <div class="group">
        <button @click="onCopyKIF">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsKIF }}</div>
        </button>
        <button @click="onCopyKI2">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsKI2 }}</div>
        </button>
        <button @click="onCopyCSA">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsCSA }}</div>
        </button>
        <button @click="onCopyJKF">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsJKF }}</div>
        </button>
        <button @click="onCopyUSI">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsUSI }}</div>
        </button>
        <button @click="onCopyUSEN">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsUSEN }}</div>
        </button>
        <button @click="onCopySFEN">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsSFEN }}</div>
        </button>
        <button @click="onCopyBOD">
          <Icon :icon="IconType.COPY" />
          <div class="label">{{ t.copyAsBOD }}</div>
        </button>
        <button :disabled="!states.paste" @click="onPaste">
          <Icon :icon="IconType.PASTE" />
          <div class="label">{{ t.paste }}</div>
        </button>
      </div>
      <div v-if="isMobileWebApp()" class="group">
        <button @click="onAppSettings">
          <Icon :icon="IconType.SETTINGS" />
          <div class="label">{{ t.appSettings }}</div>
        </button>
      </div>
      <div v-if="isMobileWebApp()" class="group">
        <button @click="openCopyright">
          <Icon :icon="IconType.LICENSE" />
          <div class="label">{{ t.license }}</div>
        </button>
      </div>
    </dialog>
    <InitialPositionMenu v-if="isInitialPositionMenuVisible" @close="emit('close')" />
    <MobileGameMenu v-if="isGameMenuVisible" @close="emit('close')" />
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useStore } from "@/renderer/store";
import { AppState } from "@/common/control/state.js";
import api, { isMobileWebApp, isNative } from "@/renderer/ipc/api";
import { useAppSettings } from "@/renderer/store/settings";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { openCopyright } from "@/renderer/helpers/copyright";
import { RecordFileFormat } from "@/common/file/record";
import InitialPositionMenu from "@/renderer/view/menu/InitialPositionMenu.vue";
import MobileGameMenu from "@/renderer/view/menu/MobileGameMenu.vue";

const emit = defineEmits<{
  close: [];
}>();

const store = useStore();
const appSettings = useAppSettings();
const dialog = ref();
const isInitialPositionMenuVisible = ref(false);
const isGameMenuVisible = ref(false);
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
const onFlip = () => {
  useAppSettings().flipBoard();
  emit("close");
};
const onGame = () => {
  isGameMenuVisible.value = true;
};
const onStopGame = () => {
  store.stopGame();
  emit("close");
};
const onNewFile = () => {
  if (isMobileWebApp()) {
    isInitialPositionMenuVisible.value = true;
  } else {
    store.resetRecord();
    emit("close");
  }
};
const onOpen = () => {
  store.openRecord();
  emit("close");
};
const onSave = () => {
  store.saveRecord({ overwrite: true });
  emit("close");
};
const onSaveAs = () => {
  store.saveRecord();
  emit("close");
};
const onSaveForWeb = (format: RecordFileFormat) => {
  store.saveRecord({ format });
  emit("close");
};
const onHistory = () => {
  store.showRecordFileHistoryDialog();
  emit("close");
};
const onLoadRemoteFile = () => {
  store.showLoadRemoteFileDialog();
  emit("close");
};
const onShare = () => {
  store.showShareDialog();
  emit("close");
};
const onBatchConversion = () => {
  store.showBatchConversionDialog();
  emit("close");
};
const onExportImage = () => {
  store.showExportBoardImageDialog();
  emit("close");
};
const onOpenAutoSaveDirectory = () => {
  api.openExplorer(appSettings.autoSaveDirectory);
  emit("close");
};
const onCopyKIF = () => {
  store.copyRecordKIF();
  emit("close");
};
const onCopyKI2 = () => {
  store.copyRecordKI2();
  emit("close");
};
const onCopyCSA = () => {
  store.copyRecordCSA();
  emit("close");
};
const onCopyJKF = () => {
  store.copyRecordJKF();
  emit("close");
};
const onCopyUSI = () => {
  store.copyRecordUSIAll();
  emit("close");
};
const onCopyUSEN = () => {
  store.copyRecordUSEN();
  emit("close");
};
const onCopySFEN = () => {
  store.copyBoardSFEN();
  emit("close");
};
const onCopyBOD = () => {
  store.copyBoardBOD();
  emit("close");
};
const onPaste = () => {
  store.showPasteDialog();
  emit("close");
};
const onAppSettings = () => {
  store.showAppSettingsDialog();
  emit("close");
};
const states = computed(() => {
  return {
    game: store.appState === AppState.NORMAL,
    stopGame: store.appState === AppState.GAME,
    newFile: store.appState === AppState.NORMAL,
    open: store.appState === AppState.NORMAL,
    save: store.appState === AppState.NORMAL,
    saveAs: store.appState === AppState.NORMAL,
    history: store.appState === AppState.NORMAL,
    loadRemoteFile: store.appState === AppState.NORMAL,
    share: store.appState === AppState.NORMAL,
    batchConversion: store.appState === AppState.NORMAL,
    exportImage: store.appState === AppState.NORMAL,
    paste: store.appState === AppState.NORMAL,
  };
});
</script>
