<template>
  <div>
    <dialog ref="dialog">
      <div class="title">{{ t.engineManagement }}</div>
      <div class="form-group">
        <div class="engine-filter">
          <input
            ref="filter"
            class="filter"
            :placeholder="t.filterByEngineName"
            @input="updateFilter"
          />
        </div>
        <div class="column engine-list">
          <div v-if="usiEngines.engineList.length === 0" class="engine">
            {{ t.noEngineRegistered }}
          </div>
          <div
            v-for="engine in engines"
            v-show="engine.visible"
            :key="engine.uri"
            class="row engine"
            :value="engine.uri"
          >
            <div class="column">
              <div class="engine-name" :class="{ highlight: engine.uri === lastAdded }">
                {{ engine.name }}
              </div>
              <div class="row labels">
                <CheckBox
                  :value="!!engine.labels[USIEngineLabel.GAME]"
                  :label="t.game"
                  :height="18"
                  @update:value="(value) => changeLabel(engine.uri, USIEngineLabel.GAME, value)"
                />
                <CheckBox
                  :value="!!engine.labels[USIEngineLabel.RESEARCH]"
                  :label="t.research"
                  :height="18"
                  @update:value="(value) => changeLabel(engine.uri, USIEngineLabel.RESEARCH, value)"
                />
                <CheckBox
                  :value="!!engine.labels[USIEngineLabel.MATE]"
                  :label="t.mateSearch"
                  :height="18"
                  @update:value="(value) => changeLabel(engine.uri, USIEngineLabel.MATE, value)"
                />
              </div>
            </div>
            <div class="column space-evenly">
              <div class="row space-evenly">
                <button @click="openOptions(engine.uri)">{{ t.config }}</button>
                <button @click="duplicate(engine.uri)">{{ t.duplicate }}</button>
                <button @click="remove(engine.uri)">{{ t.remove }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu row">
        <button class="wide" @click="add()">{{ t.add }}</button>
        <button class="wide" @click="openMerge()">{{ t.compareAndMerge }}</button>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="saveAndClose()">
          {{ t.saveAndClose }}
        </button>
        <button data-hotkey="Escape" @click="cancel()">
          {{ t.cancel }}
        </button>
      </div>
    </dialog>
  </div>
  <USIEngineOptionsDialog
    v-if="optionDialog"
    :latest="optionDialog"
    @ok="optionOk"
    @cancel="optionCancel"
  />
  <USIEngineMergeDialog
    v-if="mergeDialog"
    :engines="usiEngines"
    @ok="mergeOk"
    @cancel="mergeCancel"
  />
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { filter as filterString } from "@/common/helpers/string";
import api from "@/renderer/ipc/api";
import {
  duplicateEngine,
  USIEngine,
  USIEngines,
  USIEngineLabel,
  ImmutableUSIEngines,
} from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { ref, onMounted, onBeforeUnmount, computed, onUpdated } from "vue";
import USIEngineOptionsDialog from "@/renderer/view/dialog/USIEngineOptionsDialog.vue";
import CheckBox from "@/renderer/view/primitive/CheckBox.vue";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useAppSettings } from "@/renderer/store/settings";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import USIEngineMergeDialog from "./USIEngineMergeDialog.vue";

const store = useStore();
const busyState = useBusyState();
const dialog = ref();
const optionDialog = ref(null as USIEngine | null);
const mergeDialog = ref(false);
const usiEngines = ref(new USIEngines());
const filter = ref();
const filterWords = ref([] as string[]);
const lastAdded = ref("");
let scrollTo = "";

busyState.retain();

onMounted(async () => {
  showModalDialog(dialog.value, cancel);
  installHotKeyForDialog(dialog.value);
  try {
    usiEngines.value = await api.loadUSIEngines();
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

onUpdated(() => {
  if (scrollTo) {
    const element = dialog.value.querySelector(`[value="${scrollTo}"]`);
    element?.scrollIntoView({ behavior: "auto", block: "nearest" });
    scrollTo = "";
  }
});

const engines = computed(() =>
  usiEngines.value.engineList.map((engine) => {
    return {
      uri: engine.uri,
      name: engine.name,
      labels: engine.labels || {},
      visible:
        filterWords.value.length == 0 ||
        filterString(engine.name, filterWords.value) ||
        filterString(engine.defaultName, filterWords.value),
    };
  }),
);

const updateFilter = () => {
  filterWords.value = String(filter.value.value)
    .trim()
    .split(/ +/)
    .filter((s) => s);
};

const add = async () => {
  try {
    busyState.retain();
    const path = await api.showSelectUSIEngineDialog();
    if (!path) {
      return;
    }
    const appSettings = useAppSettings();
    const timeoutSeconds = appSettings.engineTimeoutSeconds;
    const engine = await api.getUSIEngineInfo(path, timeoutSeconds);
    usiEngines.value.addEngine(engine);
    lastAdded.value = scrollTo = engine.uri;
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const remove = (uri: string) => {
  usiEngines.value.removeEngine(uri);
};

const changeLabel = (uri: string, label: USIEngineLabel, value: boolean) => {
  const engine = usiEngines.value.getEngine(uri) as USIEngine;
  engine.labels = {
    ...engine.labels,
    [label]: value,
  };
};

const openOptions = (uri: string) => {
  optionDialog.value = usiEngines.value.getEngine(uri) as USIEngine;
};

const openMerge = () => {
  mergeDialog.value = true;
};

const duplicate = (uri: string) => {
  const src = usiEngines.value.getEngine(uri) as USIEngine;
  const engine = duplicateEngine(src);
  usiEngines.value.addEngine(engine);
  lastAdded.value = scrollTo = engine.uri;
};

const saveAndClose = async () => {
  try {
    busyState.retain();
    await api.saveUSIEngines(usiEngines.value as USIEngines);
    store.destroyModalDialog();
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const cancel = () => {
  store.closeModalDialog();
};

const optionOk = (engine: USIEngine) => {
  usiEngines.value.updateEngine(engine);
  optionDialog.value = null;
};

const optionCancel = () => {
  optionDialog.value = null;
};

const mergeOk = (engines: ImmutableUSIEngines) => {
  usiEngines.value = engines.getClone();
  mergeDialog.value = false;
};

const mergeCancel = () => {
  mergeDialog.value = false;
};
</script>

<style scoped>
.engine-list {
  width: 740px;
  height: calc(100vh - 250px);
  max-height: 600px;
  overflow: auto;
}
.engine-filter {
  margin: 0px 5px 5px 5px;
}
.filter {
  width: 100%;
}
.menu > *:not(:first-child) {
  margin-left: 5px;
}
.engine {
  margin: 0px 5px 0px 5px;
  padding: 5px;
  border-bottom: 1px solid gray;
}
.highlight {
  font-weight: bold;
}
.engine-name {
  text-align: left;
  width: 450px;
  margin-top: 5px;
  margin-right: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.labels > * {
  margin-top: 3px;
}
.labels > *:not(:first-child) {
  margin-left: 20px;
}
</style>
