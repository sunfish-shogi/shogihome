<template>
  <DialogFrame limited @cancel="onCancel">
    <div class="title">{{ t.recordAnalysis }}</div>
    <div v-if="isNative()" class="form-item center selector-item">
      <HorizontalSelector
        v-model:value="target"
        :items="[
          { label: t.currentRecord, value: 'record' },
          { label: t.folder, value: 'batch' },
        ]"
      />
    </div>
    <div ref="scrollContainer" class="form-group scroll">
      <div v-show="isNative() && target === 'batch'" class="form-group warning">
        <div class="note">{{ t.analyzedRecordFilesWillBeOverwritten }}</div>
      </div>
      <div v-show="isNative() && target === 'batch'" class="form-group">
        <div class="form-item row">
          <input v-model="batchSettings.source" class="grow" type="text" />
          <button class="thin" @click="selectSourceDirectory">
            {{ t.select }}
          </button>
          <button class="thin open-dir" @click="openDirectory(batchSettings.source)">
            <Icon :icon="IconType.OPEN_FOLDER" />
          </button>
        </div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.formats }}</div>
          <div class="formats">
            <ToggleButton v-model:value="sourceFormats.kif" class="toggle" label=".kif" />
            <ToggleButton v-model:value="sourceFormats.kifu" class="toggle" label=".kifu" />
            <ToggleButton v-model:value="sourceFormats.ki2" class="toggle" label=".ki2" />
            <ToggleButton v-model:value="sourceFormats.ki2u" class="toggle" label=".ki2u" />
            <ToggleButton v-model:value="sourceFormats.csa" class="toggle" label=".csa" />
            <ToggleButton v-model:value="sourceFormats.jkf" class="toggle" label=".jkf" />
          </div>
        </div>
        <div class="form-item row">
          <div class="form-item-label-wide">{{ t.subdirectories }}</div>
          <ToggleButton v-model:value="batchSettings.subdirectories" class="toggle" />
        </div>
        <div class="form-item row">
          <div class="form-item-label-wide">{{ t.skipAnalyzed }}</div>
          <ToggleButton v-model:value="batchSettings.skipAnalyzed" class="toggle" />
        </div>
      </div>
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
          <div v-show="target === 'record'" class="form-item-small-label">
            ({{ t.totalMoves }}: {{ totalMoves }})
          </div>
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
    </div>
    <div class="main-buttons">
      <button data-hotkey="Enter" autofocus @click="onStart()">
        {{ t.analyze }}
      </button>
      <button data-hotkey="Escape" @click="onCancel()">
        {{ t.cancel }}
      </button>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api, { isNative } from "@/renderer/ipc/api";
import { RecordFileFormat } from "@/common/file/record";
import { defaultAnalysisSettings, validateAnalysisSettings } from "@/common/settings/analysis";
import {
  defaultBatchAnalysisSettings,
  validateBatchAnalysisSettings,
} from "@/common/settings/batch_analysis";
import { CommentBehavior } from "@/common/settings/comment";
import { getPredefinedUSIEngineTag, USIEngines } from "@/common/settings/usi";
import { AnalysisDialogTarget, useStore } from "@/renderer/store";
import { computed, onMounted, ref, watch } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import DialogFrame from "./DialogFrame.vue";
import { Move } from "tsshogi";

const store = useStore();
const busyState = useBusyState();
const target = ref<AnalysisDialogTarget>("record");
const scrollContainer = ref<HTMLElement>();
const settings = ref(defaultAnalysisSettings());
const batchSettings = ref(defaultBatchAnalysisSettings());
const engines = ref(new USIEngines());
const engineURI = ref("");
const sourceFormats = ref({
  kif: false,
  kifu: false,
  ki2: false,
  ki2u: false,
  csa: false,
  jkf: false,
});
const totalMoves = computed(() => {
  const moves = store.record.moves;
  const lastMove = moves[moves.length - 1];
  return lastMove.ply === 0 ? 0 : lastMove.move instanceof Move ? lastMove.ply : lastMove.ply - 1;
});

busyState.retain();

onMounted(async () => {
  try {
    settings.value = await api.loadAnalysisSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = settings.value.usi?.uri || "";
    if (isNative()) {
      target.value = store.analysisDialogTarget;
      batchSettings.value = await api.loadBatchAnalysisSettings();
      const sf = batchSettings.value.sourceFormats;
      sourceFormats.value = {
        kif: sf.includes(RecordFileFormat.KIF),
        kifu: sf.includes(RecordFileFormat.KIFU),
        ki2: sf.includes(RecordFileFormat.KI2),
        ki2u: sf.includes(RecordFileFormat.KI2U),
        csa: sf.includes(RecordFileFormat.CSA),
        jkf: sf.includes(RecordFileFormat.JKF),
      };
    }
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

watch(target, () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0;
  }
});

const selectSourceDirectory = async () => {
  busyState.retain();
  try {
    const path = await api.showSelectDirectoryDialog(batchSettings.value.source);
    if (path) {
      batchSettings.value.source = path;
    }
  } catch (e) {
    useErrorStore().add(e);
  } finally {
    busyState.release();
  }
};

const openDirectory = (path: string) => {
  api.openExplorer(path);
};

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
  if (target.value === "batch") {
    const newBatchSettings = {
      ...batchSettings.value,
      sourceFormats: Object.entries({
        [RecordFileFormat.KIF]: sourceFormats.value.kif,
        [RecordFileFormat.KIFU]: sourceFormats.value.kifu,
        [RecordFileFormat.KI2]: sourceFormats.value.ki2,
        [RecordFileFormat.KI2U]: sourceFormats.value.ki2u,
        [RecordFileFormat.CSA]: sourceFormats.value.csa,
        [RecordFileFormat.JKF]: sourceFormats.value.jkf,
      })
        .filter(([, value]) => value)
        .map(([key]) => key as RecordFileFormat),
    };
    const batchError = validateBatchAnalysisSettings(newBatchSettings);
    if (batchError) {
      useErrorStore().add(batchError);
      return;
    }
    store.startBatchAnalysis(newBatchSettings, newSettings);
  } else {
    store.startAnalysis(newSettings);
  }
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};
</script>

<style scoped>
.form-group:not(.scroll) {
  min-width: 480px;
}
.selector-item {
  margin: 0 !important;
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
.formats {
  display: inline-block;
  max-width: 300px;
}
.formats .toggle {
  margin-right: 10px;
}
button.open-dir {
  margin-left: 5px;
  padding-left: 8px;
  padding-right: 8px;
}
</style>
