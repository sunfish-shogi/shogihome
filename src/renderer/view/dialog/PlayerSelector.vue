<template>
  <div>
    <div class="root">
      <select ref="playerSelect" v-model="selectedPlayerURI" class="player-select" size="1">
        <option v-if="containsHuman" :value="uri.ES_HUMAN">{{ t.human }}</option>
        <option v-for="engine in filteredEngines.engineList" :key="engine.uri" :value="engine.uri">
          {{ engine.name }}
        </option>
        <option
          v-for="playerURI in containsBasicEngines && uri.ES_BASIC_ENGINE_LIST"
          :key="playerURI"
          :value="playerURI"
        >
          {{ uri.basicEngineName(playerURI) }}
        </option>
      </select>
      <div v-if="displayPonderState" class="row player-info">
        <span class="player-info-key">{{ t.ponder }}:</span>
        <span class="player-info-value">{{ ponderState || "---" }}</span>
      </div>
      <div v-if="displayThreadState" class="row player-info">
        <span class="player-info-key">{{ t.numberOfThreads }}:</span>
        <span class="player-info-value">{{ threadState || "---" }}</span>
      </div>
      <div v-if="displayMultiPvState" class="row player-info">
        <span class="player-info-key">{{ t.suggestionsCount }}:</span>
        <span class="player-info-value">{{ multiPVState || "---" }}</span>
      </div>
      <button
        v-if="enableEditButton"
        class="player-settings"
        :disabled="!isPlayerSettingsEnabled"
        @click="openPlayerSettings"
      >
        <Icon :icon="IconType.SETTINGS" />
        <span>{{ t.settings }}</span>
      </button>
    </div>
  </div>
  <USIEngineOptionsDialog
    v-if="engineOptionsDialog"
    :latest="engineOptionsDialog"
    :ok-button-text="t.save"
    @ok="savePlayerSettings"
    @cancel="closePlayerSettings"
  />
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { computed, PropType, ref } from "vue";
import * as uri from "@/common/uri.js";
import Icon from "@/renderer/view/primitive/Icon.vue";
import USIEngineOptionsDialog from "@/renderer/view/dialog/USIEngineOptionsDialog.vue";
import { IconType } from "@/renderer/assets/icons";
import {
  getUSIEngineOptionCurrentValue,
  USIEngine,
  ImmutableUSIEngines,
  USIPonder,
  USIEngines,
  USIEngineLabel,
  getUSIEngineThreads,
  getUSIEngineMultiPV,
} from "@/common/settings/usi";
import api from "@/renderer/ipc/api";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";

const selectedPlayerURI = defineModel<string>("playerUri", { required: true });

const props = defineProps({
  containsHuman: {
    type: Boolean,
    default: false,
  },
  containsBasicEngines: {
    type: Boolean,
    default: false,
  },
  engines: {
    type: Object as PropType<ImmutableUSIEngines>,
    required: true,
  },
  filterLabel: {
    type: String as PropType<USIEngineLabel>,
    default: null,
  },
  displayPonderState: {
    type: Boolean,
    default: false,
  },
  displayThreadState: {
    type: Boolean,
    default: false,
  },
  displayMultiPvState: {
    type: Boolean,
    default: false,
  },
  enableEditButton: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits<{
  selectPlayer: [uri: string];
  updateEngines: [usiEngines: USIEngines];
}>();

const busyState = useBusyState();
const engineOptionsDialog = ref(null as USIEngine | null);

const filteredEngines = computed(() => {
  return props.filterLabel ? props.engines.filterByLabel(props.filterLabel) : props.engines;
});

const ponderState = computed(() => {
  if (!uri.isUSIEngine(selectedPlayerURI.value)) {
    return null;
  }
  const engine = filteredEngines.value.getEngine(selectedPlayerURI.value);
  return engine && getUSIEngineOptionCurrentValue(engine.options[USIPonder]) === "true"
    ? "ON"
    : "OFF";
});

const threadState = computed(() => {
  if (!uri.isUSIEngine(selectedPlayerURI.value)) {
    return null;
  }
  const engine = filteredEngines.value.getEngine(selectedPlayerURI.value);
  if (!engine) {
    return null;
  }
  const threads = getUSIEngineThreads(engine);
  return threads;
});

const multiPVState = computed(() => {
  if (!uri.isUSIEngine(selectedPlayerURI.value)) {
    return null;
  }
  const engine = filteredEngines.value.getEngine(selectedPlayerURI.value);
  if (!engine) {
    return null;
  }
  const multiPV = getUSIEngineMultiPV(engine);
  return multiPV;
});

const isPlayerSettingsEnabled = computed(() => {
  return uri.isUSIEngine(selectedPlayerURI.value);
});

const openPlayerSettings = () => {
  if (uri.isUSIEngine(selectedPlayerURI.value)) {
    const engine = filteredEngines.value.getEngine(selectedPlayerURI.value);
    if (!engine) {
      useErrorStore().add("利用可能なエンジンが選択されていません。");
      return;
    }
    engineOptionsDialog.value = engine;
  }
};

const savePlayerSettings = async (settings: USIEngine) => {
  engineOptionsDialog.value = null;
  const clone = props.engines.getClone();
  clone.updateEngine(settings);
  busyState.retain();
  try {
    await api.saveUSIEngines(clone);
    emit("updateEngines", clone);
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const closePlayerSettings = () => {
  engineOptionsDialog.value = null;
};
</script>

<style scoped>
.root {
  width: 100%;
}
.player-select {
  width: 100%;
  margin-bottom: 5px;
}
.player-info {
  line-height: 1.3em;
  font-size: 0.8em;
}
.player-info-key {
  width: 110px;
  height: 100%;
  text-align: left;
  vertical-align: baseline;
}
.player-info-value {
  height: 100%;
  text-align: left;
  vertical-align: baseline;
}
.player-settings {
  margin: 5px auto 0px auto;
}
</style>
