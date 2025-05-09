<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">{{ t.mateSearch }}</div>
      <div class="form-group">
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :default-tag="getPredefinedUSIEngineTag('mate')"
          :display-thread-state="true"
          :display-multi-pv-state="false"
          @update-engines="
            (val: USIEngines) => {
              engines = val;
            }
          "
        />
        <div class="form-item">
          <ToggleButton v-model:value="mateSearchSettings.enableMaxSeconds" />
          <div class="form-item-small-label">{{ t.toPrefix }}</div>
          <input
            v-model.number="mateSearchSettings.maxSeconds"
            class="number"
            type="number"
            min="1"
            :disabled="!mateSearchSettings.enableMaxSeconds"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart()">
          {{ t.startMateSearch }}
        </button>
        <button data-hotkey="Escape" @click="onCancel()">{{ t.cancel }}</button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { defaultMateSearchSettings, MateSearchSettings } from "@/common/settings/mate";
import { getPredefinedUSIEngineTag, USIEngines } from "@/common/settings/usi";
import api from "@/renderer/ipc/api";
import { useStore } from "@/renderer/store";
import { onMounted, ref } from "vue";
import PlayerSelector from "./PlayerSelector.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";

const store = useStore();
const busyState = useBusyState();
const engines = ref(new USIEngines());
const mateSearchSettings = ref<MateSearchSettings>(defaultMateSearchSettings());
const engineURI = ref("");

busyState.retain();

onMounted(async () => {
  try {
    mateSearchSettings.value = await api.loadMateSearchSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = mateSearchSettings.value.usi?.uri || "";
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const onStart = () => {
  if (!engineURI.value || !engines.value.hasEngine(engineURI.value)) {
    useErrorStore().add("エンジンを選択してください。");
    return;
  }
  const engine = engines.value.getEngine(engineURI.value);
  const newSettings: MateSearchSettings = {
    ...mateSearchSettings.value,
    usi: engine,
  };
  store.startMateSearch(newSettings);
};

const onCancel = () => {
  store.closeModalDialog();
};
</script>

<style scoped>
.root {
  width: 420px;
}
input.number {
  text-align: right;
  width: 80px;
}
</style>
