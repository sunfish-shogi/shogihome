<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">{{ t.research }}</div>
      <div class="form-group">
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :default-tag="getPredefinedUSIEngineTag('research')"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
      </div>
      <div v-for="(_, index) in secondaryEngineURIs" :key="index" class="form-group">
        <PlayerSelector
          v-model:player-uri="secondaryEngineURIs[index]"
          :engines="engines"
          :default-tag="getPredefinedUSIEngineTag('research')"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
        <button class="remove-button" @click="secondaryEngineURIs.splice(index, 1)">
          {{ t.remove }}
        </button>
      </div>
      <div v-if="cpuUsage > 1.0" class="form-group danger">
        {{ t.totalNumberOfThreadsExceedsNPercentOfCpuCores(100) }}
      </div>
      <div v-else-if="cpuUsage > 0.75" class="form-group warning">
        {{ t.totalNumberOfThreadsExceedsNPercentOfCpuCores(75) }}
      </div>
      <div v-if="memoryUsage > 1.0" class="form-group danger">
        {{ t.totalUSIHashExceedsNPercentOfMemory(100) }}
      </div>
      <div v-else-if="memoryUsage > 0.9" class="form-group warning">
        {{ t.totalUSIHashExceedsNPercentOfMemory(90) }}
      </div>
      <button class="center thin" @click="secondaryEngineURIs.push('')">
        <Icon :icon="IconType.ADD" />
        {{ t.addNthEngine(secondaryEngineURIs.length + 2) }}
      </button>
      <div class="form-group">
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.timePerPosition }}</div>
          <ToggleButton v-model:value="researchSettings.enableMaxSeconds" />
          <input
            v-model.number="researchSettings.maxSeconds"
            class="number"
            type="number"
            min="1"
            :disabled="!researchSettings.enableMaxSeconds"
          />
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.suggestionsCount }}</div>
          <ToggleButton v-model:value="researchSettings.overrideMultiPV" />
          <input
            v-model.number="researchSettings.multiPV"
            class="number"
            type="number"
            min="1"
            :disabled="!researchSettings.overrideMultiPV"
          />
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
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import {
  defaultResearchSettings,
  ResearchSettings,
  validateResearchSettings,
} from "@/common/settings/research";
import {
  getPredefinedUSIEngineTag,
  getUSIEngineOptionCurrentValue,
  getUSIEngineThreads,
  USIEngines,
  USIHash,
} from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { computed, onMounted, ref } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";
import { MachineSpec } from "@/common/advanced/monitor";

const store = useStore();
const busyState = useBusyState();
const researchSettings = ref(defaultResearchSettings());
const engines = ref(new USIEngines());
const engineURI = ref("");
const secondaryEngineURIs = ref([] as string[]);
const machineSpec = ref<MachineSpec>({ cpuCores: 0, memory: 0 });

busyState.retain();

onMounted(async () => {
  try {
    researchSettings.value = await api.loadResearchSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = researchSettings.value.usi?.uri || "";
    secondaryEngineURIs.value =
      researchSettings.value.secondaries?.map((engine) => engine.usi?.uri || "") || [];
    machineSpec.value = await api.getMachineSpec();
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const cpuUsage = computed(() => {
  let threadsSum = 0;
  for (const uri of [engineURI.value, ...secondaryEngineURIs.value]) {
    const engine = engines.value.getEngine(uri);
    if (!engine) {
      continue;
    }
    const threads = getUSIEngineThreads(engine);
    if (typeof threads === "number") {
      threadsSum += threads;
    }
  }
  return threadsSum / machineSpec.value.cpuCores;
});

const memoryUsage = computed(() => {
  let usiHashSum = 0;
  for (const uri of [engineURI.value, ...secondaryEngineURIs.value]) {
    const engine = engines.value.getEngine(uri);
    if (!engine) {
      continue;
    }
    const usiHash = getUSIEngineOptionCurrentValue(engine.options[USIHash]);
    if (typeof usiHash === "number") {
      usiHashSum += usiHash;
    }
  }
  return (usiHashSum * 1024) / machineSpec.value.memory;
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
  const newSettings: ResearchSettings = {
    ...researchSettings.value,
    usi: engine,
    secondaries: secondaries,
  };
  const e = validateResearchSettings(newSettings);
  if (e) {
    useErrorStore().add(e);
    return;
  }
  store.startResearch(newSettings);
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
