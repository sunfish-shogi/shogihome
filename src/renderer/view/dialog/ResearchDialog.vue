<template>
  <div>
    <dialog ref="dialog" class="root">
      <div class="title">{{ t.research }}</div>
      <div class="form-group">
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :filter-label="USIEngineLabel.RESEARCH"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
      </div>
      <div v-for="(_, index) in secondaryEngineURIs" :key="index" class="form-group">
        <PlayerSelector
          v-model:player-uri="secondaryEngineURIs[index]"
          :engines="engines"
          :filter-label="USIEngineLabel.RESEARCH"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
        <button class="remove-button" @click="secondaryEngineURIs.splice(index, 1)">
          {{ t.remove }}
        </button>
      </div>
      <button class="center thin" @click="secondaryEngineURIs.push('')">
        <Icon :icon="IconType.ADD" />
        {{ t.addNthEngine(secondaryEngineURIs.length + 2) }}
      </button>
      <div class="form-group">
        <div class="form-item">
          <ToggleButton v-model:value="enableMaxSeconds" />
          <div class="form-item-small-label">{{ t.toPrefix }}</div>
          <input
            ref="maxSeconds"
            :value="researchSettings.maxSeconds"
            class="number"
            type="number"
            min="1"
            :disabled="!enableMaxSeconds"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart()">
          {{ t.startResearch }}
        </button>
        <button data-hotkey="Escape" @click="onCancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import api from "@/renderer/ipc/api";
import {
  defaultResearchSettings,
  ResearchSettings,
  validateResearchSettings,
} from "@/common/settings/research";
import { USIEngineLabel, USIEngines } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { onBeforeUnmount, onMounted, ref } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { readInputAsNumber } from "@/renderer/helpers/form";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";

const store = useStore();
const busyState = useBusyState();
const dialog = ref();
const researchSettings = ref(defaultResearchSettings());
const engines = ref(new USIEngines());
const engineURI = ref("");
const secondaryEngineURIs = ref([] as string[]);
const enableMaxSeconds = ref(false);
const maxSeconds = ref();

busyState.retain();

onMounted(async () => {
  showModalDialog(dialog.value, onCancel);
  installHotKeyForDialog(dialog.value);
  try {
    researchSettings.value = await api.loadResearchSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = researchSettings.value.usi?.uri || "";
    secondaryEngineURIs.value =
      researchSettings.value.secondaries?.map((engine) => engine.usi?.uri || "") || [];
    enableMaxSeconds.value = researchSettings.value.enableMaxSeconds;
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
  const engine = engines.value.getEngine(engineURI.value);
  const secondaries = [];
  for (const uri of secondaryEngineURIs.value) {
    const secondary = engines.value.getEngine(uri);
    secondaries.push({
      usi: secondary,
    });
  }
  const researchSettings: ResearchSettings = {
    usi: engine,
    secondaries: secondaries,
    enableMaxSeconds: enableMaxSeconds.value,
    maxSeconds: readInputAsNumber(maxSeconds.value),
  };
  const e = validateResearchSettings(researchSettings);
  if (e) {
    useErrorStore().add(e);
    return;
  }
  store.startResearch(researchSettings);
};

const onCancel = () => {
  store.closeResearchDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};
</script>

<style scoped>
.root {
  width: 450px;
}
.remove-button {
  margin-top: 5px;
}
input.number {
  text-align: right;
  width: 80px;
}
</style>
