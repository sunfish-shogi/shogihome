<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.mateSearch }}</div>
      <div class="form-group scroll">
        <PlayerSelector
          :player-uri="engineURI"
          :engine-settings="engineSettings"
          :filter-label="USIEngineLabel.MATE"
          :display-thread-state="true"
          :display-multi-pv-state="false"
          @update-engine-setting="
            (settings: USIEngineSettings) => {
              engineSettings = settings;
            }
          "
          @select-player="
            (uri: string) => {
              engineURI = uri;
            }
          "
        />
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart()">
          {{ t.startMateSearch }}
        </button>
        <button data-hotkey="Escape" @click="onCancel()">{{ t.cancel }}</button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { MateSearchSetting } from "@/common/settings/mate";
import { USIEngineLabel, USIEngineSettings } from "@/common/settings/usi";
import { showModalDialog } from "@/renderer/helpers/dialog";
import api from "@/renderer/ipc/api";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import PlayerSelector from "./PlayerSelector.vue";

const store = useStore();
const dialog = ref();
const engineSettings = ref(new USIEngineSettings());
const engineURI = ref("");

store.retainBussyState();

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
  try {
    const mateSearchSetting = await api.loadMateSearchSetting();
    engineSettings.value = await api.loadUSIEngineSetting();
    engineURI.value = mateSearchSetting.usi?.uri || "";
  } catch (e) {
    store.pushError(e);
    store.destroyModalDialog();
  } finally {
    store.releaseBussyState();
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onStart = () => {
  if (!engineURI.value || !engineSettings.value.hasEngine(engineURI.value)) {
    store.pushError("エンジンを選択してください。");
    return;
  }
  const engine = engineSettings.value.getEngine(engineURI.value);
  const mateSearchSetting: MateSearchSetting = {
    usi: engine,
  };
  store.startMateSearch(mateSearchSetting);
};

const onCancel = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.root {
  width: 420px;
}
</style>
