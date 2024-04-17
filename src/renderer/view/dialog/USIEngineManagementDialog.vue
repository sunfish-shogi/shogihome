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
          <div v-if="setting.engineList.length === 0" class="engine">
            {{ t.noEngineRegistered }}
          </div>
          <div
            v-for="engine in engines"
            :key="engine.uri"
            class="row engine"
            :class="{ hidden: !engine.visible }"
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
                  @change="(value) => changeLabel(engine.uri, USIEngineLabel.GAME, value)"
                />
                <CheckBox
                  :value="!!engine.labels[USIEngineLabel.RESEARCH]"
                  :label="t.research"
                  :height="18"
                  @change="(value) => changeLabel(engine.uri, USIEngineLabel.RESEARCH, value)"
                />
                <CheckBox
                  :value="!!engine.labels[USIEngineLabel.MATE]"
                  :label="t.mateSearch"
                  :height="18"
                  @change="(value) => changeLabel(engine.uri, USIEngineLabel.MATE, value)"
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
      <button class="wide" @click="add()">{{ t.add }}</button>
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
  <USIEngineOptionDialog
    v-if="optionDialog"
    :latest-engine-setting="optionDialog"
    @ok="optionOk"
    @cancel="optionCancel"
  />
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import { filter as filterString } from "@/common/helpers/string";
import api from "@/renderer/ipc/api";
import {
  duplicateEngineSetting,
  USIEngineSetting,
  USIEngineSettings,
  USIEngineLabel,
} from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { ref, onMounted, onBeforeUnmount, computed, onUpdated } from "vue";
import USIEngineOptionDialog from "@/renderer/view/dialog/USIEngineOptionDialog.vue";
import CheckBox from "@/renderer/view/primitive/CheckBox.vue";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useAppSetting } from "@/renderer/store/setting";

const store = useStore();
const dialog = ref();
const optionDialog = ref(null as USIEngineSetting | null);
const setting = ref(new USIEngineSettings());
const filter = ref();
const filterWords = ref([] as string[]);
const lastAdded = ref("");
let scrollTo = "";

store.retainBussyState();

onMounted(async () => {
  showModalDialog(dialog.value, cancel);
  installHotKeyForDialog(dialog.value);
  try {
    setting.value = await api.loadUSIEngineSetting();
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

onUpdated(() => {
  if (scrollTo) {
    const element = dialog.value.querySelector(`[value="${scrollTo}"]`);
    element?.scrollIntoView({ behavior: "auto", block: "nearest" });
    scrollTo = "";
  }
});

const engines = computed(() =>
  setting.value.engineList.map((engine) => {
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
    store.retainBussyState();
    const path = await api.showSelectUSIEngineDialog();
    if (!path) {
      return;
    }
    const appSetting = useAppSetting();
    const timeoutSeconds = appSetting.engineTimeoutSeconds;
    const engine = await api.getUSIEngineInfo(path, timeoutSeconds);
    setting.value.addEngine(engine);
    lastAdded.value = scrollTo = engine.uri;
  } catch (e) {
    store.pushError(e);
  } finally {
    store.releaseBussyState();
  }
};

const remove = (uri: string) => {
  setting.value.removeEngine(uri);
};

const changeLabel = (uri: string, label: USIEngineLabel, value: boolean) => {
  const engine = setting.value.getEngine(uri) as USIEngineSetting;
  engine.labels = {
    ...engine.labels,
    [label]: value,
  };
};

const openOptions = (uri: string) => {
  optionDialog.value = setting.value.getEngine(uri) as USIEngineSetting;
};

const duplicate = (uri: string) => {
  const src = setting.value.getEngine(uri) as USIEngineSetting;
  const engine = duplicateEngineSetting(src);
  setting.value.addEngine(engine);
  lastAdded.value = scrollTo = engine.uri;
};

const saveAndClose = async () => {
  try {
    store.retainBussyState();
    await api.saveUSIEngineSetting(setting.value as USIEngineSettings);
    store.destroyModalDialog();
  } catch (e) {
    store.pushError(e);
  } finally {
    store.releaseBussyState();
  }
};

const cancel = () => {
  store.closeModalDialog();
};

const optionOk = (engine: USIEngineSetting) => {
  setting.value.updateEngine(engine);
  optionDialog.value = null;
};

const optionCancel = () => {
  optionDialog.value = null;
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
