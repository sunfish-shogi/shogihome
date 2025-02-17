<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.mateSearch }}</div>
      <div class="form-group scroll">
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :filter-label="USIEngineLabel.MATE"
          :display-thread-state="true"
          :display-multi-pv-state="false"
          @update-engines="
            (val: USIEngines) => {
              engines = val;
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
import { MateSearchSettings } from "@/common/settings/mate";
import { USIEngineLabel, USIEngines } from "@/common/settings/usi";
import { showModalDialog } from "@/renderer/helpers/dialog";
import api from "@/renderer/ipc/api";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import PlayerSelector from "./PlayerSelector.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";

const store = useStore();
const busyState = useBusyState();
const dialog = ref();
const engines = ref(new USIEngines());
const engineURI = ref("");

busyState.retain();

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
  try {
    const mateSearchSettings = await api.loadMateSearchSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = mateSearchSettings.usi?.uri || "";
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value);
});

const onStart = () => {
  if (!engineURI.value || !engines.value.hasEngine(engineURI.value)) {
    useErrorStore().add("エンジンを選択してください。");
    return;
  }
  const engine = engines.value.getEngine(engineURI.value);
  const mateSearchSettings: MateSearchSettings = {
    usi: engine,
  };
  store.startMateSearch(mateSearchSettings);
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
