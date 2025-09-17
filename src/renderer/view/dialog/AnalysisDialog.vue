<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">{{ t.recordAnalysis }}</div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :default-tag="getPredefinedUSIEngineTag('research')"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
      </div>
      <div class="form-group">
        <div>{{ t.startEndCriteria }}</div>
        <div class="form-item">
          <ToggleButton v-model:value="settings.startCriteria.enableNumber" />
          <div class="form-item-small-label">{{ t.fromPrefix }}{{ t.plyPrefix }}</div>
          <input
            v-model.number="settings.startCriteria.number"
            class="small"
            type="number"
            min="1"
            step="1"
            :disabled="!settings.startCriteria.enableNumber"
          />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.fromSuffix }}</div>
        </div>
        <div class="form-item">
          <ToggleButton v-model:value="settings.endCriteria.enableNumber" />
          <div class="form-item-small-label">{{ t.toPrefix }}{{ t.plyPrefix }}</div>
          <input
            v-model.number="settings.endCriteria.number"
            class="small"
            type="number"
            min="1"
            step="1"
            :disabled="!settings.endCriteria.enableNumber"
          />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.toSuffix }}</div>
        </div>
        <div class="form-item">
          <ToggleButton v-model:value="settings.descending" :label="t.descending" />
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.endCriteria1Move }}</div>
        <div class="form-item">
          <div class="form-item-small-label">{{ t.toPrefix }}</div>
          <input
            v-model.number="settings.perMoveCriteria.maxSeconds"
            class="small"
            type="number"
            min="0"
            step="1"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.outputSettings }}</div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.moveComments }}</div>
          <HorizontalSelector
            v-model:value="settings.commentBehavior"
            class="selector"
            :items="[
              { value: CommentBehavior.NONE, label: t.noOutputs },
              { value: CommentBehavior.INSERT, label: t.insertCommentToTop },
              { value: CommentBehavior.APPEND, label: t.appendCommentToBottom },
              { value: CommentBehavior.OVERWRITE, label: t.overwrite },
            ]"
          />
        </div>
      </div>
      <div class="main-buttons">
        <!-- 1行目 -->
        <div class="button-row">
          <button data-hotkey="Enter" autofocus @click="onStart()">
            {{ t.analyze }}
          </button>
        <button @click="onAnalyzeFolder()">
            連続解析開始
        </button>
        <button data-hotkey="Escape" @click="onCancel()">
          {{ t.cancel }}
        </button>
  </div>

  <!-- 2行目 -->
  <div class="button-row">
    <button @click="onSelectFolder()">
      フォルダ選択
    </button>
    <span v-if="selectedDir" class="selected-dir">
      {{ selectedDir }}
    </span>
  </div>
</div>

    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import { defaultAnalysisSettings, validateAnalysisSettings } from "@/common/settings/analysis";
import { CommentBehavior } from "@/common/settings/comment";
import { getPredefinedUSIEngineTag, USIEngines } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { onMounted, ref } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";

const store = useStore();
const busyState = useBusyState();
const settings = ref(defaultAnalysisSettings());
const engines = ref(new USIEngines());
const engineURI = ref("");

busyState.retain();

onMounted(async () => {
  try {
    settings.value = await api.loadAnalysisSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = settings.value.usi?.uri || "";
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

const onStart = () => {
  if (!engineURI.value || !engines.value.hasEngine(engineURI.value)) {
    useErrorStore().add(t.engineNotSelected);
    return;
  }
  const engine = engines.value.getEngine(engineURI.value);
  const newSettings = {
    ...settings.value,
    usi: engine,
  };
  const error = validateAnalysisSettings(newSettings);
  if (error) {
    useErrorStore().add(error);
    return;
  }
  store.startAnalysis(newSettings);
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};
//@LoveKapibarasan
const selectedDir = ref<string>("");

const onSelectFolder = async () => {
  try {
    const dir = await api.showSelectDirectoryDialog();
    if (dir) {
      selectedDir.value = dir;
    }
  } catch (e) {
    useErrorStore().add(e);
  }
};

const onAnalyzeFolder = async () => {
  try {
    const engine = engines.value.getEngine(engineURI.value);
    if (!engine) {
      useErrorStore().add(t.engineNotSelected);
      return;
    }

    const newSettings = {
      ...settings.value,
      usi: engine,
    };

    // store 側の batchAnalysis を呼び出す
    await store.startBatchAnalysis(newSettings, selectedDir.value);

  } catch (e) {
    useErrorStore().add(e);
  }
};

//=====
</script>

<style scoped>
.root {
  width: 420px;
}
input.toggle {
  height: 1em;
  width: 1em;
  margin-right: 10px;
}
input.small {
  width: 50px;
}
.selector {
  max-width: 210px;
}

.main-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.button-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-dir {
  font-size: 0.9em;
  color: #555;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
